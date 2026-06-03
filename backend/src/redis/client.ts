import { Redis } from '@upstash/redis';
import { config } from '../config';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      url: config.upstashUrl,
      token: config.upstashToken,
    });
  }
  return redisClient;
}

// ── Key schemas ──────────────────────────────────────────────────────────────
export const KEYS = {
  bundle: (id: string) => `bundle:${id}`,
  tipHistory: () => `tip:history`,
  retryQueue: () => `retry:queue`,
  slotMetrics: () => `slot:metrics`,
  agentContext: () => `agent:context`,
  lifecycleLogs: () => `lifecycle:logs`,
  bundleCounter: () => `bundle:counter`,
  networkStats: () => `network:stats`,
};

// ── Bundle operations ────────────────────────────────────────────────────────
export async function saveBundleState(bundleId: string, state: any): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(KEYS.bundle(bundleId), JSON.stringify(state), { ex: 86400 }); // 24h TTL
  } catch (err) {
    logger.error('Redis saveBundleState error', { err, bundleId });
  }
}

export async function getBundleState(bundleId: string): Promise<any | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(KEYS.bundle(bundleId));
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  } catch (err) {
    logger.error('Redis getBundleState error', { err, bundleId });
    return null;
  }
}

// ── Tip history operations ───────────────────────────────────────────────────
export async function appendTipHistory(entry: TipHistoryEntry): Promise<void> {
  try {
    const redis = getRedis();
    await redis.lpush(KEYS.tipHistory(), JSON.stringify(entry));
    await redis.ltrim(KEYS.tipHistory(), 0, config.tipHistoryWindow - 1);
  } catch (err) {
    logger.error('Redis appendTipHistory error', { err });
  }
}

export async function getTipHistory(): Promise<TipHistoryEntry[]> {
  try {
    const redis = getRedis();
    const items = await redis.lrange(KEYS.tipHistory(), 0, config.tipHistoryWindow - 1);
    return items.map((i: any) => (typeof i === 'string' ? JSON.parse(i) : i));
  } catch (err) {
    logger.error('Redis getTipHistory error', { err });
    return [];
  }
}

// ── Lifecycle log operations ─────────────────────────────────────────────────
export async function appendLifecycleLog(entry: LifecycleLogEntry): Promise<void> {
  try {
    const redis = getRedis();
    await redis.lpush(KEYS.lifecycleLogs(), JSON.stringify(entry));
    await redis.ltrim(KEYS.lifecycleLogs(), 0, 499); // Keep last 500
  } catch (err) {
    logger.error('Redis appendLifecycleLog error', { err });
  }
}

export async function getLifecycleLogs(limit = 50): Promise<LifecycleLogEntry[]> {
  try {
    const redis = getRedis();
    const items = await redis.lrange(KEYS.lifecycleLogs(), 0, limit - 1);
    return items.map((i: any) => (typeof i === 'string' ? JSON.parse(i) : i));
  } catch (err) {
    logger.error('Redis getLifecycleLogs error', { err });
    return [];
  }
}

// ── Network stats ────────────────────────────────────────────────────────────
export async function saveNetworkStats(stats: any): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(KEYS.networkStats(), JSON.stringify(stats), { ex: 30 });
  } catch (err) {
    logger.error('Redis saveNetworkStats error', { err });
  }
}

export async function getNetworkStats(): Promise<any | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(KEYS.networkStats());
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  } catch (err) {
    return null;
  }
}

// ── Bundle counter ───────────────────────────────────────────────────────────
export async function incrementBundleCounter(): Promise<number> {
  try {
    const redis = getRedis();
    return await redis.incr(KEYS.bundleCounter());
  } catch (err) {
    return Math.floor(Math.random() * 1000);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface TipHistoryEntry {
  bundleId: string;
  tipSol: number;
  landed: boolean;
  failureType?: string;
  slot: number;
  latencyMs?: number;
  timestamp: number;
  agentConfidence?: number;
}

export interface LifecycleLogEntry {
  bundleId: string;
  bundleNumber: number;
  submittedAt: number;
  submittedSlot: number;
  processedAt?: number;
  processedSlot?: number;
  confirmedAt?: number;
  confirmedSlot?: number;
  finalizedAt?: number;
  finalizedSlot?: number;
  tipSol: number;
  agentReasoning: string;
  agentConfidence: number;
  agentStrategy: string;
  outcome: 'pending' | 'landed' | 'failed' | 'retried';
  failureType?: string;
  failureReason?: string;
  retryCount: number;
  retryTipSol?: number;
  postMortem?: string;
  deltaProcessedConfirmedMs?: number;
  deltaConfirmedFinalizedMs?: number;
  totalLatencyMs?: number;
}
