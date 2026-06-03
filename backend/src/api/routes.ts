import { Router, Request, Response } from 'express';
import { bundleOrchestrator } from '../queue/orchestrator';
import { lifecycleTracker } from '../lifecycle/tracker';
import { jitoTipMonitor } from '../jito/tipMonitor';
import { geyserStream } from '../geyser/stream';
import { getLifecycleLogs, getTipHistory, getNetworkStats } from '../redis/client';
import { getBalance, getPayerKeypair, getCurrentSlot } from '../rpc/solana';
import { getSolPrice } from '../utils/coingecko';
import { logger } from '../utils/logger';

const router = Router();

// ── Health ────────────────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'PrismaAI',
    version: '1.0.0',
    geyserConnected: geyserStream.isConnected(),
    lastSlot: geyserStream.getLastSlot(),
    timestamp: Date.now(),
  });
});

// ── Network state ─────────────────────────────────────────────────────────────
router.get('/network', async (_req: Request, res: Response) => {
  try {
    const [tipPercentiles, solPrice, slot, networkStats] = await Promise.all([
      jitoTipMonitor.getPercentiles(),
      getSolPrice(),
      getCurrentSlot(),
      getNetworkStats(),
    ]);
    const tipVelocity = jitoTipMonitor.getTipVelocity();

    res.json({
      slot,
      slotVelocity: geyserStream.getSlotVelocity(),
      geyserConnected: geyserStream.isConnected(),
      tipPercentiles,
      tipVelocity,
      solPrice,
      networkStats,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Submit bundle ─────────────────────────────────────────────────────────────
router.post('/bundle/submit', async (req: Request, res: Response) => {
  try {
    const { faultInject } = req.body || {};
    logger.info(`API: Submit bundle request`, { faultInject });

    const result = await bundleOrchestrator.submitBundle({ faultInject });
    res.json(result);
  } catch (err: any) {
    logger.error('Bundle submit error', { err });
    res.status(500).json({ error: err.message });
  }
});

// ── Fault injection endpoints ─────────────────────────────────────────────────
router.post('/bundle/inject/expired-blockhash', async (_req: Request, res: Response) => {
  try {
    logger.warn('⚠️  Fault injection: EXPIRED_BLOCKHASH');
    const result = await bundleOrchestrator.submitBundle({ faultInject: 'expired_blockhash' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bundle/inject/low-fee', async (_req: Request, res: Response) => {
  try {
    logger.warn('⚠️  Fault injection: LOW_FEE');
    const result = await bundleOrchestrator.submitBundle({ faultInject: 'low_fee' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bundle status ─────────────────────────────────────────────────────────────
router.get('/bundle/:bundleId', async (req: Request, res: Response) => {
  const { bundleId } = req.params;
  const bundle = lifecycleTracker.getActiveBundle(bundleId);
  if (!bundle) {
    return res.status(404).json({ error: 'Bundle not found' });
  }
  res.json(bundle);
});

router.get('/bundles/active', (_req: Request, res: Response) => {
  const bundles = lifecycleTracker.getActiveBundles();
  res.json(bundles);
});

// ── Lifecycle logs ────────────────────────────────────────────────────────────
router.get('/logs/lifecycle', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await getLifecycleLogs(limit);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/logs/tips', async (_req: Request, res: Response) => {
  try {
    const history = await getTipHistory();
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Wallet info ───────────────────────────────────────────────────────────────
router.get('/wallet', async (_req: Request, res: Response) => {
  try {
    const keypair = getPayerKeypair();
    const address = keypair.publicKey.toBase58();
    const balance = await getBalance(address);
    res.json({ address, balance, network: 'mainnet' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats summary ─────────────────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [logs, tipHistory, solPrice] = await Promise.all([
      getLifecycleLogs(100),
      getTipHistory(),
      getSolPrice(),
    ]);

    const landed = logs.filter((l) => l.outcome === 'landed');
    const failed = logs.filter((l) => l.outcome === 'failed');
    const totalBundles = logs.length;
    const landingRate = totalBundles > 0 ? (landed.length / totalBundles) * 100 : 0;

    const avgTip =
      logs.length > 0 ? logs.reduce((sum, l) => sum + l.tipSol, 0) / logs.length : 0;

    const avgLatency =
      landed.filter((l) => l.totalLatencyMs).length > 0
        ? landed
            .filter((l) => l.totalLatencyMs)
            .reduce((sum, l) => sum + (l.totalLatencyMs || 0), 0) /
          landed.filter((l) => l.totalLatencyMs).length
        : 0;

    const avgProcessedConfirmedDelta =
      landed.filter((l) => l.deltaProcessedConfirmedMs).length > 0
        ? landed
            .filter((l) => l.deltaProcessedConfirmedMs)
            .reduce((sum, l) => sum + (l.deltaProcessedConfirmedMs || 0), 0) /
          landed.filter((l) => l.deltaProcessedConfirmedMs).length
        : 0;

    const failureBreakdown = failed.reduce(
      (acc, l) => {
        const ft = l.failureType || 'UNKNOWN';
        acc[ft] = (acc[ft] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    res.json({
      totalBundles,
      landed: landed.length,
      failed: failed.length,
      landingRate: landingRate.toFixed(1),
      avgTipSol: avgTip.toFixed(6),
      avgTipUsd: (avgTip * solPrice).toFixed(4),
      avgLatencyMs: Math.round(avgLatency),
      avgProcessedConfirmedDeltaMs: Math.round(avgProcessedConfirmedDelta),
      failureBreakdown,
      solPrice,
      geyserConnected: geyserStream.isConnected(),
      lastSlot: geyserStream.getLastSlot(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as apiRouter };
