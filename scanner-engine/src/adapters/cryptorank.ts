import { CryptoRankResponse, EnrichmentData } from '../types';
import { ApiKeyManager } from '../core/api-key-manager';
import { TtlCache } from '../utils/cache';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger, maskKey } from '../utils/logger';

const BASE_URL = 'https://api.cryptorank.io/v1';

/**
 * CryptoRank API adapter — fundamental data, sector tags.
 */
export class CryptoRankAdapter {
  constructor(
    private keyManager: ApiKeyManager,
    private cache: TtlCache,
  ) {}

  async fetchCoinData(symbols: string[]): Promise<Map<string, EnrichmentData>> {
    const results = new Map<string, EnrichmentData>();
    const uncached: string[] = [];

    for (const sym of symbols) {
      const cached = this.cache.get<EnrichmentData>(`cryptorank:${sym}`);
      if (cached) {
        results.set(sym, cached);
      } else {
        uncached.push(sym);
      }
    }

    if (uncached.length === 0) {
      logger.debug('All CryptoRank data served from cache');
      return results;
    }

    const apiKey = this.keyManager.getKey('cryptorank');
    if (!apiKey) {
      logger.warn('No CryptoRank API keys configured, skipping enrichment');
      return results;
    }

    try {
      const symbolParam = uncached.join(',');
      const data = await fetchWithBackoff<CryptoRankResponse>(
        `${BASE_URL}/currencies?symbols=${symbolParam}&limit=${uncached.length}`,
        {
          headers: { 'X-API-KEY': apiKey },
          label: `cryptorank/currencies (${uncached.length} symbols)`,
        },
      );

      if (data.status?.success && data.data) {
        for (const coin of data.data) {
          const usd = coin.values?.USD;
          if (!usd) continue;

          const enrichment: EnrichmentData = {
            name: coin.name,
            marketCap: usd.marketCap || 0,
            fullyDilutedValuation: usd.fullyDilutedValuation || 0,
            circulatingSupply: usd.circulatingSupply || 0,
            totalSupply: usd.totalSupply || 0,
            maxSupply: usd.maxSupply,
            priceChange7d: usd.percentChange7d || 0,
            priceChange30d: usd.percentChange30d || 0,
            sector: coin.category?.[0] || 'Other',
            categories: coin.category || [],
            source: 'cryptorank',
          };

          results.set(coin.symbol.toUpperCase(), enrichment);
          this.cache.set(`cryptorank:${coin.symbol.toUpperCase()}`, enrichment);
        }
      }

      logger.info(
        { fetched: data.data?.length || 0, cached: symbols.length - uncached.length },
        'CryptoRank enrichment complete',
      );
    } catch (err) {
      const error = err as Error;
      logger.error({ error: error.message, key: maskKey(apiKey) }, 'CryptoRank fetch failed');
      this.keyManager.reportFailure('cryptorank', apiKey);
    }

    return results;
  }
}
