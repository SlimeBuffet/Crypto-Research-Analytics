import { IBinanceAdapter } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { fetchWithBackoff } from '../../utils/fetcher';
import { logger } from '../../utils/logger';
import { MacroState, DxyState, FedRateState, BtcCrashGate } from '../types';

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

/**
 * Pillar D: Global Macro Overlay — "The Compass"
 *
 * Sub-components:
 *   1. DXY (Dollar Index) correlation  — breakout detection
 *   2. Fed Interest Rates              — monetary policy direction
 *
 * If DXY is in a breakout state, reduce risk exposure automatically.
 */
export class MacroEngine {
  private cachedState: MacroState | null = null;
  private cacheExpiresAt = 0;
  private cacheTtlMs: number;
  private binance: IBinanceAdapter;

  constructor(cacheTtlMs = 3600_000, binance?: IBinanceAdapter) {
    this.cacheTtlMs = cacheTtlMs;
    this.binance = binance ?? new BinanceAdapter();
  }

  async getState(): Promise<MacroState> {
    if (this.cachedState && Date.now() < this.cacheExpiresAt) {
      return this.cachedState;
    }

    const [dxy, fedRate, btcCrashGate] = await Promise.all([
      this.fetchDxyState(),
      this.fetchFedRate(),
      this.fetchBtcCrashGate(),
    ]);

    const { riskMultiplier, signal } = this.computeRiskSignal(dxy, fedRate, btcCrashGate);

    let recommendation: string;
    if (signal === 'GREEN') {
      recommendation = 'Full risk allocation. DXY stable/declining, rates supportive, BTC healthy.';
    } else if (signal === 'YELLOW') {
      recommendation = 'Reduce position sizes by 50%. DXY rising or rates uncertain.';
    } else {
      recommendation = btcCrashGate.isGateLocked
        ? 'EMERGENCY HALT: BTC crash detected (below EMA200 + high correlation). ExecutionEngine locked.'
        : 'Defensive mode. DXY breakout detected and/or rates hiking aggressively.';
    }

    const state: MacroState = {
      dxy,
      fedRate,
      btcCrashGate,
      riskMultiplier,
      signal,
      recommendation,
    };

    this.cachedState = state;
    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;

    logger.info(
      {
        dxy: dxy.current,
        dxyTrend: dxy.trend,
        dxyBreakout: dxy.isBreakout,
        fedRate: fedRate.currentRate,
        fedDirection: fedRate.direction,
        btcPrice: btcCrashGate.btcPrice,
        btcEma200: btcCrashGate.btcEma200,
        btcGateLocked: btcCrashGate.isGateLocked,
        signal,
        riskMultiplier,
      },
      'Pillar D: Macro state updated',
    );

    return state;
  }

  /**
   * Fetch DXY (Dollar Index) data.
   * Primary: FRED API (free, public economic data).
   * Fallback: Static conservative estimate.
   */
  private async fetchDxyState(): Promise<DxyState> {
    try {
      const fredApiKey = process.env.FRED_API_KEY;

      if (fredApiKey) {
        const data = await fetchWithBackoff<{
          observations: Array<{ date: string; value: string }>;
        }>(
          `${FRED_BASE_URL}?series_id=DTWEXBGS&file_type=json&sort_order=desc&limit=30`,
          {
            label: 'fred/dxy',
            headers: { Authorization: `Bearer ${fredApiKey}` },
          },
        );

        const observations = data.observations
          .filter((o) => o.value !== '.')
          .map((o) => parseFloat(o.value));

        if (observations.length >= 20) {
          const current = observations[0];
          const sma20 =
            observations.slice(0, 20).reduce((a, b) => a + b, 0) / 20;

          const isBreakout = current > sma20 * 1.02;

          let trend: 'RISING' | 'FALLING' | 'NEUTRAL';
          if (current > sma20 * 1.01) trend = 'RISING';
          else if (current < sma20 * 0.99) trend = 'FALLING';
          else trend = 'NEUTRAL';

          return { current, sma20, isBreakout, trend };
        }
      }

      return this.getDefaultDxyState();
    } catch (err) {
      const error = err as Error;
      logger.warn({ error: error.message }, 'DXY fetch failed, using defaults');
      return this.getDefaultDxyState();
    }
  }

  private getDefaultDxyState(): DxyState {
    return {
      current: 104.0,
      sma20: 103.5,
      isBreakout: false,
      trend: 'NEUTRAL',
    };
  }

  /**
   * Fetch Fed Funds Rate.
   * Primary: FRED API.
   * Fallback: Static estimate.
   */
  private async fetchFedRate(): Promise<FedRateState> {
    try {
      const fredApiKey = process.env.FRED_API_KEY;

      if (fredApiKey) {
        const data = await fetchWithBackoff<{
          observations: Array<{ date: string; value: string }>;
        }>(
          `${FRED_BASE_URL}?series_id=FEDFUNDS&file_type=json&sort_order=desc&limit=3`,
          {
            label: 'fred/fedfunds',
            headers: { Authorization: `Bearer ${fredApiKey}` },
          },
        );

        const values = data.observations
          .filter((o) => o.value !== '.')
          .map((o) => parseFloat(o.value));

        if (values.length >= 2) {
          const currentRate = values[0];
          const previousRate = values[1];

          let direction: 'HIKING' | 'CUTTING' | 'HOLDING';
          if (currentRate > previousRate + 0.1) direction = 'HIKING';
          else if (currentRate < previousRate - 0.1) direction = 'CUTTING';
          else direction = 'HOLDING';

          return { currentRate, previousRate, direction };
        }
      }

      return this.getDefaultFedRate();
    } catch (err) {
      const error = err as Error;
      logger.warn({ error: error.message }, 'Fed rate fetch failed, using defaults');
      return this.getDefaultFedRate();
    }
  }

  private getDefaultFedRate(): FedRateState {
    return {
      currentRate: 5.33,
      previousRate: 5.33,
      direction: 'HOLDING',
    };
  }

  /**
   * BTC Crash Correlation Gate — "The Emergency Brake"
   * Locks ExecutionEngine when BTC is crashing (> 3% drop in 1h)
   * AND trading below EMA(200), indicating systemic market stress.
   */
  private async fetchBtcCrashGate(): Promise<BtcCrashGate> {
    try {
      const klines = await this.binance.fetchKlines('BTC', '1d', 210);

      if (klines.length < 200) {
        return this.getDefaultBtcCrashGate();
      }

      const closes = klines.map((k) => parseFloat(k.close));
      const btcPrice = closes[closes.length - 1];

      const emaMultiplier = 2 / (200 + 1);
      let ema = closes.slice(0, 200).reduce((a, b) => a + b, 0) / 200;
      for (let i = 200; i < closes.length; i++) {
        ema = (closes[i] - ema) * emaMultiplier + ema;
      }
      const btcEma200 = ema;

      const hourlyKlines = await this.binance.fetchKlines('BTC', '1h', 2);
      let btcChange1h = 0;
      if (hourlyKlines.length >= 2) {
        const prevClose = parseFloat(hourlyKlines[0].close);
        const currClose = parseFloat(hourlyKlines[1].close);
        btcChange1h = ((currClose - prevClose) / prevClose) * 100;
      }

      const isBelowEma200 = btcPrice < btcEma200;
      const isCrashing = btcChange1h < -3;
      const isGateLocked = isBelowEma200 && isCrashing;

      if (isGateLocked) {
        logger.warn(
          { btcPrice, btcEma200, btcChange1h },
          'BTC CRASH GATE LOCKED: BTC below EMA200 + crashing > 3%/1h',
        );
      }

      return { btcPrice, btcEma200, btcChange1h, isBelowEma200, isCrashing, isGateLocked };
    } catch (err) {
      const error = err as Error;
      logger.warn({ error: error.message }, 'BTC crash gate fetch failed, using defaults');
      return this.getDefaultBtcCrashGate();
    }
  }

  private getDefaultBtcCrashGate(): BtcCrashGate {
    return {
      btcPrice: 0,
      btcEma200: 0,
      btcChange1h: 0,
      isBelowEma200: false,
      isCrashing: false,
      isGateLocked: false,
    };
  }

  /**
   * Compute the risk signal and position-size multiplier
   * based on the current DXY, Fed Rate, and BTC Crash Gate state.
   */
  private computeRiskSignal(
    dxy: DxyState,
    fedRate: FedRateState,
    btcGate: BtcCrashGate,
  ): { riskMultiplier: number; signal: 'GREEN' | 'YELLOW' | 'RED' } {
    let riskMultiplier = 1.0;
    let signal: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';

    // BTC Crash Gate takes highest priority
    if (btcGate.isGateLocked) {
      return { riskMultiplier: 0, signal: 'RED' };
    }

    if (btcGate.isBelowEma200) {
      riskMultiplier *= 0.5;
      if (signal === 'GREEN') signal = 'YELLOW';
    }

    if (dxy.isBreakout) {
      riskMultiplier *= 0.3;
      signal = 'RED';
    } else if (dxy.trend === 'RISING') {
      riskMultiplier *= 0.7;
      if (signal === 'GREEN') signal = 'YELLOW';
    } else if (dxy.trend === 'FALLING') {
      riskMultiplier *= 1.1;
    }

    if (fedRate.direction === 'HIKING') {
      riskMultiplier *= 0.5;
      signal = 'RED';
    } else if (fedRate.direction === 'CUTTING') {
      riskMultiplier *= 1.2;
    }

    riskMultiplier = Math.max(0.1, Math.min(1.5, riskMultiplier));

    return { riskMultiplier, signal };
  }
}
