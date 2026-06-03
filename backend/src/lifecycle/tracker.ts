import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getConnection } from '../rpc/solana';
import { jitoBundleSubmitter } from '../jito/bundleSubmitter';
import {
  saveBundleState,
  getBundleState,
  appendLifecycleLog,
  appendTipHistory,
  LifecycleLogEntry,
  TipHistoryEntry,
} from '../redis/client';
import { EventEmitter } from 'events';

export interface LifecycleStage {
  stage: 'submitted' | 'processed' | 'confirmed' | 'finalized' | 'failed';
  slot: number;
  timestamp: number;
}

export interface TrackedBundle {
  bundleId: string;
  bundleNumber: number;
  tipSol: number;
  agentReasoning: string;
  agentConfidence: number;
  agentStrategy: string;
  submittedSlot: number;
  submittedAt: number;
  stages: LifecycleStage[];
  retryCount: number;
  retryTipSol?: number;
  failureType?: string;
  failureReason?: string;
  postMortem?: string;
  outcome: 'pending' | 'landed' | 'failed' | 'retried';
}

class LifecycleTracker extends EventEmitter {
  private activeBundles = new Map<string, TrackedBundle>();
  private pollingIntervals = new Map<string, NodeJS.Timeout>();

  async trackBundle(
    bundleId: string,
    bundleNumber: number,
    tipSol: number,
    agentReasoning: string,
    agentConfidence: number,
    agentStrategy: string,
    submittedSlot: number
  ): Promise<void> {
    const bundle: TrackedBundle = {
      bundleId,
      bundleNumber,
      tipSol,
      agentReasoning,
      agentConfidence,
      agentStrategy,
      submittedSlot,
      submittedAt: Date.now(),
      stages: [{ stage: 'submitted', slot: submittedSlot, timestamp: Date.now() }],
      retryCount: 0,
      outcome: 'pending',
    };

    this.activeBundles.set(bundleId, bundle);
    await saveBundleState(bundleId, bundle);
    this.emit('stageUpdate', bundle);

    logger.info(`📦 Tracking bundle #${bundleNumber}: ${bundleId}`, { slot: submittedSlot, tip: tipSol });

    // Start polling for lifecycle progression
    this.startPolling(bundleId);
  }

  private startPolling(bundleId: string): void {
    let pollCount = 0;
    const maxPolls = 60; // ~2 minutes max

    const interval = setInterval(async () => {
      pollCount++;
      const bundle = this.activeBundles.get(bundleId);
      if (!bundle || bundle.outcome !== 'pending') {
        clearInterval(interval);
        this.pollingIntervals.delete(bundleId);
        return;
      }

      if (pollCount >= maxPolls) {
        clearInterval(interval);
        await this.markFailed(bundleId, 'TIMEOUT', 'Bundle tracking timed out after 2 minutes');
        return;
      }

      await this.checkBundleProgress(bundleId);
    }, 2000); // Poll every 2s

    this.pollingIntervals.set(bundleId, interval);
  }

  private async checkBundleProgress(bundleId: string): Promise<void> {
    const bundle = this.activeBundles.get(bundleId);
    if (!bundle) return;

    try {
      const status = await jitoBundleSubmitter.checkBundleStatus(bundleId);
      const conn = getConnection('confirmed');
      const currentSlot = await conn.getSlot('confirmed');

      if (status.status === 'landed' && status.slot) {
        // Check commitment progression
        const stages = bundle.stages.map((s) => s.stage);

        if (!stages.includes('processed')) {
          await this.addStage(bundleId, 'processed', status.slot);
        }

        // Check confirmed
        try {
          const conn2 = getConnection('confirmed');
          const confirmedSlot = await conn2.getSlot('confirmed');
          if (confirmedSlot > (status.slot || 0) && !stages.includes('confirmed')) {
            await this.addStage(bundleId, 'confirmed', confirmedSlot);
          }
        } catch {}

        // Check finalized (32+ slots after confirmed)
        const confirmedStage = bundle.stages.find((s) => s.stage === 'confirmed');
        if (confirmedStage) {
          const slotsSinceConfirmed = currentSlot - confirmedStage.slot;
          if (slotsSinceConfirmed >= 32 && !stages.includes('finalized')) {
            await this.addStage(bundleId, 'finalized', currentSlot);
            await this.markLanded(bundleId);
          }
        }
      } else if (status.status === 'failed') {
        await this.markFailed(bundleId, 'BUNDLE_DROPPED', status.error || 'Bundle failed');
      }

      // Check if blockhash has expired (>150 slots)
      if (bundle.outcome === 'pending') {
        const slotAge = currentSlot - bundle.submittedSlot;
        if (slotAge > 150) {
          await this.markFailed(bundleId, 'EXPIRED_BLOCKHASH', `Blockhash expired after ${slotAge} slots`);
        }
      }
    } catch (err) {
      logger.debug('Bundle status check error', { bundleId, err });
    }
  }

  private async addStage(bundleId: string, stage: LifecycleStage['stage'], slot: number): Promise<void> {
    const bundle = this.activeBundles.get(bundleId);
    if (!bundle) return;

    const stageEntry: LifecycleStage = { stage, slot, timestamp: Date.now() };
    bundle.stages.push(stageEntry);

    await saveBundleState(bundleId, bundle);
    this.emit('stageUpdate', bundle);

    logger.info(`📈 Bundle #${bundle.bundleNumber} → ${stage.toUpperCase()}`, {
      bundleId: bundleId.substring(0, 12) + '...',
      slot,
    });
  }

  private async markLanded(bundleId: string): Promise<void> {
    const bundle = this.activeBundles.get(bundleId);
    if (!bundle) return;

    bundle.outcome = 'landed';
    const interval = this.pollingIntervals.get(bundleId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(bundleId);
    }

    await this.persistLifecycleLog(bundle);
    await this.persistTipHistory(bundle, true);

    this.emit('landed', bundle);
    logger.info(`✅ Bundle #${bundle.bundleNumber} LANDED`, { bundleId });
  }

  async markFailed(bundleId: string, failureType: string, failureReason: string): Promise<void> {
    const bundle = this.activeBundles.get(bundleId);
    if (!bundle) return;

    bundle.outcome = 'failed';
    bundle.failureType = failureType;
    bundle.failureReason = failureReason;

    const interval = this.pollingIntervals.get(bundleId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(bundleId);
    }

    await saveBundleState(bundleId, bundle);
    await this.persistLifecycleLog(bundle);
    await this.persistTipHistory(bundle, false);

    this.emit('failed', bundle);
    logger.warn(`❌ Bundle #${bundle.bundleNumber} FAILED: ${failureType}`, { failureReason });
  }

  async updatePostMortem(bundleId: string, postMortem: string): Promise<void> {
    const bundle = this.activeBundles.get(bundleId);
    if (bundle) {
      bundle.postMortem = postMortem;
      await saveBundleState(bundleId, bundle);
      await this.persistLifecycleLog(bundle);
    }
  }

  async markRetried(bundleId: string, newTipSol: number): Promise<void> {
    const bundle = this.activeBundles.get(bundleId);
    if (bundle) {
      bundle.outcome = 'retried';
      bundle.retryTipSol = newTipSol;
      bundle.retryCount++;
      await saveBundleState(bundleId, bundle);
      this.emit('retried', bundle);
    }
  }

  private async persistLifecycleLog(bundle: TrackedBundle): Promise<void> {
    const submitted = bundle.stages.find((s) => s.stage === 'submitted');
    const processed = bundle.stages.find((s) => s.stage === 'processed');
    const confirmed = bundle.stages.find((s) => s.stage === 'confirmed');
    const finalized = bundle.stages.find((s) => s.stage === 'finalized');

    const deltaProcessedConfirmed =
      processed && confirmed ? confirmed.timestamp - processed.timestamp : undefined;
    const deltaConfirmedFinalized =
      confirmed && finalized ? finalized.timestamp - confirmed.timestamp : undefined;
    const totalLatency =
      submitted && (finalized || confirmed || processed)
        ? (finalized || confirmed || processed)!.timestamp - submitted.timestamp
        : undefined;

    const entry: LifecycleLogEntry = {
      bundleId: bundle.bundleId,
      bundleNumber: bundle.bundleNumber,
      submittedAt: bundle.submittedAt,
      submittedSlot: bundle.submittedSlot,
      processedAt: processed?.timestamp,
      processedSlot: processed?.slot,
      confirmedAt: confirmed?.timestamp,
      confirmedSlot: confirmed?.slot,
      finalizedAt: finalized?.timestamp,
      finalizedSlot: finalized?.slot,
      tipSol: bundle.tipSol,
      agentReasoning: bundle.agentReasoning,
      agentConfidence: bundle.agentConfidence,
      agentStrategy: bundle.agentStrategy,
      outcome: bundle.outcome,
      failureType: bundle.failureType,
      failureReason: bundle.failureReason,
      retryCount: bundle.retryCount,
      retryTipSol: bundle.retryTipSol,
      postMortem: bundle.postMortem,
      deltaProcessedConfirmedMs: deltaProcessedConfirmed,
      deltaConfirmedFinalizedMs: deltaConfirmedFinalized,
      totalLatencyMs: totalLatency,
    };

    await appendLifecycleLog(entry);
  }

  private async persistTipHistory(bundle: TrackedBundle, landed: boolean): Promise<void> {
    const confirmedStage = bundle.stages.find((s) => s.stage === 'confirmed');
    const entry: TipHistoryEntry = {
      bundleId: bundle.bundleId,
      tipSol: bundle.tipSol,
      landed,
      failureType: bundle.failureType,
      slot: bundle.submittedSlot,
      latencyMs: confirmedStage ? confirmedStage.timestamp - bundle.submittedAt : undefined,
      timestamp: Date.now(),
      agentConfidence: bundle.agentConfidence,
    };
    await appendTipHistory(entry);
  }

  getActiveBundle(bundleId: string): TrackedBundle | undefined {
    return this.activeBundles.get(bundleId);
  }

  getActiveBundles(): TrackedBundle[] {
    return Array.from(this.activeBundles.values());
  }
}

export const lifecycleTracker = new LifecycleTracker();
