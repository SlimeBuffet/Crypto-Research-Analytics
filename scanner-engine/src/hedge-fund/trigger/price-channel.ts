import { BinanceKline } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import { PriceChannelState, TriggerConfig } from '../types';

const DEFAULT_CONFIG: TriggerConfig = {
  highPeriod: 8,
  lowPeriod: 8,
  smaPeriod: 5,
  offset: 0,
  atrPeriod: 14,
  atrMultiplier: 0.75,
  volumeSmaPeriod: 20,
  volumeSpikeMultiplier: 1.5,
};

/**
 * Price Channel Filter — Technical Trigger Unit.
 *
 * High Line: SMA(smaPeriod) of the Highs over (highPeriod) candles.
 * Low  Line: SMA(smaPeriod) of the Lows  over (lowPeriod)  candles.
 *
 * A breakout is valid ONLY when ALL conditions are met:
 *   1. Price > UpperChannel + (k * ATR)  — volatility-buffered breakout
 *   2. Volume > SMA(Volume, 20) * 1.5    — institutional volume confirmation
 */
export class PriceChannelTrigger {
  private config: TriggerConfig;
  private binance: BinanceAdapter;

  constructor(config?: Partial<TriggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.binance = new BinanceAdapter();
  }

  /**
   * Compute rolling highest-highs from klines, then SMA of those values.
   */
  private computeHighLine(klines: BinanceKline[]): number {
    const { highPeriod, smaPeriod, offset } = this.config;
    const minRequired = highPeriod + smaPeriod - 1 + offset;

    if (klines.length < minRequired) {
      return Infinity;
    }

    const rollingHighs: number[] = [];
    for (let i = highPeriod - 1; i < klines.length - offset; i++) {
      let maxHigh = -Infinity;
      for (let j = i - highPeriod + 1; j <= i; j++) {
        const high = parseFloat(klines[j].high);
        if (high > maxHigh) maxHigh = high;
      }
      rollingHighs.push(maxHigh);
    }

    if (rollingHighs.length < smaPeriod) {
      return Infinity;
    }

    const recentHighs = rollingHighs.slice(-smaPeriod);
    const sma = recentHighs.reduce((sum, v) => sum + v, 0) / smaPeriod;
    return sma;
  }

  /**
   * Compute rolling lowest-lows from klines, then SMA of those values.
   */
  private computeLowLine(klines: BinanceKline[]): number {
    const { lowPeriod, smaPeriod, offset } = this.config;
    const minRequired = lowPeriod + smaPeriod - 1 + offset;

    if (klines.length < minRequired) {
      return 0;
    }

    const rollingLows: number[] = [];
    for (let i = lowPeriod - 1; i < klines.length - offset; i++) {
      let minLow = Infinity;
      for (let j = i - lowPeriod + 1; j <= i; j++) {
        const low = parseFloat(klines[j].low);
        if (low < minLow) minLow = low;
      }
      rollingLows.push(minLow);
    }

    if (rollingLows.length < smaPeriod) {
      return 0;
    }

    const recentLows = rollingLows.slice(-smaPeriod);
    const sma = recentLows.reduce((sum, v) => sum + v, 0) / smaPeriod;
    return sma;
  }

  /**
   * Compute Average True Range (ATR) over the configured period.
   * ATR = SMA of True Range, where TR = max(H-L, |H-prevC|, |L-prevC|).
   */
  private computeATR(klines: BinanceKline[]): number {
    const { atrPeriod } = this.config;
    if (klines.length < atrPeriod + 1) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      const high = parseFloat(klines[i].high);
      const low = parseFloat(klines[i].low);
      const prevClose = parseFloat(klines[i - 1].close);

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      );
      trueRanges.push(tr);
    }

    const recentTRs = trueRanges.slice(-atrPeriod);
    return recentTRs.reduce((sum, v) => sum + v, 0) / recentTRs.length;
  }

  /**
   * Compute volume ratio: current volume vs SMA(volume, volumeSmaPeriod).
   * Returns ratio >= 1.0 when volume is above average.
   */
  private computeVolumeRatio(klines: BinanceKline[]): number {
    const { volumeSmaPeriod } = this.config;
    if (klines.length < volumeSmaPeriod + 1) return 0;

    const volumes = klines.map((k) => parseFloat(k.volume));
    const currentVolume = volumes[volumes.length - 1];
    const smaVolumes = volumes.slice(-(volumeSmaPeriod + 1), -1);
    const smaVolume = smaVolumes.reduce((sum, v) => sum + v, 0) / smaVolumes.length;

    return smaVolume > 0 ? currentVolume / smaVolume : 0;
  }

  /**
   * Evaluate the trigger for a single symbol using its kline data.
   * Breakout requires: Price > HighLine + (k * ATR) AND Volume > SMA(Vol, 20) * 1.5
   */
  evaluate(symbol: string, klines: BinanceKline[]): PriceChannelState {
    const highLine = this.computeHighLine(klines);
    const lowLine = this.computeLowLine(klines);
    const atr = this.computeATR(klines);
    const volumeRatio = this.computeVolumeRatio(klines);

    const lastKline = klines[klines.length - 1];
    const currentPrice = parseFloat(lastKline.close);

    const atrBuffer = this.config.atrMultiplier * atr;
    const atrBufferedHighLine = highLine + atrBuffer;
    const priceBreakout = currentPrice > atrBufferedHighLine;
    const volumeConfirmed = volumeRatio >= this.config.volumeSpikeMultiplier;
    const isTriggered = priceBreakout && volumeConfirmed;

    return {
      symbol,
      highLine,
      lowLine,
      currentPrice,
      isTriggered,
      atr,
      atrBufferedHighLine,
      volumeConfirmed,
      volumeRatio,
      klines,
    };
  }

  /**
   * Scan a batch of symbols — fetch klines, compute channels,
   * and return only those in an "Institutional Inflow State."
   */
  async scanBatch(symbols: string[]): Promise<PriceChannelState[]> {
    const { highPeriod, smaPeriod, offset, atrPeriod, volumeSmaPeriod } = this.config;
    const klineLimit = Math.max(
      highPeriod + smaPeriod + offset + 5,
      atrPeriod + 5,
      volumeSmaPeriod + 5,
    );

    logger.info(
      { symbols: symbols.length, klineLimit, config: this.config },
      'Price Channel Trigger: scanning batch',
    );

    const triggered: PriceChannelState[] = [];
    const errors: string[] = [];

    for (const symbol of symbols) {
      try {
        const klines = await this.binance.fetchKlines(symbol, '1d', klineLimit);

        if (klines.length < klineLimit - 2) {
          logger.debug({ symbol, got: klines.length }, 'Insufficient kline data');
          continue;
        }

        const state = this.evaluate(symbol, klines);

        if (state.isTriggered) {
          triggered.push(state);
          logger.debug(
            {
              symbol,
              price: state.currentPrice.toFixed(4),
              highLine: state.highLine.toFixed(4),
              atrBuffered: state.atrBufferedHighLine.toFixed(4),
              atr: state.atr.toFixed(4),
              volumeRatio: state.volumeRatio.toFixed(2),
              lowLine: state.lowLine.toFixed(4),
            },
            'TRIGGERED: ATR-Confirmed Breakout + Volume Spike',
          );
        }
      } catch (err) {
        const error = err as Error;
        errors.push(symbol);
        logger.debug({ symbol, error: error.message }, 'Kline fetch failed');
      }
    }

    logger.info(
      {
        scanned: symbols.length,
        triggered: triggered.length,
        errors: errors.length,
      },
      'Price Channel Trigger: scan complete',
    );

    return triggered;
  }
}
