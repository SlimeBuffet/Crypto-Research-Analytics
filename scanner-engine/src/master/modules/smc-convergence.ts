import { CoinData, BinanceKline } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import {
  SmcConvergenceResult,
  LiquidityGrab,
  SmcAnalysis,
} from '../types';

/**
 * Smart Money Convergence (SMC Score) Module
 *
 * Detects Liquidity Grabs — when price drops sharply to take out
 * retail stop losses (sell-side liquidity), then bounces strongly
 * (rejection). This is how institutions enter positions.
 *
 * When a confirmed Liquidity Grab + Rejection is detected,
 * the system signals "Ultra Gem".
 */
export class SmcConvergenceEngine {
  private binance: BinanceAdapter;

  constructor() {
    this.binance = new BinanceAdapter();
  }

  /**
   * Analyze a coin for Smart Money Convergence signals.
   */
  async analyze(
    coin: CoinData,
    smcAnalysis?: SmcAnalysis,
  ): Promise<SmcConvergenceResult> {
    const liquidityGrabs: LiquidityGrab[] = [];

    try {
      // Fetch multiple timeframe klines
      const [klines1h, klines4h] = await Promise.all([
        this.binance.fetchKlines(coin.symbol, '1h', 50),
        this.binance.fetchKlines(coin.symbol, '4h', 50),
      ]);

      // Detect liquidity grabs on each timeframe
      const grabs1h = this.detectLiquidityGrabs(klines1h, coin);
      const grabs4h = this.detectLiquidityGrabs(klines4h, coin);

      liquidityGrabs.push(...grabs1h, ...grabs4h);
    } catch {
      logger.debug({ symbol: coin.symbol }, 'SMC convergence analysis failed');
    }

    // Cross-reference with SMC analysis if available
    const confirmedGrabs = this.confirmWithSmcData(liquidityGrabs, smcAnalysis);

    const convergenceScore = this.calculateConvergenceScore(
      confirmedGrabs,
      coin,
    );

    const isUltraGem =
      confirmedGrabs.some((g) => g.isConfirmed && g.rejectionStrength > 0.7) &&
      convergenceScore >= 7;

    let institutionalSignal: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    if (convergenceScore >= 8) institutionalSignal = 'STRONG';
    else if (convergenceScore >= 5) institutionalSignal = 'MODERATE';
    else if (convergenceScore >= 3) institutionalSignal = 'WEAK';
    else institutionalSignal = 'NONE';

    return {
      symbol: coin.symbol,
      liquidityGrabs: confirmedGrabs,
      convergenceScore,
      isUltraGem,
      institutionalSignal,
    };
  }

  /**
   * Detect Liquidity Grabs from kline data.
   *
   * Pattern:
   *   1. Price drops sharply below recent support (taking stop losses)
   *   2. Strong rejection/bounce candle (long lower wick)
   *   3. Volume spikes during the sweep
   */
  private detectLiquidityGrabs(
    klines: BinanceKline[],
    _coin: CoinData,
  ): LiquidityGrab[] {
    const grabs: LiquidityGrab[] = [];

    if (klines.length < 10) return grabs;

    for (let i = 5; i < klines.length - 1; i++) {
      const candle = klines[i];
      const prevCandles = klines.slice(Math.max(0, i - 5), i);

      const low = parseFloat(candle.low);
      const high = parseFloat(candle.high);
      const open = parseFloat(candle.open);
      const close = parseFloat(candle.close);
      const volume = parseFloat(candle.volume);

      // Find recent support level (lowest low of previous candles)
      const recentLows = prevCandles.map((k) => parseFloat(k.low));
      const supportLevel = Math.min(...recentLows);

      // Find recent resistance level
      const recentHighs = prevCandles.map((k) => parseFloat(k.high));
      const resistanceLevel = Math.max(...recentHighs);

      // Calculate average volume
      const avgVolume =
        prevCandles.reduce((s, k) => s + parseFloat(k.volume), 0) /
        prevCandles.length;

      const candleRange = high - low;
      if (candleRange === 0) continue;

      // Long squeeze: price dips below support then bounces (bullish grab)
      if (low < supportLevel * 0.998 && close > open) {
        const lowerWick = Math.min(open, close) - low;
        const rejectionStrength = lowerWick / candleRange;
        const volumeSpike = avgVolume > 0 ? volume / avgVolume : 1;

        if (rejectionStrength > 0.3 && volumeSpike > 1.5) {
          grabs.push({
            type: 'LONG_SQUEEZE',
            sweepPrice: low,
            rejectionPrice: close,
            rejectionStrength: Math.min(1, rejectionStrength),
            timestamp: candle.openTime,
            volumeSpike: Math.round(volumeSpike * 100) / 100,
            isConfirmed: false,
          });
        }
      }

      // Short squeeze: price spikes above resistance then dumps (bearish grab)
      if (high > resistanceLevel * 1.002 && close < open) {
        const upperWick = high - Math.max(open, close);
        const rejectionStrength = upperWick / candleRange;
        const volumeSpike = avgVolume > 0 ? volume / avgVolume : 1;

        if (rejectionStrength > 0.3 && volumeSpike > 1.5) {
          grabs.push({
            type: 'SHORT_SQUEEZE',
            sweepPrice: high,
            rejectionPrice: close,
            rejectionStrength: Math.min(1, rejectionStrength),
            timestamp: candle.openTime,
            volumeSpike: Math.round(volumeSpike * 100) / 100,
            isConfirmed: false,
          });
        }
      }
    }

    return grabs;
  }

  /**
   * Confirm liquidity grabs with SMC analysis data.
   * A grab near an Order Block or swept liquidity level is confirmed.
   */
  private confirmWithSmcData(
    grabs: LiquidityGrab[],
    smc?: SmcAnalysis,
  ): LiquidityGrab[] {
    if (!smc) return grabs;

    return grabs.map((grab) => {
      let confirmed = false;

      // Check if grab aligns with an Order Block
      for (const ob of smc.orderBlocks) {
        if (
          ob.type === 'BULLISH_OB' &&
          grab.type === 'LONG_SQUEEZE' &&
          grab.sweepPrice >= ob.lowPrice * 0.99 &&
          grab.sweepPrice <= ob.highPrice * 1.01
        ) {
          confirmed = true;
          break;
        }

        if (
          ob.type === 'BEARISH_OB' &&
          grab.type === 'SHORT_SQUEEZE' &&
          grab.sweepPrice >= ob.lowPrice * 0.99 &&
          grab.sweepPrice <= ob.highPrice * 1.01
        ) {
          confirmed = true;
          break;
        }
      }

      // Check if grab aligns with a swept liquidity level
      for (const level of smc.liquidityLevels) {
        if (
          level.isSwept &&
          Math.abs(grab.sweepPrice - level.price) / level.price < 0.01
        ) {
          confirmed = true;
          break;
        }
      }

      return { ...grab, isConfirmed: confirmed || grab.rejectionStrength > 0.6 };
    });
  }

  /**
   * Calculate convergence score (0-10).
   */
  private calculateConvergenceScore(
    grabs: LiquidityGrab[],
    _coin: CoinData,
  ): number {
    if (grabs.length === 0) return 0;

    let score = 0;

    // Number of confirmed grabs
    const confirmed = grabs.filter((g) => g.isConfirmed);
    score += Math.min(3, confirmed.length * 1.5);

    // Rejection strength of best grab
    const bestRejection = Math.max(...grabs.map((g) => g.rejectionStrength));
    score += bestRejection * 3;

    // Volume spike during grab
    const bestVolumeSpike = Math.max(...grabs.map((g) => g.volumeSpike));
    if (bestVolumeSpike > 3) score += 2;
    else if (bestVolumeSpike > 2) score += 1.5;
    else if (bestVolumeSpike > 1.5) score += 1;

    // Recency bonus (most recent grab within last 24h)
    const now = Date.now();
    const recentGrabs = grabs.filter(
      (g) => now - g.timestamp < 24 * 60 * 60 * 1000,
    );
    if (recentGrabs.length > 0) score += 1;

    return Math.min(10, Math.round(score * 100) / 100);
  }

  /**
   * Batch analyze multiple coins.
   */
  async analyzeBatch(
    coins: CoinData[],
    smcResults?: Map<string, SmcAnalysis>,
  ): Promise<Map<string, SmcConvergenceResult>> {
    const results = new Map<string, SmcConvergenceResult>();

    for (const coin of coins) {
      try {
        const smc = smcResults?.get(coin.symbol);
        const result = await this.analyze(coin, smc);
        results.set(coin.symbol, result);
      } catch {
        logger.debug({ symbol: coin.symbol }, 'SMC convergence failed');
      }
    }

    return results;
  }
}
