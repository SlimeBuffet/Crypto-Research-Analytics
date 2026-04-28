import { DexScreenerResponse, OnChainData, Chain } from '../types';
import { TtlCache } from '../utils/cache';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger } from '../utils/logger';

const BASE_URL = process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com/latest';

const CHAIN_MAP: Record<string, Chain> = {
  bsc: 'bsc',
  solana: 'solana',
  ethereum: 'ethereum',
  worldchain: 'worldchain',
};

/**
 * DexScreener API adapter — on-chain liquidity and FDV verification.
 * Public API, no key required.
 */
export class DexScreenerAdapter {
  constructor(private cache: TtlCache) {}

  async fetchPairData(symbol: string): Promise<OnChainData | null> {
    const cached = this.cache.get<OnChainData>(`dexscreener:${symbol}`);
    if (cached) return cached;

    try {
      const data = await fetchWithBackoff<DexScreenerResponse>(
        `${BASE_URL}/dex/search?q=${symbol}/USDT`,
        { label: `dexscreener/search/${symbol}` },
      );

      if (!data.pairs || data.pairs.length === 0) return null;

      const bestPair = data.pairs.reduce((best, pair) => {
        const pairLiq = pair.liquidity?.usd ?? 0;
        const bestLiq = best.liquidity?.usd ?? 0;
        return pairLiq > bestLiq ? pair : best;
      });

      const result: OnChainData = {
        dexLiquidity: bestPair.liquidity?.usd ?? 0,
        dexVolume24h: bestPair.volume?.h24 ?? 0,
        dexTxns24h:
          (bestPair.txns?.h24?.buys || 0) + (bestPair.txns?.h24?.sells || 0),
        verifiedFdv: bestPair.fdv || null,
        verifiedMcap: bestPair.marketCap || null,
        chain: CHAIN_MAP[bestPair.chainId] || null,
        source: 'dexscreener',
      };

      this.cache.set(`dexscreener:${symbol}`, result, 5 * 60 * 1000);
      return result;
    } catch (err) {
      const error = err as Error;
      logger.warn({ symbol, error: error.message }, 'DexScreener fetch failed');
      return null;
    }
  }

  /** Batch fetch on-chain data for multiple symbols */
  async fetchBatch(symbols: string[]): Promise<Map<string, OnChainData>> {
    const results = new Map<string, OnChainData>();

    for (const symbol of symbols) {
      const data = await this.fetchPairData(symbol);
      if (data) {
        results.set(symbol, data);
      }
    }

    logger.info(
      { requested: symbols.length, found: results.size },
      'DexScreener batch fetch complete',
    );
    return results;
  }
}
