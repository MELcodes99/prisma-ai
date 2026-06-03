import axios from 'axios';
import WebSocket from 'ws';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getConnection } from '../rpc/solana';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

export interface TipPercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  timestamp: number;
  source: 'jito-stream' | 'rpc-derived' | 'cached';
}

export interface TipVelocity {
  solPerSlot: number;
  solPerSecond: number;
  sampledSlots: number;
  trend: 'rising' | 'falling' | 'stable';
}

class JitoTipMonitor {
  private ws: WebSocket | null = null;
  private tipStreamBuffer: number[] = []; // Recent tip amounts in SOL
  private cachedPercentiles: TipPercentiles | null = null;
  private lastFetchTime = 0;
  private cacheTtlMs = 5000; // 5s cache

  // Current Jito-reported percentiles from stream
  private jitoStreamPercentiles: TipPercentiles | null = null;

  async start(): Promise<void> {
    this.connectTipStream();
    // Initial fetch via RPC
    await this.fetchTipsByRpc();
  }

  private connectTipStream(): void {
    try {
      this.ws = new WebSocket(config.jitoTipStream);

      this.ws.on('open', () => {
        logger.info('✅ Jito tip stream connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const parsed = JSON.parse(data.toString());
          // Jito tip stream sends arrays of tip objects
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item.landed_tips) {
                const t = item.landed_tips;
                this.jitoStreamPercentiles = {
                  p10: t.p10_landed_tips || 0,
                  p25: t.p25_landed_tips || 0,
                  p50: t.p50_landed_tips || 0,
                  p75: t.p75_landed_tips || 0,
                  p90: t.p90_landed_tips || 0,
                  p95: t.p95_landed_tips || 0,
                  timestamp: Date.now(),
                  source: 'jito-stream',
                };
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      });

      this.ws.on('error', (err) => {
        logger.warn('Jito tip stream error, will use RPC fallback', { message: err.message });
      });

      this.ws.on('close', () => {
        logger.warn('Jito tip stream unavailable, using RPC fallback permanently');
      });
    } catch (err) {
      logger.error('Failed to connect tip stream', { err });
    }
  }

  private async fetchTipsByRpc(): Promise<void> {
    try {
      const conn = getConnection('confirmed');
      const balances: number[] = [];

      // Sample 4 tip accounts to gauge activity
      for (const addr of config.jitoTipAccounts.slice(0, 4)) {
        try {
          const balance = await conn.getBalance(new PublicKey(addr));
          balances.push(balance / LAMPORTS_PER_SOL);
        } catch {
          // Skip failed accounts
        }
      }

      if (balances.length > 0) {
        // Derive approximate percentiles from observed balances
        // This is a heuristic - real percentiles come from the tip stream
        const sorted = balances.sort((a, b) => a - b);
        const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

        // Build synthetic percentiles based on observed tip account activity
        this.cachedPercentiles = {
          p10: Math.max(config.minTipSol, avg * 0.3),
          p25: Math.max(config.minTipSol, avg * 0.5),
          p50: Math.max(config.minTipSol, avg * 0.8),
          p75: Math.max(config.minTipSol, avg * 1.2),
          p90: Math.max(config.minTipSol, avg * 1.8),
          p95: Math.max(config.minTipSol, avg * 2.5),
          timestamp: Date.now(),
          source: 'rpc-derived',
        };
      }

      this.lastFetchTime = Date.now();
    } catch (err) {
      logger.error('RPC tip fetch error', { err });
    }
  }

  // Try Jito REST API for recent tip stats
  async fetchJitoApiTips(): Promise<TipPercentiles | null> {
    try {
      const resp = await axios.get(
        'https://bundles-api-mainnet.block-engine.jito.wtf/api/v1/bundles/tip_floor',
        { timeout: 3000 }
      );
      const data = resp.data;
      if (data && typeof data === 'object') {
        return {
          p10: data.p10_landed_tips || data.landed_tips_p10 || config.minTipSol,
          p25: data.p25_landed_tips || config.minTipSol * 1.5,
          p50: data.p50_landed_tips || data.landed_tips_p50 || config.minTipSol * 2,
          p75: data.p75_landed_tips || data.landed_tips_p75 || config.minTipSol * 3,
          p90: data.p90_landed_tips || data.landed_tips_p90 || config.minTipSol * 4,
          p95: data.p95_landed_tips || config.minTipSol * 5,
          timestamp: Date.now(),
          source: 'jito-stream',
        };
      }
    } catch {
      // API unavailable, use fallbacks
    }
    return null;
  }

  async getPercentiles(): Promise<TipPercentiles> {
    // Priority: Jito stream > API > RPC-derived > defaults
    if (this.jitoStreamPercentiles && Date.now() - this.jitoStreamPercentiles.timestamp < 30000) {
      return this.jitoStreamPercentiles;
    }

    const apiTips = await this.fetchJitoApiTips();
    if (apiTips) return apiTips;

    if (this.cachedPercentiles && Date.now() - this.lastFetchTime < this.cacheTtlMs) {
      return this.cachedPercentiles;
    }

    await this.fetchTipsByRpc();

    return (
      this.cachedPercentiles || {
        p10: config.minTipSol,
        p25: config.minTipSol * 1.5,
        p50: config.minTipSol * 2,
        p75: config.minTipSol * 3,
        p90: config.minTipSol * 4,
        p95: config.minTipSol * 5,
        timestamp: Date.now(),
        source: 'cached',
      }
    );
  }

  getTipVelocity(): TipVelocity {
    const recent = this.tipStreamBuffer.slice(-20);
    if (recent.length < 2) {
      return { solPerSlot: 0, solPerSecond: 0, sampledSlots: 0, trend: 'stable' };
    }

    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const trend =
      secondAvg > firstAvg * 1.1 ? 'rising' : secondAvg < firstAvg * 0.9 ? 'falling' : 'stable';

    return {
      solPerSlot: avg,
      solPerSecond: avg * 2.5, // ~2.5 slots/sec on Solana
      sampledSlots: recent.length,
      trend,
    };
  }

  getRandomTipAccount(): string {
    const accounts = config.jitoTipAccounts;
    return accounts[Math.floor(Math.random() * accounts.length)];
  }
}

export const jitoTipMonitor = new JitoTipMonitor();
