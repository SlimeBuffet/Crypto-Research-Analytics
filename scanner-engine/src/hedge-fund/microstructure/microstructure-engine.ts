import { CoinData } from '../../types';
import { fetchWithBackoff } from '../../utils/fetcher';
import { logger } from '../../utils/logger';
import {
  MicrostructureAnalysis,
  FundingRateAnalysis,
  OpenInterestAnalysis,
  LiquidationHeatmap,
  LiquidationLevel,
  CumulativeVolumeDelta,
} from '../types';

const BINANCE_FAPI = 'https://fapi.binance.com/fapi/v1';

/**
 * Module 2: Market Microstructure Analysis
 *
 * - Funding Rate Analysis (perpetual futures)
 * - Open Interest Tracking
 * - Liquidation Heatmap
 * - Cumulative Volume Delta (CVD)
 */
export class MicrostructureEngine {
  async analyze(coin: CoinData): Promise<MicrostructureAnalysis> {
    const [fundingRate, openInterest, liquidationMap, cvd] = await Promise.all([
      this.analyzeFundingRate(coin),
      this.analyzeOpenInterest(coin),
      this.buildLiquidationMap(coin),
      this.calculateCVD(coin),
    ]);

    return {
      symbol: coin.symbol,
      fundingRate,
      openInterest,
      liquidationMap,
      cvd,
    };
  }

  /**
   * Funding Rate Analysis — fetch from Binance Futures API.
   * Negative funding rate = shorts paying longs = potential squeeze.
   */
  private async analyzeFundingRate(
    coin: CoinData,
  ): Promise<FundingRateAnalysis> {
    try {
      const data = await fetchWithBackoff<
        Array<{ fundingRate: string; fundingTime: number }>
      >(
        `${BINANCE_FAPI}/fundingRate?symbol=${coin.symbol}USDT&limit=3`,
        { label: `binance-fapi/fundingRate/${coin.symbol}` },
      );

      if (data.length > 0) {
        const currentRate = parseFloat(data[data.length - 1].fundingRate) * 100;
        const rates = data.map((d) => parseFloat(d.fundingRate) * 100);
        const avgRate8h = rates.reduce((a, b) => a + b, 0) / rates.length;
        const isNegative = currentRate < 0;

        let squeezePotential: 'HIGH' | 'MEDIUM' | 'LOW';
        if (currentRate < -0.05) squeezePotential = 'HIGH';
        else if (currentRate < -0.01) squeezePotential = 'MEDIUM';
        else squeezePotential = 'LOW';

        return { currentRate, avgRate8h, isNegative, squeezePotential };
      }
    } catch {
      logger.debug({ symbol: coin.symbol }, 'No futures data available');
    }

    return {
      currentRate: 0,
      avgRate8h: 0,
      isNegative: false,
      squeezePotential: 'LOW',
    };
  }

  /**
   * Open Interest Analysis — detect institutional positioning spikes.
   */
  private async analyzeOpenInterest(
    coin: CoinData,
  ): Promise<OpenInterestAnalysis> {
    try {
      const data = await fetchWithBackoff<{
        openInterest: string;
        symbol: string;
        time: number;
      }>(
        `${BINANCE_FAPI}/openInterest?symbol=${coin.symbol}USDT`,
        { label: `binance-fapi/openInterest/${coin.symbol}` },
      );

      const currentOI = parseFloat(data.openInterest) * coin.price;

      const mc = coin.marketCap || 1;
      const oiToMcRatio = currentOI / mc;
      const isSpike = oiToMcRatio > 0.15;

      return {
        currentOI,
        oiChange24h: 0,
        oiChangePct: 0,
        isSpike,
      };
    } catch {
      logger.debug({ symbol: coin.symbol }, 'Open interest fetch failed');
    }

    return {
      currentOI: 0,
      oiChange24h: 0,
      oiChangePct: 0,
      isSpike: false,
    };
  }

  /**
   * Liquidation Heatmap — estimate liquidation levels based on
   * current price and typical leverage levels (3x, 5x, 10x, 20x).
   */
  private async buildLiquidationMap(
    coin: CoinData,
  ): Promise<LiquidationHeatmap> {
    const price = coin.price;
    const vol24h = coin.volume24h || 0;

    const leverageLevels = [3, 5, 10, 20];
    const longLiquidationLevels: LiquidationLevel[] = [];
    const shortLiquidationLevels: LiquidationLevel[] = [];

    for (const leverage of leverageLevels) {
      const maintenanceMargin = 0.5 / leverage;

      const longLiqPrice = price * (1 - 1 / leverage + maintenanceMargin);
      const shortLiqPrice = price * (1 + 1 / leverage - maintenanceMargin);

      const estimatedVolume = vol24h * (0.05 / leverage);

      longLiquidationLevels.push({
        price: Math.round(longLiqPrice * 10000) / 10000,
        estimatedVolumeUsd: Math.round(estimatedVolume),
        distancePct:
          Math.round(((price - longLiqPrice) / price) * 10000) / 100,
      });

      shortLiquidationLevels.push({
        price: Math.round(shortLiqPrice * 10000) / 10000,
        estimatedVolumeUsd: Math.round(estimatedVolume),
        distancePct:
          Math.round(((shortLiqPrice - price) / price) * 10000) / 100,
      });
    }

    const allDistances = [
      ...longLiquidationLevels.map((l) => l.distancePct),
      ...shortLiquidationLevels.map((l) => l.distancePct),
    ];
    const nearestLiquidationPct = Math.min(...allDistances);

    return {
      longLiquidationLevels,
      shortLiquidationLevels,
      nearestLiquidationPct,
    };
  }

  /**
   * Cumulative Volume Delta — estimates net buying vs selling pressure
   * using Linear Scaling of priceChange against volume.
   *
   * Instead of a binary weight, the buy/sell split scales continuously
   * with price change magnitude via a sigmoid-like clamping function.
   * This yields a value between 0.35 and 0.65 for the buy weight,
   * providing sensitivity proportional to absorption pressure.
   */
  private async calculateCVD(
    coin: CoinData,
  ): Promise<CumulativeVolumeDelta> {
    const totalVol = coin.volume24h || 1;
    const priceChange = coin.priceChange24h;

    const scaledDelta = priceChange / (Math.abs(priceChange) + 10);
    const buyWeight = 0.5 + scaledDelta * 0.15;
    const clampedBuyWeight = Math.max(0.35, Math.min(0.65, buyWeight));

    const buyVolume = totalVol * clampedBuyWeight;
    const sellVolume = totalVol * (1 - clampedBuyWeight);

    const delta24h = buyVolume - sellVolume;
    const buyVolumePct = (buyVolume / totalVol) * 100;
    const sellVolumePct = 100 - buyVolumePct;

    let deltaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    if (buyVolumePct >= 55) deltaTrend = 'BULLISH';
    else if (sellVolumePct >= 55) deltaTrend = 'BEARISH';
    else deltaTrend = 'NEUTRAL';

    return {
      delta24h: Math.round(delta24h),
      deltaTrend,
      buyVolumePct: Math.round(buyVolumePct * 100) / 100,
      sellVolumePct: Math.round(sellVolumePct * 100) / 100,
    };
  }

  async analyzeBatch(
    coins: CoinData[],
  ): Promise<Map<string, MicrostructureAnalysis>> {
    const results = new Map<string, MicrostructureAnalysis>();

    for (const coin of coins) {
      try {
        const analysis = await this.analyze(coin);
        results.set(coin.symbol, analysis);
      } catch (err) {
        const error = err as Error;
        logger.warn(
          { symbol: coin.symbol, error: error.message },
          'Microstructure analysis failed',
        );
      }
    }

    logger.info(
      {
        analyzed: results.size,
        withFunding: [...results.values()].filter(
          (r) => r.fundingRate.currentRate !== 0,
        ).length,
      },
      'Market Microstructure analysis complete',
    );

    return results;
  }
}
