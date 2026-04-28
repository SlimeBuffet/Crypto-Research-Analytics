import { SentimentData } from '../types';
import { TtlCache } from '../utils/cache';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger } from '../utils/logger';

const BASE_URL = 'https://lunarcrush.com/api4';

/**
 * LunarCrush API adapter — social sentiment and Galaxy Score data.
 * Provides social volume, Galaxy Score, and AltRank for crypto assets.
 *
 * Note: Requires an active LunarCrush subscription (Individual or higher).
 * Free-tier keys may receive 402 errors on some endpoints.
 */
export class LunarCrushAdapter {
  private apiKey: string | null;

  constructor(private cache: TtlCache) {
    this.apiKey = process.env.LUNARCRUSH_API_KEY || null;
  }

  async fetchSentiment(symbols: string[]): Promise<Map<string, SentimentData>> {
    const results = new Map<string, SentimentData>();
    const uncached: string[] = [];

    for (const sym of symbols) {
      const cached = this.cache.get<SentimentData>(`lunarcrush:${sym}`);
      if (cached) {
        results.set(sym, cached);
      } else {
        uncached.push(sym);
      }
    }

    if (uncached.length === 0) {
      logger.debug('All LunarCrush data served from cache');
      return results;
    }

    if (!this.apiKey) {
      logger.debug('No LunarCrush API key configured, skipping sentiment');
      return results;
    }

    // Fetch sentiment data for each symbol individually
    for (const sym of uncached) {
      try {
        const data = await this.fetchCoinSentiment(sym);
        if (data) {
          results.set(sym, data);
          this.cache.set(`lunarcrush:${sym}`, data, 15 * 60 * 1000); // 15 min cache
        }
      } catch {
        // Individual symbol failures are non-fatal
        logger.debug({ symbol: sym }, 'LunarCrush fetch failed for symbol');
      }
    }

    logger.info(
      { requested: uncached.length, found: results.size - (symbols.length - uncached.length) },
      'LunarCrush sentiment fetch complete',
    );

    return results;
  }

  private async fetchCoinSentiment(symbol: string): Promise<SentimentData | null> {
    try {
      const response = await fetchWithBackoff<Record<string, unknown>>(
        `${BASE_URL}/public/coins/${symbol}/v1`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          label: `lunarcrush/coin/${symbol}`,
          retries: 1,
        },
      );

      const data = response.data as Record<string, unknown> | undefined;
      if (!data) return null;

      const sentiment: SentimentData = {
        galaxyScore: (data.galaxy_score as number) || 0,
        altRank: (data.alt_rank as number) || 0,
        socialVolume: (data.social_volume as number) || 0,
        socialScore: (data.social_score as number) || 0,
        socialContributors: (data.social_contributors as number) || 0,
        socialDominance: (data.social_dominance as number) || 0,
        source: 'lunarcrush',
      };

      return sentiment;
    } catch (err) {
      const error = err as { response?: { status?: number }; message?: string };
      if (error.response?.status === 402) {
        logger.warn(
          'LunarCrush API requires paid subscription (402). Skipping sentiment data.',
        );
        this.apiKey = null; // Disable further attempts
      }
      return null;
    }
  }
}
