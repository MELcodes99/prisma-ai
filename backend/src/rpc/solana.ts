import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Commitment,
  BlockhashWithExpiryBlockHeight,
} from '@solana/web3.js';
import { config } from '../config';
import { logger } from '../utils/logger';

let connection: Connection | null = null;
let payerKeypair: Keypair | null = null;

export function getConnection(commitment: Commitment = 'confirmed'): Connection {
  if (!connection) {
    // Primary: Helius RPC; fallback: SolInfra
    const endpoint = config.heliusRpc || config.solinfraRpc;
    connection = new Connection(endpoint, {
      commitment,
      wsEndpoint: config.heliusWs || config.solinfraWs,
      confirmTransactionInitialTimeout: 60000,
      disableRetryOnRateLimit: false,
    });
    logger.info(`RPC connected: ${endpoint.split('?')[0]}`);
  }
  return connection;
}

export function getPayerKeypair(): Keypair {
  if (!payerKeypair) {
    try {
      const keyArray = JSON.parse(config.payerPrivateKey);
      payerKeypair = Keypair.fromSecretKey(new Uint8Array(keyArray));
      logger.info(`Fee payer loaded: ${payerKeypair.publicKey.toBase58()}`);
    } catch (err) {
      throw new Error('Invalid PAYER_PRIVATE_KEY format. Must be a JSON array of numbers.');
    }
  }
  return payerKeypair;
}

// Fetch blockhash at confirmed commitment (NEVER finalized for time-sensitive txns)
export async function getFreshBlockhash(): Promise<BlockhashWithExpiryBlockHeight> {
  const conn = getConnection('confirmed');
  const result = await conn.getLatestBlockhash('confirmed');
  logger.debug('Fresh blockhash fetched', {
    blockhash: result.blockhash,
    lastValidBlockHeight: result.lastValidBlockHeight,
  });
  return result;
}

// Get current slot
export async function getCurrentSlot(): Promise<number> {
  const conn = getConnection();
  return conn.getSlot('confirmed');
}

// Get leader schedule for current epoch
export async function getLeaderSchedule(): Promise<Record<string, number[]> | null> {
  try {
    const conn = getConnection();
    const schedule = await conn.getLeaderSchedule();
    return schedule;
  } catch (err) {
    logger.error('Failed to fetch leader schedule', { err });
    return null;
  }
}

// Get SOL balance of an address
export async function getBalance(address: string): Promise<number> {
  const conn = getConnection();
  const lamports = await conn.getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

// Build a minimal transfer transaction (used as bundle payload)
export async function buildMemoTransaction(
  payer: Keypair,
  memo: string,
  tipAccount: PublicKey,
  tipLamports: number
): Promise<Transaction> {
  const conn = getConnection('confirmed');
  const { blockhash, lastValidBlockHeight } = await getFreshBlockhash();

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;

  // Tip transfer to Jito tip account
  tx.add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: tipAccount,
      lamports: tipLamports,
    })
  );

  tx.sign(payer);
  return tx;
}

// Check if blockhash is still valid
export async function isBlockhashValid(blockhash: string): Promise<boolean> {
  try {
    const conn = getConnection();
    const result = await conn.isBlockhashValid(blockhash, { commitment: 'confirmed' });
    return result.value;
  } catch {
    return false;
  }
}

// Subscribe to slot updates via WebSocket
export function subscribeToSlots(
  callback: (slotInfo: { slot: number; parent: number; root: number }) => void
): number {
  const conn = getConnection();
  return conn.onSlotChange(callback);
}

export function unsubscribeFromSlots(subscriptionId: number): void {
  const conn = getConnection();
  conn.removeSlotChangeListener(subscriptionId);
}
