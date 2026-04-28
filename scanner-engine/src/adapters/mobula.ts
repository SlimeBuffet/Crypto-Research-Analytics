import { MobulaMultiResponse, MobulaCoinData, EnrichmentData } from '../types';
import { ApiKeyManager } from '../core/api-key-manager';
import { TtlCache } from '../utils/cache';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger, maskKey } from '../utils/logger';

const BASE_URL = 'https://api.mobula.io/api/1';

/**
 * Mobula API adapter — fundamental data, sector/category tags.
 * Used alongside CryptoRank for redundancy.
 */
export class MobulaAdapter {
  constructor(
    private keyManager: ApiKeyManager,
    private cache: TtlCache,
  ) {}

  async fetchCoinData(symbols: string[]): Promise<Map<string, EnrichmentData>> {
    const results = new Map<string, EnrichmentData>();
    const uncached: string[] = [];

    for (const sym of symbols) {
      const cached = this.cache.get<EnrichmentData>(`mobula:${sym}`);
      if (cached) {
        results.set(sym, cached);
      } else {
        uncached.push(sym);
      }
    }

    if (uncached.length === 0) {
      logger.debug('All Mobula data served from cache');
      return results;
    }

    const apiKey = this.keyManager.getKey('mobula');
    if (!apiKey) {
      logger.warn('No Mobula API keys configured, skipping enrichment');
      return results;
    }

    try {
      const symbolParam = uncached.join(',');
      const data = await fetchWithBackoff<MobulaMultiResponse>(
        `${BASE_URL}/market/multi-data?symbols=${symbolParam}`,
        {
          headers: { Authorization: apiKey },
          label: `mobula/multi-data (${uncached.length} symbols)`,
        },
      );

      if (data.data) {
        const coins: MobulaCoinData[] = Array.isArray(data.data)
          ? data.data
          : Object.values(data.data).filter((v): v is MobulaCoinData => v != null);

        for (const coin of coins) {
          if (!coin.symbol) continue;
          const enrichment: EnrichmentData = {
            name: coin.name,
            marketCap: coin.market_cap || 0,
            fullyDilutedValuation: coin.fully_diluted_valuation || 0,
            circulatingSupply: coin.circulating_supply || 0,
            totalSupply: coin.total_supply || 0,
            maxSupply: coin.max_supply,
            priceChange7d: coin.price_change_7d || 0,
            priceChange30d: coin.price_change_30d || 0,
            sector: coin.tags?.[0] || 'Other',
            categories: coin.tags || [],
            source: 'mobula',
          };

          const sym = coin.symbol.toUpperCase();
          results.set(sym, enrichment);
          this.cache.set(`mobula:${sym}`, enrichment);
        }
      }

      logger.info(
        { fetched: results.size - (symbols.length - uncached.length), cached: symbols.length - uncached.length },
        'Mobula enrichment complete',
      );
    } catch (err) {
      const error = err as Error;
      logger.error({ error: error.message, key: maskKey(apiKey) }, 'Mobula fetch failed');
      this.keyManager.reportFailure('mobula', apiKey);
    }

    return results;
  }
}
