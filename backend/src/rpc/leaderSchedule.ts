import { getConnection } from './solana';
import { config } from '../config';
import { logger } from '../utils/logger';

// Known Jito-enabled validators (sample — expands via runtime detection)
const KNOWN_JITO_VALIDATORS = new Set([
  'Ft5SNQKCQbDRcVbvpPXEWGVvsBFBMJnpibWPGxEFBBRS',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'CW9C7HBwAMgqNdXkNgFg9Ujr3edR2Ab9ymEuQnVacd1A',
  'B4DM2Q9LVNFBK9MRBHZC3NVZHJZDK5GFDL3VY9SFZX76',
]);

export interface LeaderWindowInfo {
  currentSlot: number;
  nextLeader: string | null;
  slotsUntilNextJitoLeader: number;
  isJitoWindow: boolean;
  skipRisk: 'low' | 'medium' | 'high';
  recommendation: 'submit' | 'hold';
  reasoning: string;
}

let cachedSchedule: Record<string, number[]> | null = null;
let scheduleSlot = 0;

export async function getLeaderWindowInfo(): Promise<LeaderWindowInfo> {
  try {
    const conn = getConnection();
    const currentSlot = await conn.getSlot('confirmed');

    // Refresh schedule every 1000 slots
    if (!cachedSchedule || currentSlot - scheduleSlot > 1000) {
      cachedSchedule = await conn.getLeaderSchedule() || {};
      scheduleSlot = currentSlot;
      logger.debug('Leader schedule refreshed', { slot: currentSlot });
    }

    // Find who leads the next 4 slots
    const slotIndex = currentSlot % 432000; // slots per epoch
    let nextLeader: string | null = null;
    let slotsUntilNextJitoLeader = 999;
    let isJitoWindow = false;

    if (cachedSchedule) {
      for (const [validator, slots] of Object.entries(cachedSchedule)) {
        for (const s of slots) {
          if (s >= slotIndex && s <= slotIndex + 4) {
            nextLeader = validator;
            isJitoWindow = KNOWN_JITO_VALIDATORS.has(validator);
            slotsUntilNextJitoLeader = s - slotIndex;
            break;
          }
        }
        if (nextLeader) break;
      }
    }

    // Assess skip risk based on slot velocity
    const skipRisk: 'low' | 'medium' | 'high' =
      slotsUntilNextJitoLeader > 20 ? 'high' :
      slotsUntilNextJitoLeader > 8 ? 'medium' : 'low';

    // Recommendation
    const recommendation = skipRisk === 'high' ? 'hold' : 'submit';

    const reasoning = `Current slot ${currentSlot}. ` +
      `Next leader: ${nextLeader ? nextLeader.slice(0, 8) + '...' : 'unknown'}. ` +
      `Jito window: ${isJitoWindow ? 'YES' : 'unknown — submitting anyway'}. ` +
      `Skip risk: ${skipRisk}. Recommendation: ${recommendation}.`;

    return {
      currentSlot,
      nextLeader,
      slotsUntilNextJitoLeader,
      isJitoWindow,
      skipRisk,
      recommendation,
      reasoning,
    };
  } catch (err) {
    logger.error('Leader schedule fetch error', { err });
    return {
      currentSlot: 0,
      nextLeader: null,
      slotsUntilNextJitoLeader: 0,
      isJitoWindow: true, // Default to submit
      skipRisk: 'low',
      recommendation: 'submit',
      reasoning: 'Leader schedule unavailable — defaulting to submit.',
    };
  }
}
