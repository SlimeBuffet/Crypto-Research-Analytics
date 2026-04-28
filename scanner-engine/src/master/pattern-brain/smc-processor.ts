import { BinanceKline } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import { CircuitBreaker } from '../utils/circuit-breaker';
import {
  SmcAnalysis,
  MarketStructure,
  OrderBlock,
  FairValueGap,
  LiquidityLevel,
  SwingPoint,
  VectorizedOHLC,
} from '../types';

/**
 * Layer 2: The Pattern Brain — SMC Processor (Enhanced)
 *
 * Reference: joshyattridge/smart-money-concepts
 *
 * Enhanced features:
 *   1. Vectorized OHLC computation using Float64Array for bulk processing
 *   2. Optimized Order Block detection with body-to-wick ratio analysis
 *   3. Multi-timeframe confluence scoring
 *   4. Circuit Breaker on Binance API calls
 */
export class SmcProcessor {
  private binance: BinanceAdapter;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.binance = new BinanceAdapter();
    this.circuitBreaker = new CircuitBreaker({
      name: 'smc-binance',
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    });
  }

  /**
   * Run full SMC analysis on a symbol across multiple timeframes.
   * Uses vectorized OHLC processing for performance.
   */
  async analyze(symbol: string, timeframes: string[] = ['1h', '4h', '1d']): Promise<SmcAnalysis> {
    const allOrderBlocks: OrderBlock[] = [];
    const allFvgs: FairValueGap[] = [];
    const allLiquidityLevels: LiquidityLevel[] = [];
    let primaryStructure: MarketStructure | null = null;

    for (const tf of timeframes) {
      try {
        const klines = await this.circuitBreaker.execute(
          () => this.binance.fetchKlines(symbol, tf, 100),
        );

        if (klines.length < 10) continue;

        // Vectorize OHLC data for fast computation
        const vectorized = this.vectorizeOHLC(klines);

        const structure = this.analyzeMarketStructureVectorized(vectorized, klines);
        if (!primaryStructure || tf === '1h') {
          primaryStructure = structure;
        }

        const obs = this.detectOrderBlocksVectorized(vectorized, klines, tf);
        allOrderBlocks.push(...obs);

        const fvgs = this.detectFairValueGapsVectorized(vectorized, klines, tf);
        allFvgs.push(...fvgs);

        const liquidity = this.detectLiquidityLevelsVectorized(vectorized, klines);
        allLiquidityLevels.push(...liquidity);
      } catch {
        logger.debug({ symbol, timeframe: tf }, 'SMC analysis failed for timeframe');
      }
    }

    const defaultStructure: MarketStructure = {
      currentTrend: 'RANGING',
      swingHighs: [],
      swingLows: [],
      mssDetected: false,
      mssType: null,
      mssPrice: null,
      mssTimestamp: null,
      breakOfStructure: false,
    };

    const smcScore = this.calculateSmcScore(
      primaryStructure || defaultStructure,
      allOrderBlocks,
      allFvgs,
      allLiquidityLevels,
    );

    const bias = this.determineBias(
      primaryStructure || defaultStructure,
      allOrderBlocks,
      allFvgs,
    );

    return {
      symbol,
      marketStructure: primaryStructure || defaultStructure,
      orderBlocks: allOrderBlocks.slice(0, 20),
      fairValueGaps: allFvgs.slice(0, 20),
      liquidityLevels: allLiquidityLevels.slice(0, 15),
      smcScore,
      bias,
    };
  }

  /**
   * Convert BinanceKline array to VectorizedOHLC using Float64Array.
   * This enables SIMD-like batch operations on price data.
   */
  private vectorizeOHLC(klines: BinanceKline[]): VectorizedOHLC {
    const n = klines.length;
    const opens = new Float64Array(n);
    const highs = new Float64Array(n);
    const lows = new Float64Array(n);
    const closes = new Float64Array(n);
    const volumes = new Float64Array(n);
    const timestamps = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      opens[i] = parseFloat(klines[i].open);
      highs[i] = parseFloat(klines[i].high);
      lows[i] = parseFloat(klines[i].low);
      closes[i] = parseFloat(klines[i].close);
      volumes[i] = parseFloat(klines[i].quoteAssetVolume);
      timestamps[i] = klines[i].openTime;
    }

    return { opens, highs, lows, closes, volumes, timestamps, length: n };
  }

  /**
   * Analyze market structure using vectorized data.
   * Detects swing highs/lows, MSS, and break of structure.
   */
  private analyzeMarketStructureVectorized(
    v: VectorizedOHLC, klines: BinanceKline[],
  ): MarketStructure {
    const swingHighs: SwingPoint[] = [];
    const swingLows: SwingPoint[] = [];
    const lookback = 5;

    // Vectorized swing detection
    for (let i = lookback; i < v.length - lookback; i++) {
      let isSwingHigh = true;
      let isSwingLow = true;

      for (let j = 1; j <= lookback; j++) {
        if (v.highs[i] <= v.highs[i - j] || v.highs[i] <= v.highs[i + j]) {
          isSwingHigh = false;
        }
        if (v.lows[i] >= v.lows[i - j] || v.lows[i] >= v.lows[i + j]) {
          isSwingLow = false;
        }
      }

      if (isSwingHigh) {
        swingHighs.push({
          price: v.highs[i],
          timestamp: klines[i].openTime,
          index: i,
          isValid: true,
        });
      }
      if (isSwingLow) {
        swingLows.push({
          price: v.lows[i],
          timestamp: klines[i].openTime,
          index: i,
          isValid: true,
        });
      }
    }

    // MSS detection via vectorized comparison
    let mssDetected = false;
    let mssType: MarketStructure['mssType'] = null;
    let mssPrice: number | null = null;
    let mssTimestamp: number | null = null;
    let breakOfStructure = false;

    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const recentHighs = swingHighs.slice(-3);
      const recentLows = swingLows.slice(-3);

      // Bullish MSS: lower lows followed by break above recent swing high
      const lastHigh = recentHighs[recentHighs.length - 1];
      const lastLow = recentLows[recentLows.length - 1];
      const currentPrice = v.closes[v.length - 1];

      if (recentLows.length >= 2) {
        const prevLow = recentLows[recentLows.length - 2];
        if (lastLow.price < prevLow.price && currentPrice > lastHigh.price) {
          mssDetected = true;
          mssType = 'BULLISH_MSS';
          mssPrice = lastHigh.price;
          mssTimestamp = klines[v.length - 1].openTime;
          breakOfStructure = true;
        }
      }

      if (!mssDetected && recentHighs.length >= 2) {
        const prevHigh = recentHighs[recentHighs.length - 2];
        if (lastHigh.price > prevHigh.price && currentPrice < lastLow.price) {
          mssDetected = true;
          mssType = 'BEARISH_MSS';
          mssPrice = lastLow.price;
          mssTimestamp = klines[v.length - 1].openTime;
          breakOfStructure = true;
        }
      }
    }

    // Trend determination from vectorized data
    let currentTrend: MarketStructure['currentTrend'] = 'RANGING';
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const h1 = swingHighs[swingHighs.length - 2];
      const h2 = swingHighs[swingHighs.length - 1];
      const l1 = swingLows[swingLows.length - 2];
      const l2 = swingLows[swingLows.length - 1];
      if (h2.price > h1.price && l2.price > l1.price) currentTrend = 'BULLISH';
      else if (h2.price < h1.price && l2.price < l1.price) currentTrend = 'BEARISH';
    }

    return {
      currentTrend,
      swingHighs: swingHighs.slice(-10),
      swingLows: swingLows.slice(-10),
      mssDetected,
      mssType,
      mssPrice,
      mssTimestamp,
      breakOfStructure,
    };
  }

  /**
   * Detect Order Blocks using vectorized OHLC data.
   * Uses body-to-wick ratio and volume analysis for quality scoring.
   */
  private detectOrderBlocksVectorized(
    v: VectorizedOHLC, klines: BinanceKline[], timeframe: string,
  ): OrderBlock[] {
    const orderBlocks: OrderBlock[] = [];
    if (v.length < 5) return orderBlocks;

    // Precompute body sizes and wick ratios vectorized
    const bodySizes = new Float64Array(v.length);
    const totalRanges = new Float64Array(v.length);
    const bodyRatios = new Float64Array(v.length);

    for (let i = 0; i < v.length; i++) {
      bodySizes[i] = Math.abs(v.closes[i] - v.opens[i]);
      totalRanges[i] = v.highs[i] - v.lows[i];
      bodyRatios[i] = totalRanges[i] > 0 ? bodySizes[i] / totalRanges[i] : 0;
    }

    // Compute average body size for impulse threshold
    let avgBody = 0;
    for (let i = 0; i < v.length; i++) avgBody += bodySizes[i];
    avgBody /= v.length;

    for (let i = 2; i < v.length - 1; i++) {
      const currentBullish = v.closes[i] > v.opens[i];
      const prevBearish = v.closes[i - 1] < v.opens[i - 1];
      const prevBullish = v.closes[i - 1] > v.opens[i - 1];
      const currentBearish = v.closes[i] < v.opens[i];

      // Bullish OB: last bearish candle before bullish impulse
      if (prevBearish && currentBullish && bodySizes[i] > avgBody * 1.5) {
        const strength = this.calculateOBStrength(v, i, bodyRatios);
        const isMitigated = this.isOBMitigated(v, i, 'BULLISH_OB');

        orderBlocks.push({
          type: 'BULLISH_OB',
          highPrice: v.highs[i - 1],
          lowPrice: v.lows[i - 1],
          midPrice: (v.highs[i - 1] + v.lows[i - 1]) / 2,
          timestamp: klines[i - 1].openTime,
          timeframe,
          isMitigated,
          strength,
          touchCount: this.countTouches(v, v.lows[i - 1], v.highs[i - 1], i),
        });
      }

      // Bearish OB: last bullish candle before bearish impulse
      if (prevBullish && currentBearish && bodySizes[i] > avgBody * 1.5) {
        const strength = this.calculateOBStrength(v, i, bodyRatios);
        const isMitigated = this.isOBMitigated(v, i, 'BEARISH_OB');

        orderBlocks.push({
          type: 'BEARISH_OB',
          highPrice: v.highs[i - 1],
          lowPrice: v.lows[i - 1],
          midPrice: (v.highs[i - 1] + v.lows[i - 1]) / 2,
          timestamp: klines[i - 1].openTime,
          timeframe,
          isMitigated,
          strength,
          touchCount: this.countTouches(v, v.lows[i - 1], v.highs[i - 1], i),
        });
      }
    }

    return orderBlocks
      .filter((ob) => !ob.isMitigated)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 10);
  }

  /**
   * Calculate OB strength based on:
   * - Body-to-wick ratio of the impulse candle
   * - Volume relative to average
   * - Distance from current price
   */
  private calculateOBStrength(
    v: VectorizedOHLC, impulseIdx: number, bodyRatios: Float64Array,
  ): number {
    let strength = 0;

    // Body ratio score (0-3): higher body ratio = stronger impulse
    strength += Math.min(3, bodyRatios[impulseIdx] * 4);

    // Volume score (0-3): compare to rolling average
    let avgVol = 0;
    const start = Math.max(0, impulseIdx - 20);
    for (let j = start; j < impulseIdx; j++) avgVol += v.volumes[j];
    avgVol /= Math.max(1, impulseIdx - start);
    if (avgVol > 0) {
      const volRatio = v.volumes[impulseIdx] / avgVol;
      strength += Math.min(3, volRatio);
    }

    // Proximity score (0-2): closer to current price = more relevant
    const currentPrice = v.closes[v.length - 1];
    const obMid = (v.highs[impulseIdx - 1] + v.lows[impulseIdx - 1]) / 2;
    const distance = Math.abs(currentPrice - obMid) / currentPrice;
    strength += Math.max(0, 2 - distance * 20);

    // Freshness score (0-2): more recent = more relevant
    const age = v.length - impulseIdx;
    strength += Math.max(0, 2 - age / 25);

    return Math.min(10, Math.round(strength * 100) / 100);
  }

  private isOBMitigated(v: VectorizedOHLC, obIdx: number, type: string): boolean {
    for (let i = obIdx + 1; i < v.length; i++) {
      if (type === 'BULLISH_OB' && v.lows[i] < v.lows[obIdx - 1]) return true;
      if (type === 'BEARISH_OB' && v.highs[i] > v.highs[obIdx - 1]) return true;
    }
    return false;
  }

  private countTouches(v: VectorizedOHLC, low: number, high: number, startIdx: number): number {
    let touches = 0;
    for (let i = startIdx; i < v.length; i++) {
      if (v.lows[i] <= high && v.highs[i] >= low) touches++;
    }
    return touches;
  }

  /**
   * Detect Fair Value Gaps using vectorized data.
   */
  private detectFairValueGapsVectorized(
    v: VectorizedOHLC, klines: BinanceKline[], timeframe: string,
  ): FairValueGap[] {
    const fvgs: FairValueGap[] = [];
    if (v.length < 3) return fvgs;

    for (let i = 2; i < v.length; i++) {
      // Bullish FVG: candle[i-2].high < candle[i].low
      if (v.highs[i - 2] < v.lows[i]) {
        const gapSize = v.lows[i] - v.highs[i - 2];
        const midPrice = (v.highs[i - 2] + v.lows[i]) / 2;

        const fillPct = this.calculateFillPercentage(
          v, i, v.highs[i - 2], v.lows[i], 'BULLISH_FVG',
        );

        fvgs.push({
          type: 'BULLISH_FVG',
          highPrice: v.lows[i],
          lowPrice: v.highs[i - 2],
          gapSize,
          gapPercentage: midPrice > 0 ? (gapSize / midPrice) * 100 : 0,
          timestamp: klines[i - 1].openTime,
          timeframe,
          isFilled: fillPct >= 100,
          fillPercentage: fillPct,
        });
      }

      // Bearish FVG: candle[i].high < candle[i-2].low
      if (v.highs[i] < v.lows[i - 2]) {
        const gapSize = v.lows[i - 2] - v.highs[i];
        const midPrice = (v.lows[i - 2] + v.highs[i]) / 2;

        const fillPct = this.calculateFillPercentage(
          v, i, v.highs[i], v.lows[i - 2], 'BEARISH_FVG',
        );

        fvgs.push({
          type: 'BEARISH_FVG',
          highPrice: v.lows[i - 2],
          lowPrice: v.highs[i],
          gapSize,
          gapPercentage: midPrice > 0 ? (gapSize / midPrice) * 100 : 0,
          timestamp: klines[i - 1].openTime,
          timeframe,
          isFilled: fillPct >= 100,
          fillPercentage: fillPct,
        });
      }
    }

    return fvgs.filter((f) => !f.isFilled).slice(0, 10);
  }

  private calculateFillPercentage(
    v: VectorizedOHLC, startIdx: number, low: number, high: number, type: string,
  ): number {
    let maxFill = 0;
    const gapSize = high - low;
    if (gapSize <= 0) return 100;

    for (let i = startIdx + 1; i < v.length; i++) {
      if (type === 'BULLISH_FVG') {
        const fill = Math.max(0, v.lows[i] <= high ? (high - Math.max(v.lows[i], low)) / gapSize * 100 : 0);
        maxFill = Math.max(maxFill, fill);
      } else {
        const fill = Math.max(0, v.highs[i] >= low ? (Math.min(v.highs[i], high) - low) / gapSize * 100 : 0);
        maxFill = Math.max(maxFill, fill);
      }
      if (maxFill >= 100) return 100;
    }
    return Math.round(maxFill * 10) / 10;
  }

  /**
   * Detect liquidity levels using vectorized data.
   */
  private detectLiquidityLevelsVectorized(
    v: VectorizedOHLC, klines: BinanceKline[],
  ): LiquidityLevel[] {
    const levels: LiquidityLevel[] = [];
    const tolerance = 0.002;

    // Find equal highs (buy-side liquidity)
    for (let i = 0; i < v.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 30, v.length); j++) {
        const diff = Math.abs(v.highs[i] - v.highs[j]) / v.highs[i];
        if (diff < tolerance) {
          const existingLevel = levels.find(
            (l) => l.type === 'BUY_SIDE' && Math.abs(l.price - v.highs[i]) / l.price < tolerance,
          );
          if (existingLevel) {
            existingLevel.touchCount++;
            existingLevel.strength = Math.min(10, existingLevel.strength + 1);
          } else {
            const isSwept = this.isLiquiditySwept(v, v.highs[i], 'BUY_SIDE', j);
            levels.push({
              type: 'BUY_SIDE',
              price: v.highs[i],
              strength: 3,
              touchCount: 2,
              isSwept: isSwept.swept,
              sweepTimestamp: isSwept.timestamp ? klines[isSwept.timestamp]?.openTime ?? null : null,
            });
          }
        }
      }
    }

    // Find equal lows (sell-side liquidity)
    for (let i = 0; i < v.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 30, v.length); j++) {
        const diff = Math.abs(v.lows[i] - v.lows[j]) / v.lows[i];
        if (diff < tolerance) {
          const existingLevel = levels.find(
            (l) => l.type === 'SELL_SIDE' && Math.abs(l.price - v.lows[i]) / l.price < tolerance,
          );
          if (existingLevel) {
            existingLevel.touchCount++;
            existingLevel.strength = Math.min(10, existingLevel.strength + 1);
          } else {
            const isSwept = this.isLiquiditySwept(v, v.lows[i], 'SELL_SIDE', j);
            levels.push({
              type: 'SELL_SIDE',
              price: v.lows[i],
              strength: 3,
              touchCount: 2,
              isSwept: isSwept.swept,
              sweepTimestamp: isSwept.timestamp ? klines[isSwept.timestamp]?.openTime ?? null : null,
            });
          }
        }
      }
    }

    return levels
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 15);
  }

  private isLiquiditySwept(
    v: VectorizedOHLC, level: number, type: string, startIdx: number,
  ): { swept: boolean; timestamp: number | null } {
    for (let i = startIdx + 1; i < v.length; i++) {
      if (type === 'BUY_SIDE' && v.highs[i] > level * 1.002) {
        return { swept: true, timestamp: i };
      }
      if (type === 'SELL_SIDE' && v.lows[i] < level * 0.998) {
        return { swept: true, timestamp: i };
      }
    }
    return { swept: false, timestamp: null };
  }

  private calculateSmcScore(
    structure: MarketStructure,
    orderBlocks: OrderBlock[],
    fvgs: FairValueGap[],
    liquidityLevels: LiquidityLevel[],
  ): number {
    let score = 0;
    if (structure.mssDetected) score += 2;
    if (structure.breakOfStructure) score += 1;
    if (structure.currentTrend !== 'RANGING') score += 1;

    const activeOBs = orderBlocks.filter((ob) => !ob.isMitigated);
    score += Math.min(2, activeOBs.length * 0.5);

    const highStrengthOBs = activeOBs.filter((ob) => ob.strength > 5);
    score += Math.min(1, highStrengthOBs.length * 0.5);

    const activeFVGs = fvgs.filter((f) => !f.isFilled);
    score += Math.min(1, activeFVGs.length * 0.3);

    const sweptLevels = liquidityLevels.filter((l) => l.isSwept);
    score += Math.min(2, sweptLevels.length * 0.5);

    return Math.min(10, Math.round(score * 100) / 100);
  }

  private determineBias(
    structure: MarketStructure,
    orderBlocks: OrderBlock[],
    fvgs: FairValueGap[],
  ): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    let bullishSignals = 0;
    let bearishSignals = 0;

    if (structure.currentTrend === 'BULLISH') bullishSignals += 2;
    if (structure.currentTrend === 'BEARISH') bearishSignals += 2;
    if (structure.mssType === 'BULLISH_MSS') bullishSignals += 3;
    if (structure.mssType === 'BEARISH_MSS') bearishSignals += 3;

    bullishSignals += orderBlocks.filter((ob) => ob.type === 'BULLISH_OB' && !ob.isMitigated).length;
    bearishSignals += orderBlocks.filter((ob) => ob.type === 'BEARISH_OB' && !ob.isMitigated).length;

    bullishSignals += fvgs.filter((f) => f.type === 'BULLISH_FVG' && !f.isFilled).length;
    bearishSignals += fvgs.filter((f) => f.type === 'BEARISH_FVG' && !f.isFilled).length;

    if (bullishSignals > bearishSignals + 2) return 'BULLISH';
    if (bearishSignals > bullishSignals + 2) return 'BEARISH';
    return 'NEUTRAL';
  }

  async analyzeBatch(symbols: string[], timeframes?: string[]): Promise<Map<string, SmcAnalysis>> {
    const results = new Map<string, SmcAnalysis>();
    for (const symbol of symbols) {
      try {
        results.set(symbol, await this.analyze(symbol, timeframes));
      } catch {
        logger.debug({ symbol }, 'SMC batch analysis failed');
      }
    }
    return results;
  }
}
