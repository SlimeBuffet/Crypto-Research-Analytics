import { BinanceKline } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import {
  SmcAnalysis,
  MarketStructure,
  OrderBlock,
  FairValueGap,
  LiquidityLevel,
  SwingPoint,
} from '../types';

/**
 * Layer 2: The Pattern Brain — Smart Money Concepts (SMC) Processor
 *
 * Detects:
 *   - Market Structure Shift (MSS) — break of swing highs/lows
 *   - Order Blocks (OB) — last opposing candle before an impulsive move
 *   - Fair Value Gaps (FVG) — 3-candle imbalance zones
 *   - Liquidity Levels — equal highs/lows acting as liquidity pools
 */
export class SmcProcessor {
  private binance: BinanceAdapter;

  constructor() {
    this.binance = new BinanceAdapter();
  }

  /**
   * Run full SMC analysis on a symbol across multiple timeframes.
   */
  async analyze(symbol: string, timeframes: string[] = ['1h', '4h', '1d']): Promise<SmcAnalysis> {
    const allOrderBlocks: OrderBlock[] = [];
    const allFvgs: FairValueGap[] = [];
    const allLiquidityLevels: LiquidityLevel[] = [];
    let primaryStructure: MarketStructure | null = null;

    for (const tf of timeframes) {
      try {
        const klines = await this.binance.fetchKlines(symbol, tf, 100);

        if (klines.length < 10) continue;

        const structure = this.analyzeMarketStructure(klines);
        if (!primaryStructure || tf === '1h') {
          primaryStructure = structure;
        }

        const obs = this.detectOrderBlocks(klines, tf);
        allOrderBlocks.push(...obs);

        const fvgs = this.detectFairValueGaps(klines, tf);
        allFvgs.push(...fvgs);

        const liqLevels = this.detectLiquidityLevels(klines);
        allLiquidityLevels.push(...liqLevels);
      } catch {
        logger.debug({ symbol, timeframe: tf }, 'SMC analysis failed for timeframe');
      }
    }

    if (!primaryStructure) {
      primaryStructure = this.emptyMarketStructure();
    }

    const smcScore = this.calculateSmcScore(
      primaryStructure,
      allOrderBlocks,
      allFvgs,
      allLiquidityLevels,
    );

    const bias = this.determineBias(primaryStructure, allOrderBlocks);

    return {
      symbol,
      marketStructure: primaryStructure,
      orderBlocks: allOrderBlocks,
      fairValueGaps: allFvgs,
      liquidityLevels: allLiquidityLevels,
      smcScore,
      bias,
    };
  }

  /**
   * Analyze market structure — detect swing highs/lows and MSS.
   */
  private analyzeMarketStructure(klines: BinanceKline[]): MarketStructure {
    const swingHighs = this.findSwingHighs(klines);
    const swingLows = this.findSwingLows(klines);

    let currentTrend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
    let mssDetected = false;
    let mssType: 'BULLISH_MSS' | 'BEARISH_MSS' | null = null;
    let mssPrice: number | null = null;
    let mssTimestamp: number | null = null;
    let breakOfStructure = false;

    // Determine trend from swing structure
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const recentHighs = swingHighs.slice(-3);
      const recentLows = swingLows.slice(-3);

      const higherHighs =
        recentHighs.length >= 2 &&
        recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price;
      const higherLows =
        recentLows.length >= 2 &&
        recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;
      const lowerHighs =
        recentHighs.length >= 2 &&
        recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;
      const lowerLows =
        recentLows.length >= 2 &&
        recentLows[recentLows.length - 1].price < recentLows[recentLows.length - 2].price;

      if (higherHighs && higherLows) {
        currentTrend = 'BULLISH';
      } else if (lowerHighs && lowerLows) {
        currentTrend = 'BEARISH';
      }

      // MSS Detection: trend reversal via break of key swing level
      const lastClose = parseFloat(klines[klines.length - 1].close);

      if (currentTrend === 'BEARISH' && swingHighs.length >= 2) {
        const previousHigh = swingHighs[swingHighs.length - 2];
        if (lastClose > previousHigh.price) {
          mssDetected = true;
          mssType = 'BULLISH_MSS';
          mssPrice = previousHigh.price;
          mssTimestamp = klines[klines.length - 1].openTime;
          breakOfStructure = true;
        }
      }

      if (currentTrend === 'BULLISH' && swingLows.length >= 2) {
        const previousLow = swingLows[swingLows.length - 2];
        if (lastClose < previousLow.price) {
          mssDetected = true;
          mssType = 'BEARISH_MSS';
          mssPrice = previousLow.price;
          mssTimestamp = klines[klines.length - 1].openTime;
          breakOfStructure = true;
        }
      }
    }

    return {
      currentTrend,
      swingHighs,
      swingLows,
      mssDetected,
      mssType,
      mssPrice,
      mssTimestamp,
      breakOfStructure,
    };
  }

  /**
   * Find swing highs — a candle whose high is higher than
   * the 2 candles on each side (5-candle fractal).
   */
  private findSwingHighs(klines: BinanceKline[]): SwingPoint[] {
    const swings: SwingPoint[] = [];

    for (let i = 2; i < klines.length - 2; i++) {
      const high = parseFloat(klines[i].high);
      const prevHigh1 = parseFloat(klines[i - 1].high);
      const prevHigh2 = parseFloat(klines[i - 2].high);
      const nextHigh1 = parseFloat(klines[i + 1].high);
      const nextHigh2 = parseFloat(klines[i + 2].high);

      if (
        high > prevHigh1 &&
        high > prevHigh2 &&
        high > nextHigh1 &&
        high > nextHigh2
      ) {
        swings.push({
          price: high,
          timestamp: klines[i].openTime,
          index: i,
          isValid: true,
        });
      }
    }

    return swings;
  }

  /**
   * Find swing lows — a candle whose low is lower than
   * the 2 candles on each side (5-candle fractal).
   */
  private findSwingLows(klines: BinanceKline[]): SwingPoint[] {
    const swings: SwingPoint[] = [];

    for (let i = 2; i < klines.length - 2; i++) {
      const low = parseFloat(klines[i].low);
      const prevLow1 = parseFloat(klines[i - 1].low);
      const prevLow2 = parseFloat(klines[i - 2].low);
      const nextLow1 = parseFloat(klines[i + 1].low);
      const nextLow2 = parseFloat(klines[i + 2].low);

      if (
        low < prevLow1 &&
        low < prevLow2 &&
        low < nextLow1 &&
        low < nextLow2
      ) {
        swings.push({
          price: low,
          timestamp: klines[i].openTime,
          index: i,
          isValid: true,
        });
      }
    }

    return swings;
  }

  /**
   * Detect Order Blocks — the last opposing candle before
   * a strong impulsive move in one direction.
   *
   * Bullish OB: Last bearish candle before a strong bullish move
   * Bearish OB: Last bullish candle before a strong bearish move
   */
  private detectOrderBlocks(klines: BinanceKline[], timeframe: string): OrderBlock[] {
    const orderBlocks: OrderBlock[] = [];

    for (let i = 1; i < klines.length - 2; i++) {
      const curr = klines[i];
      const next = klines[i + 1];
      const afterNext = klines[i + 2];

      const currOpen = parseFloat(curr.open);
      const currClose = parseFloat(curr.close);
      const nextClose = parseFloat(next.close);
      const afterNextClose = parseFloat(afterNext.close);

      const isBearishCandle = currClose < currOpen;
      const isBullishCandle = currClose > currOpen;

      // Bullish OB: bearish candle followed by 2 strong bullish candles
      if (isBearishCandle) {
        const moveUp = (afterNextClose - currClose) / currClose;
        if (moveUp > 0.02 && nextClose > currOpen) {
          const lastPrice = parseFloat(klines[klines.length - 1].close);
          const isMitigated = lastPrice < parseFloat(curr.low);

          let touchCount = 0;
          for (let j = i + 2; j < klines.length; j++) {
            const testLow = parseFloat(klines[j].low);
            if (
              testLow <= parseFloat(curr.high) &&
              testLow >= parseFloat(curr.low)
            ) {
              touchCount++;
            }
          }

          orderBlocks.push({
            type: 'BULLISH_OB',
            highPrice: parseFloat(curr.high),
            lowPrice: parseFloat(curr.low),
            midPrice: (parseFloat(curr.high) + parseFloat(curr.low)) / 2,
            timestamp: curr.openTime,
            timeframe,
            isMitigated,
            strength: Math.min(1, moveUp * 10),
            touchCount,
          });
        }
      }

      // Bearish OB: bullish candle followed by 2 strong bearish candles
      if (isBullishCandle) {
        const moveDown = (currClose - afterNextClose) / currClose;
        if (moveDown > 0.02 && nextClose < currOpen) {
          const lastPrice = parseFloat(klines[klines.length - 1].close);
          const isMitigated = lastPrice > parseFloat(curr.high);

          let touchCount = 0;
          for (let j = i + 2; j < klines.length; j++) {
            const testHigh = parseFloat(klines[j].high);
            if (
              testHigh >= parseFloat(curr.low) &&
              testHigh <= parseFloat(curr.high)
            ) {
              touchCount++;
            }
          }

          orderBlocks.push({
            type: 'BEARISH_OB',
            highPrice: parseFloat(curr.high),
            lowPrice: parseFloat(curr.low),
            midPrice: (parseFloat(curr.high) + parseFloat(curr.low)) / 2,
            timestamp: curr.openTime,
            timeframe,
            isMitigated,
            strength: Math.min(1, moveDown * 10),
            touchCount,
          });
        }
      }
    }

    return orderBlocks;
  }

  /**
   * Detect Fair Value Gaps — 3-candle pattern where candle 1's high
   * is lower than candle 3's low (bullish FVG) or vice versa.
   */
  private detectFairValueGaps(klines: BinanceKline[], timeframe: string): FairValueGap[] {
    const fvgs: FairValueGap[] = [];

    for (let i = 1; i < klines.length - 1; i++) {
      const candle1 = klines[i - 1];
      const candle3 = klines[i + 1];
      const candle2 = klines[i];

      const c1High = parseFloat(candle1.high);
      const c1Low = parseFloat(candle1.low);
      const c3High = parseFloat(candle3.high);
      const c3Low = parseFloat(candle3.low);

      // Bullish FVG: candle1 high < candle3 low (gap up)
      if (c1High < c3Low) {
        const gapSize = c3Low - c1High;
        const gapPct = (gapSize / c1High) * 100;

        // Check if gap has been filled
        let fillPct = 0;
        for (let j = i + 2; j < klines.length; j++) {
          const testLow = parseFloat(klines[j].low);
          if (testLow <= c1High) {
            fillPct = 100;
            break;
          }
          const penetration = (c3Low - testLow) / gapSize;
          fillPct = Math.max(fillPct, penetration * 100);
        }

        fvgs.push({
          type: 'BULLISH_FVG',
          highPrice: c3Low,
          lowPrice: c1High,
          gapSize,
          gapPercentage: Math.round(gapPct * 100) / 100,
          timestamp: candle2.openTime,
          timeframe,
          isFilled: fillPct >= 100,
          fillPercentage: Math.round(Math.min(100, fillPct) * 100) / 100,
        });
      }

      // Bearish FVG: candle3 high < candle1 low (gap down)
      if (c3High < c1Low) {
        const gapSize = c1Low - c3High;
        const gapPct = (gapSize / c1Low) * 100;

        let fillPct = 0;
        for (let j = i + 2; j < klines.length; j++) {
          const testHigh = parseFloat(klines[j].high);
          if (testHigh >= c1Low) {
            fillPct = 100;
            break;
          }
          const penetration = (testHigh - c3High) / gapSize;
          fillPct = Math.max(fillPct, penetration * 100);
        }

        fvgs.push({
          type: 'BEARISH_FVG',
          highPrice: c1Low,
          lowPrice: c3High,
          gapSize,
          gapPercentage: Math.round(gapPct * 100) / 100,
          timestamp: candle2.openTime,
          timeframe,
          isFilled: fillPct >= 100,
          fillPercentage: Math.round(Math.min(100, fillPct) * 100) / 100,
        });
      }
    }

    return fvgs;
  }

  /**
   * Detect liquidity levels — equal highs/lows where stop losses
   * are likely clustered (prime targets for smart money).
   */
  private detectLiquidityLevels(klines: BinanceKline[]): LiquidityLevel[] {
    const levels: LiquidityLevel[] = [];
    const tolerance = 0.002; // 0.2% price tolerance

    const highs = klines.map((k) => parseFloat(k.high));
    const lows = klines.map((k) => parseFloat(k.low));

    // Find equal highs (buy-side liquidity)
    for (let i = 0; i < highs.length; i++) {
      let touchCount = 0;
      for (let j = i + 1; j < highs.length; j++) {
        if (Math.abs(highs[j] - highs[i]) / highs[i] < tolerance) {
          touchCount++;
        }
      }

      if (touchCount >= 2) {
        const lastPrice = parseFloat(klines[klines.length - 1].close);
        const isSwept = lastPrice > highs[i] * (1 + tolerance);

        levels.push({
          type: 'BUY_SIDE',
          price: highs[i],
          strength: Math.min(1, touchCount / 5),
          touchCount,
          isSwept,
          sweepTimestamp: isSwept ? klines[klines.length - 1].openTime : null,
        });
      }
    }

    // Find equal lows (sell-side liquidity)
    for (let i = 0; i < lows.length; i++) {
      let touchCount = 0;
      for (let j = i + 1; j < lows.length; j++) {
        if (Math.abs(lows[j] - lows[i]) / lows[i] < tolerance) {
          touchCount++;
        }
      }

      if (touchCount >= 2) {
        const lastPrice = parseFloat(klines[klines.length - 1].close);
        const isSwept = lastPrice < lows[i] * (1 - tolerance);

        levels.push({
          type: 'SELL_SIDE',
          price: lows[i],
          strength: Math.min(1, touchCount / 5),
          touchCount,
          isSwept,
          sweepTimestamp: isSwept ? klines[klines.length - 1].openTime : null,
        });
      }
    }

    // Deduplicate levels that are very close
    return this.deduplicateLevels(levels);
  }

  private deduplicateLevels(levels: LiquidityLevel[]): LiquidityLevel[] {
    const deduplicated: LiquidityLevel[] = [];
    const used = new Set<number>();

    for (let i = 0; i < levels.length; i++) {
      if (used.has(i)) continue;

      let best = levels[i];
      for (let j = i + 1; j < levels.length; j++) {
        if (used.has(j)) continue;
        if (
          levels[j].type === best.type &&
          Math.abs(levels[j].price - best.price) / best.price < 0.005
        ) {
          if (levels[j].touchCount > best.touchCount) {
            best = levels[j];
          }
          used.add(j);
        }
      }

      deduplicated.push(best);
      used.add(i);
    }

    return deduplicated;
  }

  /**
   * Calculate SMC Score based on detected patterns.
   */
  private calculateSmcScore(
    structure: MarketStructure,
    orderBlocks: OrderBlock[],
    fvgs: FairValueGap[],
    liquidityLevels: LiquidityLevel[],
  ): number {
    let score = 0;

    // Market structure shift bonus
    if (structure.mssDetected && structure.mssType === 'BULLISH_MSS') {
      score += 3;
    }

    // Active (unmitigated) bullish order blocks
    const activeOBs = orderBlocks.filter(
      (ob) => ob.type === 'BULLISH_OB' && !ob.isMitigated,
    );
    score += Math.min(2, activeOBs.length * 0.5);

    // Unfilled FVGs
    const unfilledFvgs = fvgs.filter((fvg) => !fvg.isFilled);
    score += Math.min(1.5, unfilledFvgs.length * 0.3);

    // Swept liquidity (indicates smart money has entered)
    const sweptLevels = liquidityLevels.filter((l) => l.isSwept);
    score += Math.min(1.5, sweptLevels.length * 0.5);

    // Trend alignment bonus
    if (structure.currentTrend === 'BULLISH') {
      score += 1;
    }

    return Math.min(10, Math.round(score * 100) / 100);
  }

  /**
   * Determine overall bias from SMC data.
   */
  private determineBias(
    structure: MarketStructure,
    orderBlocks: OrderBlock[],
  ): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const bullishOBs = orderBlocks.filter(
      (ob) => ob.type === 'BULLISH_OB' && !ob.isMitigated,
    ).length;
    const bearishOBs = orderBlocks.filter(
      (ob) => ob.type === 'BEARISH_OB' && !ob.isMitigated,
    ).length;

    if (
      structure.mssDetected &&
      structure.mssType === 'BULLISH_MSS' &&
      bullishOBs > bearishOBs
    ) {
      return 'BULLISH';
    }

    if (
      structure.mssDetected &&
      structure.mssType === 'BEARISH_MSS' &&
      bearishOBs > bullishOBs
    ) {
      return 'BEARISH';
    }

    if (structure.currentTrend === 'BULLISH' && bullishOBs > 0) {
      return 'BULLISH';
    }

    if (structure.currentTrend === 'BEARISH' && bearishOBs > 0) {
      return 'BEARISH';
    }

    return 'NEUTRAL';
  }

  /**
   * Batch analyze multiple symbols.
   */
  async analyzeBatch(
    symbols: string[],
    timeframes?: string[],
  ): Promise<Map<string, SmcAnalysis>> {
    const results = new Map<string, SmcAnalysis>();

    for (const symbol of symbols) {
      try {
        const analysis = await this.analyze(symbol, timeframes);
        results.set(symbol, analysis);
      } catch {
        logger.debug({ symbol }, 'SMC analysis failed');
      }
    }

    return results;
  }

  private emptyMarketStructure(): MarketStructure {
    return {
      currentTrend: 'RANGING',
      swingHighs: [],
      swingLows: [],
      mssDetected: false,
      mssType: null,
      mssPrice: null,
      mssTimestamp: null,
      breakOfStructure: false,
    };
  }
}
