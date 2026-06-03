import axios from 'axios';
import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getPayerKeypair, getFreshBlockhash, getConnection } from '../rpc/solana';
import { jitoTipMonitor } from './tipMonitor';

export interface BundleSubmission {
  bundleId: string;
  slot: number;
  transactions: string[]; // base58 encoded
  tipSol: number;
  tipAccount: string;
  submittedAt: number;
}

export interface BundleResult {
  success: boolean;
  bundleId?: string;
  jitoResponseId?: string;
  error?: string;
  errorType?: BundleErrorType;
  slot: number;
  timestamp: number;
}

export type BundleErrorType =
  | 'EXPIRED_BLOCKHASH'
  | 'FEE_TOO_LOW'
  | 'COMPUTE_EXCEEDED'
  | 'BUNDLE_DROPPED'
  | 'LEADER_SKIP'
  | 'RPC_ERROR'
  | 'UNKNOWN';

export interface BundlePayload {
  tipSol: number;
  memo?: string;
  faultInject?: 'expired_blockhash' | 'low_fee' | null;
}

class JitoBundleSubmitter {
  private readonly endpoint = config.jitoBundleEndpoint;

  async submitBundle(payload: BundlePayload): Promise<BundleResult> {
    const payer = getPayerKeypair();
    const slot = await this.getCurrentSlot();

    try {
      let { blockhash, lastValidBlockHeight } = await getFreshBlockhash();

      // Fault injection for testing failure scenarios
      if (payload.faultInject === 'expired_blockhash') {
        logger.warn('⚠️  FAULT INJECTION: Simulating expired blockhash');
        blockhash = '1111111111111111111111111111111111111111111111'; // Invalid
      }

      const tipAccount = jitoTipMonitor.getRandomTipAccount();
      const tipLamports = Math.floor(payload.tipSol * LAMPORTS_PER_SOL);

      // Build tip transaction
      const tipTx = new Transaction();
      tipTx.recentBlockhash = blockhash;
      tipTx.feePayer = payer.publicKey;
      tipTx.add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: new PublicKey(tipAccount),
          lamports: tipLamports,
        })
      );

      // Build payload transaction (the "real" transaction in the bundle)
      // In production this would be whatever the user wants to execute
      // For PrismaAI demo, we use a self-transfer as proof of execution
      const payloadTx = new Transaction();
      payloadTx.recentBlockhash = blockhash;
      payloadTx.feePayer = payer.publicKey;
      payloadTx.add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: payer.publicKey,
          lamports: 100, // Minimal self-transfer
        })
      );

      // Simulate low fee by not adding proper tip
      if (payload.faultInject === 'low_fee') {
        logger.warn('⚠️  FAULT INJECTION: Simulating low fee bundle');
        // Rebuild tip tx with dust amount
        const dustTx = new Transaction();
        dustTx.recentBlockhash = blockhash;
        dustTx.feePayer = payer.publicKey;
        dustTx.add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: new PublicKey(tipAccount),
            lamports: 1, // 1 lamport = basically nothing
          })
        );
        dustTx.sign(payer);

        payloadTx.sign(payer);

        const result = await this.sendToJito([dustTx, payloadTx], slot, 0.000000001, tipAccount);
        return result;
      }

      tipTx.sign(payer);
      payloadTx.sign(payer);

      return await this.sendToJito([tipTx, payloadTx], slot, payload.tipSol, tipAccount);
    } catch (err: any) {
      const errorType = this.classifyError(err);
      logger.error('Bundle submission failed', { error: err.message, errorType });
      return {
        success: false,
        error: err.message,
        errorType,
        slot,
        timestamp: Date.now(),
      };
    }
  }

  private async sendToJito(
    transactions: Transaction[],
    slot: number,
    tipSol: number,
    tipAccount: string
  ): Promise<BundleResult> {
    const encodedTxs = transactions.map((tx) => {
      const serialized = tx.serialize();
      return bs58.encode(serialized);
    });

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendBundle',
      params: [encodedTxs],
    };

    try {
      const response = await axios.post(this.endpoint, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      const data = response.data;

      if (data.error) {
        const errorType = this.classifyJitoError(data.error);
        return {
          success: false,
          error: data.error.message || JSON.stringify(data.error),
          errorType,
          slot,
          timestamp: Date.now(),
        };
      }

      const bundleId = data.result;
      logger.info(`Bundle submitted: ${bundleId}`, { slot, tipSol });

      return {
        success: true,
        bundleId,
        jitoResponseId: bundleId,
        slot,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      if (err.response?.data?.error) {
        const jitoErr = err.response.data.error;
        return {
          success: false,
          error: jitoErr.message || JSON.stringify(jitoErr),
          errorType: this.classifyJitoError(jitoErr),
          slot,
          timestamp: Date.now(),
        };
      }
      throw err;
    }
  }

  async checkBundleStatus(bundleId: string): Promise<{
    status: 'pending' | 'landed' | 'failed' | 'invalid';
    slot?: number;
    error?: string;
  }> {
    try {
      const response = await axios.post(
        this.endpoint,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getBundleStatuses',
          params: [[bundleId]],
        },
        { timeout: 5000 }
      );

      const result = response.data?.result?.value?.[0];
      if (!result) return { status: 'pending' };

      const status = result.confirmation_status;
      if (status === 'finalized' || status === 'confirmed') {
        return { status: 'landed', slot: result.slot };
      }
      if (result.err) {
        return { status: 'failed', error: JSON.stringify(result.err) };
      }
      return { status: 'pending', slot: result.slot };
    } catch (err: any) {
      return { status: 'pending' };
    }
  }

  private classifyError(err: any): BundleErrorType {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('blockhash') || msg.includes('expired')) return 'EXPIRED_BLOCKHASH';
    if (msg.includes('fee') || msg.includes('insufficient')) return 'FEE_TOO_LOW';
    if (msg.includes('compute') || msg.includes('budget')) return 'COMPUTE_EXCEEDED';
    if (msg.includes('dropped') || msg.includes('bundle')) return 'BUNDLE_DROPPED';
    if (msg.includes('leader') || msg.includes('skip')) return 'LEADER_SKIP';
    if (msg.includes('rpc') || msg.includes('network')) return 'RPC_ERROR';
    return 'UNKNOWN';
  }

  private classifyJitoError(err: any): BundleErrorType {
    const code = err.code;
    const msg = (err.message || '').toLowerCase();
    if (code === -32005 || msg.includes('blockhash')) return 'EXPIRED_BLOCKHASH';
    if (code === -32002 || msg.includes('fee')) return 'FEE_TOO_LOW';
    if (code === -32003 || msg.includes('dropped')) return 'BUNDLE_DROPPED';
    if (msg.includes('compute')) return 'COMPUTE_EXCEEDED';
    return 'UNKNOWN';
  }

  private async getCurrentSlot(): Promise<number> {
    try {
      const conn = getConnection();
      return await conn.getSlot('confirmed');
    } catch {
      return 0;
    }
  }
}

export const jitoBundleSubmitter = new JitoBundleSubmitter();
