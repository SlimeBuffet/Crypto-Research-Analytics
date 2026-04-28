import { KlineCandle, PriceChannelResult } from '../types/hedge-fund';
import { fetchWithBackoff } from '../utils/fetcher';
import { logger } from '../utils/logger';

const BASE_URL = process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3';

/**
 * Price Channel Trigger Unit.
 *
 * Implements SMA-based channel filter:
 * - High Line: SMA(5) of the Highs over period 8
 * - Low Line:  SMA(5) of the Lows over period 8
 * - Trigger:   Price > High Line → "Institutional Inflow State"
 */
export class PriceChannelTrigger {
  private readonly highPeriod: number;
  private readonly smoothPeriod: number;

  constructor(highPeriod = 8, smoothPeriod = 5) {
    this.highPeriod = highPeriod;
    this.smoothPeriod = smoothPeriod;
  }

  /** Fetch klines and evaluate the price channel for a symbol */
  async evaluate(symbol: string): Promise<PriceChannelResult | null> {
    try {
      const candles = await this.fetchCandles(symbol);
      if (candles.length < this.highPeriod + this.smoothPeriod) return null;

      const highLine = this.calculateChannelLine(candles, 'high');
      const lowLine = this.calculateChannelLine(candles, 'low');
      const currentPrice = candles[candles.length - 1].close;

      const isInInflowState = currentPrice > highLine;
      const channelWidth = highLine > 0 ? ((highLine - lowLine) / highLine) * 100 : 0;
      const priceAboveHighPct = highLine > 0 ? ((currentPrice - highLine) / highLine) * 100 : 0;

      return {
        symbol,
        currentPrice,
        highLine,
        lowLine,
        isInInflowState,
        channelWidth,
        priceAboveHighPct,
      };
    } catch (err) {
      const error = err as Error;
      logger.warn({ symbol, error: error.message }, 'Price channel evaluation failed');
      return null;
    }
  }

  /** Batch evaluate multiple symbols, return only those in inflow state */
  async filterInflow(symbols: string[]): Promise<PriceChannelResult[]> {
    const results: PriceChannelResult[] = [];

    for (const symbol of symbols) {
      const result = await this.evaluate(symbol);
      if (result?.isInInflowState) {
        results.push(result);
      }
    }

    logger.info(
      { total: symbols.length, inflow: results.length },
      'Price channel trigger scan complete',
    );
    return results;
  }

  /**
   * Calculate SMA channel line.
   *
   * Step 1: Extract rolling max highs (or min lows) over `highPeriod` windows.
   * Step 2: Smooth those values with SMA over `smoothPeriod`.
   */
  private calculateChannelLine(
    candles: KlineCandle[],
    type: 'high' | 'low',
  ): number {
    const values = candles.map((c) => (type === 'high' ? c.high : c.low));

    // Step 1: Rolling high/low over highPeriod
    const rollingValues: number[] = [];
    for (let i = this.highPeriod - 1; i < values.length; i++) {
      const window = values.slice(i - this.highPeriod + 1, i + 1);
      const val = type === 'high' ? Math.max(...window) : Math.min(...window);
      rollingValues.push(val);
    }

    // Step 2: SMA smoothing over smoothPeriod
    if (rollingValues.length < this.smoothPeriod) {
      return rollingValues[rollingValues.length - 1] || 0;
    }

    const smaWindow = rollingValues.slice(-this.smoothPeriod);
    return smaWindow.reduce((sum, v) => sum + v, 0) / this.smoothPeriod;
  }

  /** Fetch daily kline data from Binance */
  private async fetchCandles(symbol: string): Promise<KlineCandle[]> {
    const limit = this.highPeriod + this.smoothPeriod + 5;
    const rawData = await fetchWithBackoff<unknown[][]>(
      `${BASE_URL}/klines?symbol=${symbol}USDT&interval=1d&limit=${limit}`,
      { label: `trigger/klines/${symbol}` },
    );

    return rawData.map((k) => ({
      openTime: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
  }
}
