import { CoinData, IBinanceAdapter } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import { AlphaFactorResult } from '../types';

/**
 * Pillar A: Multi-Factor Alpha — "The Brain"
 *
 * Sub-factors:
 *   1. Value Score      — FDV/MC ratio & TVL/MC
 *   2. Momentum Score   — Rate of Change vs BTC
 *   3. Sentiment Score  — Social Volume Z-Score (proxy)
 *   4. Whale Score      — Net Exchange Inflow/Outflow
 */
export class AlphaEngine {
  private binance: IBinanceAdapter;

  constructor(binance?: IBinanceAdapter) {
    this.binance = binance ?? new BinanceAdapter();
  }

  async analyze(coin: CoinData): Promise<AlphaFactorResult> {
    const [valueScore, valueDetails] = this.calculateValueScore(coin);
    const [momentumScore, rocVsBtc] = await this.calculateMomentumScore(coin);
    const [sentimentScore, socialZ] = this.calculateSentimentScore(coin);
    const [whaleScore, netFlow] = this.calculateWhaleScore(coin);

    const totalAlphaScore = valueScore + momentumScore + sentimentScore + whaleScore;

    return {
      symbol: coin.symbol,
      valueScore,
      momentumScore,
      sentimentScore,
      whaleScore,
      totalAlphaScore,
      details: {
        fdvMcRatio: valueDetails.fdvMc,
        tvlMcRatio: valueDetails.tvlMc,
        rocVsBtc,
        socialVolumeZScore: socialZ,
        netExchangeFlow: netFlow,
      },
    };
  }

  /**
   * Value Score (0-25): FDV/MC ratio & TVL/MC ratio.
   * Low FDV/MC = less dilution risk.  High TVL/MC = fundamental undervaluation.
   */
  private calculateValueScore(
    coin: CoinData,
  ): [number, { fdvMc: number; tvlMc: number }] {
    const mc = coin.marketCap || 1;
    const fdvMcRatio = coin.fdvMcRatio || 0;

    let fdvScore = 0;
    if (fdvMcRatio > 0 && fdvMcRatio < 1.1) fdvScore = 10;
    else if (fdvMcRatio < 1.3) fdvScore = 8;
    else if (fdvMcRatio < 1.5) fdvScore = 6;
    else if (fdvMcRatio < 2.0) fdvScore = 4;
    else if (fdvMcRatio < 3.0) fdvScore = 2;

    const tvlMcRatio = (coin.dexLiquidity || 0) / mc;
    let tvlScore = 0;
    if (tvlMcRatio > 0.2) tvlScore = 15;
    else if (tvlMcRatio > 0.1) tvlScore = 12;
    else if (tvlMcRatio > 0.05) tvlScore = 8;
    else if (tvlMcRatio > 0.02) tvlScore = 5;
    else if (tvlMcRatio > 0.01) tvlScore = 3;

    return [
      Math.min(25, fdvScore + tvlScore),
      { fdvMc: fdvMcRatio, tvlMc: tvlMcRatio },
    ];
  }

  /**
   * Momentum Score (0-25): Rate of Change vs BTC.
   * Calculates the coin's 7d ROC relative to BTC's 7d ROC.
   */
  private async calculateMomentumScore(
    coin: CoinData,
  ): Promise<[number, number]> {
    let btcChange7d = 0;

    try {
      const btcKlines = await this.binance.fetchKlines('BTC', '1d', 8);
      if (btcKlines.length >= 2) {
        const oldPrice = parseFloat(btcKlines[0].close);
        const newPrice = parseFloat(btcKlines[btcKlines.length - 1].close);
        btcChange7d = ((newPrice - oldPrice) / oldPrice) * 100;
      }
    } catch {
      logger.debug('Failed to fetch BTC klines for momentum comparison');
    }

    const coinRoc7d = coin.priceChange7d || 0;
    const rocVsBtc = coinRoc7d - btcChange7d;

    let score = 0;
    if (rocVsBtc > 30) score = 25;
    else if (rocVsBtc > 20) score = 20;
    else if (rocVsBtc > 10) score = 15;
    else if (rocVsBtc > 5) score = 10;
    else if (rocVsBtc > 0) score = 5;

    return [score, rocVsBtc];
  }

  /**
   * Sentiment Score (0-25): Social Volume Z-Score proxy.
   * Uses DEX transaction volume as a proxy for social activity —
   * high buy/sell tx count relative to market cap indicates viral interest.
   */
  private calculateSentimentScore(coin: CoinData): [number, number] {
    const txns = coin.dexTxns24h || 0;
    const mc = coin.marketCap || 1;

    const txnDensity = txns / (mc / 1e6);
    const mean = 50;
    const stdDev = 30;
    const zScore = (txnDensity - mean) / stdDev;

    let score = 0;
    if (zScore > 3) score = 25;
    else if (zScore > 2) score = 20;
    else if (zScore > 1) score = 15;
    else if (zScore > 0.5) score = 10;
    else if (zScore > 0) score = 5;

    return [score, zScore];
  }

  /**
   * Whale Score (0-25): Net Exchange Inflow/Outflow proxy.
   * Uses CEX volume vs DEX volume as a proxy — high DEX/CEX ratio
   * suggests whale accumulation off-exchange.
   */
  private calculateWhaleScore(coin: CoinData): [number, number] {
    const dexVol = coin.dexVolume24h || 0;
    const cexVol = coin.volume24h || 1;

    const netFlowRatio = dexVol / cexVol;

    let score = 0;
    if (netFlowRatio > 0.5) score = 25;
    else if (netFlowRatio > 0.3) score = 20;
    else if (netFlowRatio > 0.15) score = 15;
    else if (netFlowRatio > 0.08) score = 10;
    else if (netFlowRatio > 0.03) score = 5;

    return [score, netFlowRatio];
  }

  /**
   * Batch analyze multiple coins.
   */
  async analyzeBatch(coins: CoinData[]): Promise<Map<string, AlphaFactorResult>> {
    const results = new Map<string, AlphaFactorResult>();

    for (const coin of coins) {
      try {
        const result = await this.analyze(coin);
        results.set(coin.symbol, result);
      } catch (err) {
        const error = err as Error;
        logger.warn({ symbol: coin.symbol, error: error.message }, 'Alpha analysis failed');
      }
    }

    logger.info(
      { analyzed: results.size, total: coins.length },
      'Pillar A: Alpha analysis complete',
    );

    return results;
  }
}
