import { CoinCapResponse, EnrichmentData } from '../types';
import { ApiKeyManager } from '../core/api-key-manager';
import { TtlCache } from '../utils/cache';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger } from '../utils/logger';

const BASE_URL = 'https://api.coincap.io/v2';

/**
 * CoinCap API adapter — fallback data source.
 * Used when CryptoRank and Mobula are unavailable.
 */
export class CoinCapAdapter {
  constructor(
    private keyManager: ApiKeyManager,
    private cache: TtlCache,
  ) {}

  async fetchCoinData(symbols: string[]): Promise<Map<string, EnrichmentData>> {
    const results = new Map<string, EnrichmentData>();
    const uncached: string[] = [];

    for (const sym of symbols) {
      const cached = this.cache.get<EnrichmentData>(`coincap:${sym}`);
      if (cached) {
        results.set(sym, cached);
      } else {
        uncached.push(sym);
      }
    }

    if (uncached.length === 0) return results;

    const headers: Record<string, string> = {};
    const apiKey = this.keyManager.getKey('coincap');
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const data = await fetchWithBackoff<CoinCapResponse>(
        `${BASE_URL}/assets?limit=2000`,
        { headers, label: 'coincap/assets' },
      );

      const symbolSet = new Set(uncached.map((s) => s.toUpperCase()));

      for (const asset of data.data) {
        const sym = asset.symbol.toUpperCase();
        if (!symbolSet.has(sym)) continue;

        const enrichment: EnrichmentData = {
          marketCap: parseFloat(asset.marketCapUsd) || 0,
          fullyDilutedValuation:
            asset.maxSupply
              ? parseFloat(asset.priceUsd) * parseFloat(asset.maxSupply)
              : parseFloat(asset.marketCapUsd) || 0,
          circulatingSupply: parseFloat(asset.supply) || 0,
          totalSupply: parseFloat(asset.supply) || 0,
          maxSupply: asset.maxSupply ? parseFloat(asset.maxSupply) : null,
          priceChange7d: 0,
          priceChange30d: 0,
          sector: 'Other',
          categories: [],
          source: 'coincap',
        };

        results.set(sym, enrichment);
        this.cache.set(`coincap:${sym}`, enrichment);
      }

      logger.info(
        { requested: uncached.length, found: results.size - (symbols.length - uncached.length) },
        'CoinCap fallback enrichment complete',
      );
    } catch (err) {
      const error = err as Error;
      logger.error({ error: error.message }, 'CoinCap fetch failed');
      if (apiKey) {
        this.keyManager.reportFailure('coincap', apiKey);
      }
    }

    return results;
  }
}
