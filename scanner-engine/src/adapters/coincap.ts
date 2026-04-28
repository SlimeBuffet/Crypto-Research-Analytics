import { CoinCapResponse, CoinGeckoMarketCoin, EnrichmentData } from '../types';
import { ApiKeyManager } from '../core/api-key-manager';
import { TtlCache } from '../utils/cache';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger } from '../utils/logger';

const COINCAP_URL = process.env.COINCAP_BASE_URL || 'https://api.coincap.io/v2';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

/**
 * CoinCap + CoinGecko fallback adapter.
 * Tries CoinCap first; if it fails (DNS/timeout/error), falls back to CoinGecko.
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

    // Try CoinCap first
    const coincapResults = await this.tryCoinCap(uncached);
    for (const [sym, data] of coincapResults) {
      results.set(sym, data);
    }

    // Fall back to CoinGecko for any remaining symbols
    const stillMissing = uncached.filter((s) => !results.has(s));
    if (stillMissing.length > 0) {
      const geckoResults = await this.tryCoinGecko(stillMissing);
      for (const [sym, data] of geckoResults) {
        results.set(sym, data);
      }
    }

    return results;
  }

  private async tryCoinCap(symbols: string[]): Promise<Map<string, EnrichmentData>> {
    const results = new Map<string, EnrichmentData>();

    const headers: Record<string, string> = {};
    const apiKey = this.keyManager.getKey('coincap');
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const data = await fetchWithBackoff<CoinCapResponse>(
        `${COINCAP_URL}/assets?limit=2000`,
        { headers, label: 'coincap/assets', retries: 1 },
      );

      const symbolSet = new Set(symbols.map((s) => s.toUpperCase()));

      for (const asset of data.data) {
        const sym = asset.symbol.toUpperCase();
        if (!symbolSet.has(sym)) continue;

        const enrichment: EnrichmentData = {
          name: asset.name,
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
        { requested: symbols.length, found: results.size },
        'CoinCap enrichment complete',
      );
    } catch (err) {
      const error = err as Error;
      logger.warn({ error: error.message }, 'CoinCap fetch failed, will try CoinGecko fallback');
      if (apiKey) {
        this.keyManager.reportFailure('coincap', apiKey);
      }
    }

    return results;
  }

  private async tryCoinGecko(symbols: string[]): Promise<Map<string, EnrichmentData>> {
    const results = new Map<string, EnrichmentData>();

    try {
      // CoinGecko free API: fetch top coins by market cap (max 250 per page)
      const pages = Math.min(4, Math.ceil(symbols.length / 250));
      const symbolSet = new Set(symbols.map((s) => s.toUpperCase()));

      for (let page = 1; page <= pages; page++) {
        try {
          const coins = await fetchWithBackoff<CoinGeckoMarketCoin[]>(
            `${COINGECKO_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=7d,30d`,
            { label: `coingecko/markets/page${page}`, retries: 2 },
          );

          for (const coin of coins) {
            const sym = coin.symbol.toUpperCase();
            if (!symbolSet.has(sym)) continue;

            const enrichment: EnrichmentData = {
              name: coin.name,
              marketCap: coin.market_cap || 0,
              fullyDilutedValuation: coin.fully_diluted_valuation || coin.market_cap || 0,
              circulatingSupply: coin.circulating_supply || 0,
              totalSupply: coin.total_supply || 0,
              maxSupply: coin.max_supply || null,
              priceChange7d: coin.price_change_percentage_7d_in_currency || 0,
              priceChange30d: coin.price_change_percentage_30d_in_currency || 0,
              sector: 'Other',
              categories: [],
              source: 'coingecko',
            };

            results.set(sym, enrichment);
            this.cache.set(`coincap:${sym}`, enrichment);
          }

          // Respect CoinGecko rate limits (10-30 calls/min for free tier)
          if (page < pages) {
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
        } catch (err) {
          const error = err as Error;
          logger.warn({ error: error.message, page }, 'CoinGecko page fetch failed');
          break;
        }
      }

      logger.info(
        { requested: symbols.length, found: results.size },
        'CoinGecko fallback enrichment complete',
      );
    } catch (err) {
      const error = err as Error;
      logger.error({ error: error.message }, 'CoinGecko fallback also failed');
    }

    return results;
  }
}
