import { eq, desc, gte, and } from 'drizzle-orm';
import { getDb } from './db';
import { scanResults, scoreHistory } from './schema';
import { CoinData } from '../types';
import { logger } from '../utils/logger';

/**
 * Repository for persisting and querying scan results.
 * Enables time-series analysis (e.g., "Is this coin's score trending up?").
 */
export class ScanRepository {
  /**
   * Persist a batch of scored coins from a single scan run.
   */
  saveScanResults(scanId: string, coins: CoinData[]): void {
    const db = getDb();
    const now = new Date();

    const rows = coins.map((coin) => ({
      scanId,
      symbol: coin.symbol,
      name: coin.name,
      price: coin.price,
      marketCap: coin.marketCap,
      volume24h: coin.volume24h,
      fdvMcRatio: coin.fdvMcRatio,
      priceChange24h: coin.priceChange24h,
      priceChange7d: coin.priceChange7d,
      priceChange30d: coin.priceChange30d,
      alphaScore: coin.alphaScore,
      liquidityScore: coin.scoreBreakdown.liquidity,
      tokenomicsScore: coin.scoreBreakdown.tokenomics,
      marketCapScore: coin.scoreBreakdown.marketCap,
      momentumScore: coin.scoreBreakdown.momentum,
      onChainScore: coin.scoreBreakdown.onChain,
      sector: coin.sector,
      scannedAt: now,
    }));

    for (const row of rows) {
      db.insert(scanResults).values(row).run();
    }

    const historyRows = coins.map((coin) => ({
      symbol: coin.symbol,
      alphaScore: coin.alphaScore,
      price: coin.price,
      volume24h: coin.volume24h,
      recordedAt: now,
    }));

    for (const row of historyRows) {
      db.insert(scoreHistory).values(row).run();
    }

    logger.info(
      { scanId, saved: coins.length },
      'Scan results persisted to SQLite',
    );
  }

  /**
   * Get the score trend for a symbol over a given time window.
   * Returns scores ordered oldest → newest.
   */
  getScoreTrend(
    symbol: string,
    windowMs = 3 * 60 * 60 * 1000,
  ): Array<{ alphaScore: number; price: number; recordedAt: Date }> {
    const db = getDb();
    const cutoff = new Date(Date.now() - windowMs);

    return db
      .select({
        alphaScore: scoreHistory.alphaScore,
        price: scoreHistory.price,
        recordedAt: scoreHistory.recordedAt,
      })
      .from(scoreHistory)
      .where(
        and(eq(scoreHistory.symbol, symbol), gte(scoreHistory.recordedAt, cutoff)),
      )
      .orderBy(scoreHistory.recordedAt)
      .all();
  }

  /**
   * Get the latest scan result for each symbol.
   */
  getLatestScores(
    limit = 30,
  ): Array<{ symbol: string; alphaScore: number; price: number; recordedAt: Date }> {
    const db = getDb();

    return db
      .select({
        symbol: scoreHistory.symbol,
        alphaScore: scoreHistory.alphaScore,
        price: scoreHistory.price,
        recordedAt: scoreHistory.recordedAt,
      })
      .from(scoreHistory)
      .orderBy(desc(scoreHistory.recordedAt))
      .limit(limit)
      .all();
  }

  /**
   * Determine if a coin's score is trending up or down.
   * Returns delta (latest - earliest) within the window.
   */
  getScoreDelta(
    symbol: string,
    windowMs = 3 * 60 * 60 * 1000,
  ): { delta: number; direction: 'UP' | 'DOWN' | 'FLAT'; samples: number } {
    const trend = this.getScoreTrend(symbol, windowMs);

    if (trend.length < 2) {
      return { delta: 0, direction: 'FLAT', samples: trend.length };
    }

    const earliest = trend[0].alphaScore;
    const latest = trend[trend.length - 1].alphaScore;
    const delta = latest - earliest;

    let direction: 'UP' | 'DOWN' | 'FLAT';
    if (delta > 0.5) direction = 'UP';
    else if (delta < -0.5) direction = 'DOWN';
    else direction = 'FLAT';

    return { delta, direction, samples: trend.length };
  }
}
