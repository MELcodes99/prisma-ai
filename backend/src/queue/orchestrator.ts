import { config } from '../config';
import { logger } from '../utils/logger';
import { prismaAgent } from '../agent/prismaAgent';
import { jitoTipMonitor } from '../jito/tipMonitor';
import { jitoBundleSubmitter, BundlePayload } from '../jito/bundleSubmitter';
import { lifecycleTracker } from '../lifecycle/tracker';
import { geyserStream } from '../geyser/stream';
import { getConnection, getFreshBlockhash } from '../rpc/solana';
import { incrementBundleCounter } from '../redis/client';
import { getSolPrice } from '../utils/coingecko';
import { getLeaderWindowInfo } from '../rpc/leaderSchedule';
import { EventEmitter } from 'events';

export interface SubmitBundleOptions {
  faultInject?: 'expired_blockhash' | 'low_fee' | null;
  forceStrategy?: string;
  skipLeaderCheck?: boolean;
}

export interface SubmitBundleResult {
  bundleNumber: number;
  bundleId?: string;
  success: boolean;
  tipSol: number;
  agentDecision: any;
  leaderWindow?: any;
  error?: string;
  errorType?: string;
  retried?: boolean;
  finalTipSol?: number;
}

class BundleOrchestrator extends EventEmitter {
  private isSubmitting = false;

  async submitBundle(options: SubmitBundleOptions = {}): Promise<SubmitBundleResult> {
    if (this.isSubmitting) {
      throw new Error('Bundle submission already in progress');
    }
    this.isSubmitting = true;

    try {
      const bundleNumber = await incrementBundleCounter();
      logger.info(`\n${'═'.repeat(60)}`);
      logger.info(`🚀 BUNDLE #${bundleNumber} — PrismaAI Decision Phase`);
      logger.info(`${'═'.repeat(60)}`);

      // ── Step 1: Check leader window ──────────────────────────────
      const leaderWindow = await getLeaderWindowInfo();
      logger.info(`📅 Leader window: ${leaderWindow.reasoning}`);

      if (leaderWindow.recommendation === 'hold' && !options.skipLeaderCheck && !options.faultInject) {
        logger.info('⏸️  Leader check: holding for better window');
        this.isSubmitting = false;
        return {
          bundleNumber,
          success: false,
          tipSol: 0,
          agentDecision: null,
          leaderWindow,
          error: `Holding: ${leaderWindow.reasoning}`,
        };
      }

      // ── Step 2: Gather live network data ─────────────────────────
      const [tipPercentiles, solPrice, currentSlot] = await Promise.all([
        jitoTipMonitor.getPercentiles(),
        getSolPrice(),
        getConnection().getSlot('confirmed'),
      ]);
      const tipVelocity = jitoTipMonitor.getTipVelocity();

      logger.info('📊 Network state', {
        slot: currentSlot,
        p50: tipPercentiles.p50.toFixed(6),
        p75: tipPercentiles.p75.toFixed(6),
        solPrice: `$${solPrice.toFixed(2)}`,
        velocity: tipVelocity.trend,
        leaderJito: leaderWindow.isJitoWindow,
      });

      // ── Step 3: Agent tip decision ───────────────────────────────
      const decision = await prismaAgent.makeSubmissionDecision(
        tipPercentiles,
        tipVelocity,
        solPrice,
        currentSlot
      );

      logger.info(`🤖 Agent: ${decision.recommendedTipSol.toFixed(6)} SOL | ${decision.strategy} | ${(decision.confidence * 100).toFixed(0)}% confidence`);
      logger.info(`💭 ${decision.reasoning}`);

      if (decision.holdForNextWindow && !options.faultInject) {
        logger.info('⏸️  Agent: holding for better window');
        this.isSubmitting = false;
        return {
          bundleNumber,
          success: false,
          tipSol: decision.recommendedTipSol,
          agentDecision: decision,
          leaderWindow,
          error: 'Agent held submission',
        };
      }

      // ── Step 4: Submit bundle ────────────────────────────────────
      const payload: BundlePayload = {
        tipSol: decision.recommendedTipSol,
        faultInject: options.faultInject,
      };

      const result = await jitoBundleSubmitter.submitBundle(payload);

      if (result.success && result.bundleId) {
        // ── Step 5: Track lifecycle ──────────────────────────────
        await lifecycleTracker.trackBundle(
          result.bundleId,
          bundleNumber,
          decision.recommendedTipSol,
          decision.reasoning,
          decision.confidence,
          decision.strategy,
          result.slot
        );

        prismaAgent.resetFailureCount();
        this.emit('bundleSubmitted', { bundleNumber, bundleId: result.bundleId, decision });

        return {
          bundleNumber,
          bundleId: result.bundleId,
          success: true,
          tipSol: decision.recommendedTipSol,
          agentDecision: decision,
          leaderWindow,
        };

      } else {
        // ── Step 6: Failure — agent diagnoses and retries ────────
        logger.warn(`❌ Bundle #${bundleNumber} failed: ${result.errorType}`);

        const failureAnalysis = await prismaAgent.analyzeFailureAndDecideRetry(
          result.errorType || 'UNKNOWN',
          decision.recommendedTipSol,
          `bundle-${bundleNumber}`,
          tipPercentiles,
          currentSlot
        );

        logger.info(`🔍 Diagnosis: ${failureAnalysis.diagnosis}`);
        logger.info(`🔧 Action: ${failureAnalysis.correctiveAction}`);
        logger.info(`💭 Retry reasoning: ${failureAnalysis.reasoning}`);

        // Track the failed bundle
        const fakeBundleId = `failed-${bundleNumber}-${Date.now()}`;
        await lifecycleTracker.trackBundle(
          fakeBundleId, bundleNumber,
          decision.recommendedTipSol, decision.reasoning,
          decision.confidence, decision.strategy, result.slot
        );
        await lifecycleTracker.markFailed(
          fakeBundleId,
          result.errorType || 'UNKNOWN',
          result.error || 'Unknown error'
        );
        await lifecycleTracker.updatePostMortem(fakeBundleId, failureAnalysis.reasoning);

        // ── Step 7: Agent-driven retry ───────────────────────────
        if (failureAnalysis.shouldRetry) {
          logger.info(`🔄 Agent-driven retry: ${failureAnalysis.newTipSol.toFixed(6)} SOL`);
          await new Promise(r => setTimeout(r, config.bundleRetryDelayMs));

          // CRITICAL: Refresh blockhash before retry (required for EXPIRED_BLOCKHASH)
          if (result.errorType === 'EXPIRED_BLOCKHASH') {
            logger.info('🔑 Refreshing expired blockhash before retry...');
            const fresh = await getFreshBlockhash();
            logger.info(`🔑 Fresh blockhash: ${fresh.blockhash.slice(0, 16)}... (valid until block ${fresh.lastValidBlockHeight})`);
          }

          const retryResult = await jitoBundleSubmitter.submitBundle({
            tipSol: failureAnalysis.newTipSol,
            faultInject: null,
          });

          if (retryResult.success && retryResult.bundleId) {
            await lifecycleTracker.trackBundle(
              retryResult.bundleId, bundleNumber,
              failureAnalysis.newTipSol,
              `RETRY: ${failureAnalysis.reasoning}`,
              0.75, 'retry', retryResult.slot
            );
            await lifecycleTracker.markRetried(fakeBundleId, failureAnalysis.newTipSol);
            prismaAgent.resetFailureCount();

            return {
              bundleNumber,
              bundleId: retryResult.bundleId,
              success: true,
              tipSol: decision.recommendedTipSol,
              finalTipSol: failureAnalysis.newTipSol,
              agentDecision: { ...decision, failureAnalysis },
              leaderWindow,
              retried: true,
            };
          }
        }

        return {
          bundleNumber,
          success: false,
          tipSol: decision.recommendedTipSol,
          agentDecision: { ...decision, failureAnalysis },
          leaderWindow,
          error: result.error,
          errorType: result.errorType,
        };
      }
    } finally {
      this.isSubmitting = false;
    }
  }
}

export const bundleOrchestrator = new BundleOrchestrator();
