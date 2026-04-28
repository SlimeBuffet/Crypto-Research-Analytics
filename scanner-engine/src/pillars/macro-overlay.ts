import { MacroAnalysis } from '../types/hedge-fund';
import { fetchWithBackoff } from '../utils/fetcher';
import { TtlCache } from '../utils/cache';
import { logger } from '../utils/logger';

/**
 * Pillar D: Global Macro Overlay — "The Compass"
 *
 * - DXY (Dollar Index) correlation: Strong dollar = risk-off for crypto
 * - Fed Interest Rate trend: Hawkish = reduce exposure
 * - Auto risk multiplier: if DXY breakout → reduce position sizes
 */
export class MacroOverlay {
  private readonly dxyBreakoutThreshold: number;

  constructor(
    private cache: TtlCache,
    dxyBreakoutThreshold = 2.0,
  ) {
    this.dxyBreakoutThreshold = dxyBreakoutThreshold;
  }

  async analyze(): Promise<MacroAnalysis> {
    const cached = this.cache.get<MacroAnalysis>('macro:analysis');
    if (cached) return cached;

    const dxyData = await this.fetchDxyData();
    const fedData = await this.fetchFedRateData();

    const dxyBreakout = this.isDxyBreakout(dxyData);
    const dxyTrend = this.classifyDxyTrend(dxyData);
    const fedRateTrend = this.classifyFedTrend(fedData);

    // Risk multiplier: reduce exposure during strong dollar / hawkish fed
    let riskMultiplier = 1.0;
    let signal: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
    let rationale = 'Macro conditions favorable for crypto risk-on positioning';

    if (dxyBreakout) {
      riskMultiplier *= 0.5;
      signal = 'RED';
      rationale = 'DXY breakout detected — strong dollar headwind, reduce crypto exposure by 50%';
    } else if (dxyTrend === 'BULLISH') {
      riskMultiplier *= 0.75;
      if (signal === 'GREEN') signal = 'YELLOW';
      rationale = 'DXY trending higher — moderate caution, reduce exposure by 25%';
    }

    if (fedRateTrend === 'HAWKISH') {
      riskMultiplier *= 0.8;
      if (signal === 'GREEN') signal = 'YELLOW';
      rationale += '. Fed stance hawkish — additional 20% risk reduction';
    } else if (fedRateTrend === 'DOVISH') {
      riskMultiplier = Math.min(riskMultiplier * 1.1, 1.0);
      rationale += '. Fed stance dovish — supportive for risk assets';
    }

    const result: MacroAnalysis = {
      dxyLevel: dxyData.current,
      dxyTrend,
      dxyBreakout,
      fedRateLevel: fedData.current,
      fedRateTrend,
      riskMultiplier,
      signal,
      rationale,
    };

    this.cache.set('macro:analysis', result, 3600_000);
    return result;
  }

  /** Check if DXY is in a breakout state */
  private isDxyBreakout(data: MacroTimeSeries): boolean {
    if (data.values.length < 10) return false;

    const recent = data.values.slice(-5);
    const older = data.values.slice(-20, -5);

    if (older.length === 0) return false;

    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
    const olderStd = this.stdDev(older);

    // Breakout = current level > mean + threshold * stdDev
    return olderStd > 0 && (recentAvg - olderAvg) / olderStd > this.dxyBreakoutThreshold;
  }

  private classifyDxyTrend(data: MacroTimeSeries): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (data.values.length < 10) return 'NEUTRAL';

    const recent5 = data.values.slice(-5);
    const recent20 = data.values.slice(-20);

    const sma5 = recent5.reduce((s, v) => s + v, 0) / recent5.length;
    const sma20 = recent20.reduce((s, v) => s + v, 0) / recent20.length;

    const diff = ((sma5 - sma20) / sma20) * 100;
    if (diff > 0.5) return 'BULLISH';
    if (diff < -0.5) return 'BEARISH';
    return 'NEUTRAL';
  }

  private classifyFedTrend(
    data: MacroTimeSeries,
  ): 'HAWKISH' | 'DOVISH' | 'NEUTRAL' {
    if (data.values.length < 2) return 'NEUTRAL';

    const last = data.values[data.values.length - 1];
    const prev = data.values[data.values.length - 2];

    if (last > prev) return 'HAWKISH';
    if (last < prev) return 'DOVISH';
    return 'NEUTRAL';
  }

  /**
   * Fetch DXY data.
   * Uses public proxy or falls back to static estimate.
   */
  private async fetchDxyData(): Promise<MacroTimeSeries> {
    const cacheKey = 'macro:dxy_raw';
    const cached = this.cache.get<MacroTimeSeries>(cacheKey);
    if (cached) return cached;

    try {
      // Use Binance EURUSDT as DXY inverse proxy (EUR is ~57% of DXY basket)
      const rawData = await fetchWithBackoff<unknown[][]>(
        `${process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3'}/klines?symbol=EURUSDT&interval=1d&limit=30`,
        { label: 'macro/dxy_proxy' },
      );

      // DXY ≈ inverse of EUR/USD weighted
      const values = rawData.map((k) => {
        const eurUsd = parseFloat(k[4] as string);
        return eurUsd > 0 ? 100 / eurUsd : 100;
      });

      const result: MacroTimeSeries = {
        current: values[values.length - 1] || 100,
        values,
      };

      this.cache.set(cacheKey, result, 3600_000);
      return result;
    } catch (err) {
      const error = err as Error;
      logger.warn({ error: error.message }, 'DXY data fetch failed, using neutral estimate');
      return { current: 100, values: [100] };
    }
  }

  /**
   * Fetch Fed rate data.
   * Falls back to static value if API unavailable.
   */
  private async fetchFedRateData(): Promise<MacroTimeSeries> {
    const cacheKey = 'macro:fed_rate';
    const cached = this.cache.get<MacroTimeSeries>(cacheKey);
    if (cached) return cached;

    // Use configured Fed rate or default
    const currentRate = parseFloat(process.env.FED_RATE_CURRENT || '5.25');
    const prevRate = parseFloat(process.env.FED_RATE_PREVIOUS || '5.25');

    const result: MacroTimeSeries = {
      current: currentRate,
      values: [prevRate, currentRate],
    };

    this.cache.set(cacheKey, result, 86400_000);
    return result;
  }

  private stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }
}

interface MacroTimeSeries {
  current: number;
  values: number[];
}
