import { fetchWithBackoff } from '../../utils/fetcher';
import { logger } from '../../utils/logger';
import { MacroState, DxyState, FedRateState } from '../types';

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

  constructor(cacheTtlMs = 3600_000) {
    this.cacheTtlMs = cacheTtlMs;
  }

  async getState(): Promise<MacroState> {
    if (this.cachedState && Date.now() < this.cacheExpiresAt) {
      return this.cachedState;
    }

    const [dxy, fedRate] = await Promise.all([
      this.fetchDxyState(),
      this.fetchFedRate(),
    ]);

    const { riskMultiplier, signal } = this.computeRiskSignal(dxy, fedRate);

    let recommendation: string;
    if (signal === 'GREEN') {
      recommendation = 'Full risk allocation. DXY stable/declining, rates supportive.';
    } else if (signal === 'YELLOW') {
      recommendation = 'Reduce position sizes by 50%. DXY rising or rates uncertain.';
    } else {
      recommendation = 'Defensive mode. DXY breakout detected and/or rates hiking aggressively.';
    }

    const state: MacroState = {
      dxy,
      fedRate,
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
          `${FRED_BASE_URL}?series_id=DTWEXBGS&api_key=${fredApiKey}&file_type=json&sort_order=desc&limit=30`,
          { label: 'fred/dxy' },
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
          `${FRED_BASE_URL}?series_id=FEDFUNDS&api_key=${fredApiKey}&file_type=json&sort_order=desc&limit=3`,
          { label: 'fred/fedfunds' },
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
   * Compute the risk signal and position-size multiplier
   * based on the current DXY and Fed Rate state.
   */
  private computeRiskSignal(
    dxy: DxyState,
    fedRate: FedRateState,
  ): { riskMultiplier: number; signal: 'GREEN' | 'YELLOW' | 'RED' } {
    let riskMultiplier = 1.0;
    let signal: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';

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
