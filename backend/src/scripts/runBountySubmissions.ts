/**
 * PrismaAI — Bounty Submission Runner
 * 
 * Runs 10+ real bundle submissions including mandatory failure cases.
 * Exports a formatted lifecycle log for bounty judges.
 * 
 * Usage: npx ts-node src/scripts/runBountySubmissions.ts
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { bundleOrchestrator } from '../queue/orchestrator';
import { getLifecycleLogs } from '../redis/client';
import { startGeyserStream, geyserStream } from '../geyser/stream';
import { jitoTipMonitor } from '../jito/tipMonitor';
import { logger } from '../utils/logger';

const DELAY_BETWEEN_MS = 8000; // 8s between submissions
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Submission plan: 10 bundles, 2 forced failures
const SUBMISSION_PLAN = [
  { label: 'Normal #1',           faultInject: null },
  { label: 'Normal #2',           faultInject: null },
  { label: 'Normal #3',           faultInject: null },
  { label: 'FAULT: Expired BH',   faultInject: 'expired_blockhash' },
  { label: 'Normal #5',           faultInject: null },
  { label: 'Normal #6',           faultInject: null },
  { label: 'FAULT: Low Fee',      faultInject: 'low_fee' },
  { label: 'Normal #8',           faultInject: null },
  { label: 'Normal #9',           faultInject: null },
  { label: 'Normal #10',          faultInject: null },
  { label: 'Normal #11',          faultInject: null },
  { label: 'Normal #12',          faultInject: null },
];

async function run() {
  console.log('\n' + '█'.repeat(60));
  console.log('  PrismaAI BOUNTY SUBMISSION RUNNER');
  console.log('  Running 12 bundles (10 normal + 2 fault injection)');
  console.log('█'.repeat(60) + '\n');

  // Start services
  startGeyserStream();
  await jitoTipMonitor.start();
  await sleep(3000); // Let streams connect

  const results: any[] = [];

  for (let i = 0; i < SUBMISSION_PLAN.length; i++) {
    const plan = SUBMISSION_PLAN[i];
    console.log(`\n[${ i + 1}/${SUBMISSION_PLAN.length}] ${plan.label}`);
    console.log('─'.repeat(40));

    try {
      const result = await bundleOrchestrator.submitBundle({
        faultInject: plan.faultInject as any,
        skipLeaderCheck: true, // Don't hold during bounty run
      });

      results.push({ plan: plan.label, result });

      console.log(`  Bundle #${result.bundleNumber}: ${result.success ? '✅ SUBMITTED' : '❌ FAILED'}`);
      if (result.bundleId) console.log(`  ID: ${result.bundleId}`);
      console.log(`  Tip: ${result.tipSol?.toFixed(6)} SOL`);
      if (result.retried) console.log(`  ↳ Auto-retried at: ${result.finalTipSol?.toFixed(6)} SOL`);
      if (result.agentDecision?.reasoning) {
        console.log(`  Agent: "${result.agentDecision.reasoning.substring(0, 100)}..."`);
      }

    } catch (err: any) {
      console.log(`  ERROR: ${err.message}`);
      results.push({ plan: plan.label, error: err.message });
    }

    if (i < SUBMISSION_PLAN.length - 1) {
      console.log(`\n  Waiting ${DELAY_BETWEEN_MS / 1000}s for lifecycle progression...`);
      await sleep(DELAY_BETWEEN_MS);
    }
  }

  // Wait for final bundles to progress
  console.log('\n⏳ Waiting 30s for final lifecycle progression...');
  await sleep(30000);

  // Export lifecycle log
  await exportLifecycleLog();
  process.exit(0);
}

async function exportLifecycleLog() {
  console.log('\n' + '═'.repeat(60));
  console.log('  EXPORTING LIFECYCLE LOG');
  console.log('═'.repeat(60));

  const logs = await getLifecycleLogs(100);

  if (logs.length === 0) {
    console.log('No logs found in Redis. Bundles may still be processing.');
    return;
  }

  // ── Human-readable log ─────────────────────────────────────────
  let readable = '';
  readable += `PRISMA AI — BOUNTY LIFECYCLE LOG\n`;
  readable += `Generated: ${new Date().toISOString()}\n`;
  readable += `Total bundles: ${logs.length}\n`;
  readable += `Landed: ${logs.filter(l => l.outcome === 'landed').length}\n`;
  readable += `Failed: ${logs.filter(l => l.outcome === 'failed').length}\n`;
  readable += `Retried: ${logs.filter(l => l.outcome === 'retried').length}\n`;
  readable += '\n' + '═'.repeat(70) + '\n\n';

  for (const log of logs) {
    readable += `BUNDLE #${log.bundleNumber}\n`;
    readable += '─'.repeat(50) + '\n';
    readable += `submitted_at:    slot ${log.submittedSlot?.toLocaleString().padEnd(15)} ${new Date(log.submittedAt).toISOString()}\n`;
    readable += `tip_amount:      ${log.tipSol.toFixed(6)} SOL\n`;
    readable += `agent_strategy:  ${log.agentStrategy}\n`;
    readable += `agent_confidence:${(log.agentConfidence * 100).toFixed(0)}%\n`;
    readable += `agent_reasoning: "${log.agentReasoning}"\n\n`;

    if (log.processedSlot) {
      readable += `processed_at:    slot ${log.processedSlot.toLocaleString().padEnd(15)} ${new Date(log.processedAt!).toISOString()}\n`;
    }
    if (log.confirmedSlot) {
      readable += `confirmed_at:    slot ${log.confirmedSlot.toLocaleString().padEnd(15)} ${new Date(log.confirmedAt!).toISOString()}\n`;
    }
    if (log.finalizedSlot) {
      readable += `finalized_at:    slot ${log.finalizedSlot.toLocaleString().padEnd(15)} ${new Date(log.finalizedAt!).toISOString()}\n`;
    }

    readable += `\noutcome:         ${log.outcome.toUpperCase()}\n`;

    if (log.deltaProcessedConfirmedMs) {
      readable += `delta_proc→conf: ${(log.deltaProcessedConfirmedMs / 1000).toFixed(2)}s\n`;
    }
    if (log.deltaConfirmedFinalizedMs) {
      readable += `delta_conf→fin:  ${(log.deltaConfirmedFinalizedMs / 1000).toFixed(2)}s\n`;
    }
    if (log.totalLatencyMs) {
      readable += `total_latency:   ${(log.totalLatencyMs / 1000).toFixed(2)}s\n`;
    }

    if (log.failureType) {
      readable += `\nFAILURE TYPE:    ${log.failureType}\n`;
      readable += `FAILURE REASON:  ${log.failureReason}\n`;
    }
    if (log.postMortem) {
      readable += `POST_MORTEM:     "${log.postMortem}"\n`;
    }
    if (log.retryCount > 0) {
      readable += `RETRY_COUNT:     ${log.retryCount}\n`;
      readable += `RETRY_TIP:       ${log.retryTipSol?.toFixed(6)} SOL\n`;
    }

    readable += '\n' + '═'.repeat(70) + '\n\n';
  }

  // Write files
  const dir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const readablePath = path.join(dir, 'LIFECYCLE_LOG.txt');
  const jsonPath = path.join(dir, 'lifecycle_log.json');

  fs.writeFileSync(readablePath, readable);
  fs.writeFileSync(jsonPath, JSON.stringify(logs, null, 2));

  console.log(`\n✅ Lifecycle log exported:`);
  console.log(`   Text: ${readablePath}`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`\n   Total entries: ${logs.length}`);
  console.log(`   Landed: ${logs.filter(l => l.outcome === 'landed').length}`);
  console.log(`   Failed: ${logs.filter(l => l.outcome === 'failed').length}`);
  console.log('\n   Submit these files with your bounty entry.\n');
}

run().catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});
