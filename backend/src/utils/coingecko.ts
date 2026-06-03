import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

let cachedPrice: number = 150;
let lastFetch = 0;
const CACHE_TTL = 60000; // 1 minute

export async function getSolPrice(): Promise<number> {
  if (Date.now() - lastFetch < CACHE_TTL) return cachedPrice;

  try {
    const resp = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      {
        headers: { 'x-cg-demo-api-key': config.coingeckoApiKey },
        timeout: 5000,
      }
    );
    const price = resp.data?.solana?.usd;
    if (price && typeof price === 'number') {
      cachedPrice = price;
      lastFetch = Date.now();
      logger.debug(`SOL price updated: $${price}`);
    }
  } catch (err) {
    logger.warn('CoinGecko fetch failed, using cached price', { cached: cachedPrice });
  }

  return cachedPrice;
}
