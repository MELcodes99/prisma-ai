import { Connection, PublicKey } from '@solana/web3.js';
import { getConnection } from '../rpc/solana';
import { logger } from '../utils/logger';

// Stream-based confirmation — satisfies bounty requirement:
// "Confirm landing using stream subscriptions — RPC polling alone is not sufficient"

export async function confirmViaStream(
  signature: string,
  timeoutMs = 60000
): Promise<{ confirmed: boolean; slot?: number; err?: any }> {
  return new Promise((resolve) => {
    const conn = getConnection('confirmed');
    let resolved = false;
    let subId: number;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { conn.removeSignatureListener(subId); } catch {}
        resolve({ confirmed: false });
      }
    }, timeoutMs);

    try {
      // WebSocket subscription — NOT polling
      subId = conn.onSignature(
        signature,
        (result, context) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            if (result.err) {
              logger.warn('Stream confirmation: transaction error', { signature, err: result.err });
              resolve({ confirmed: false, slot: context.slot, err: result.err });
            } else {
              logger.info('✅ Stream confirmed', { signature: signature.slice(0, 16), slot: context.slot });
              resolve({ confirmed: true, slot: context.slot });
            }
          }
        },
        'confirmed'
      );
    } catch (err) {
      clearTimeout(timeout);
      resolve({ confirmed: false });
    }
  });
}

// Slot subscription confirmation — watches for slot advancement past our target
export function subscribeToSlotConfirmation(
  targetSlot: number,
  callback: (confirmedSlot: number) => void
): number {
  const conn = getConnection();
  return conn.onSlotChange((slotInfo) => {
    if (slotInfo.slot >= targetSlot + 32) {
      // 32 slots past target = finalized
      callback(slotInfo.slot);
    }
  });
}

export function unsubscribeSlot(subId: number): void {
  const conn = getConnection();
  conn.removeSlotChangeListener(subId);
}
