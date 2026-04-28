import { CoinData } from '../types';
import { AlphaAnalysis, AlphaDetails } from '../types/hedge-fund';
import { fetchWithBackoff } from '../utils/fetcher';
import { TtlCache } from '../utils/cache';

const BINANCE_URL = process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3';

/**
 * Pillar A: Multi-Factor Alpha — "The Brain"
 *
 * Calculates composite alpha score from:
 * - Value Score: FDV/MC ratio & TVL/MC ratio
 * - Momentum Score: Rate of Change vs BTC
 * - Sentiment Score: Social volume Z-score proxy
 * - Whale Inflow Score: Net exchange inflow/outflow proxy
 */
export class AlphaIntelligence {
  constructor(private cache: TtlCache) {}

  async analyze(coin: CoinData): Promise<AlphaAnalysis> {
    const valueScore = this.calculateValueScore(coin);
    const momentumScore = await this.calculateMomentumScore(coin);
    const sentimentScore = this.calculateSentimentScore(coin);
    const whaleInflowScore = this.calculateWhaleInflowScore(coin);

    const totalAlphaScore =
      valueScore * 0.30 +
      momentumScore * 0.30 +
      sentimentScore * 0.20 +
      whaleInflowScore * 0.20;

    const details: AlphaDetails = {
      fdvMcRatio: coin.fdvMcRatio,
      tvlMcRatio: coin.dexLiquidity && coin.marketCap > 0
        ? coin.dexLiquidity / coin.marketCap
        : 0,
      rocVsBtc: await this.getRocVsBtc(coin.symbol),
      socialVolumeZScore: this.estimateSocialZScore(coin),
      netExchangeInflow: this.estimateNetInflow(coin),
    };

    return {
      valueScore,
      momentumScore,
      sentimentScore,
      whaleInflowScore,
      totalAlphaScore,
      details,
    };
  }

  /** Value Score: FDV/MC ratio & TVL/MC ratio (0-100) */
  private calculateValueScore(coin: CoinData): number {
    let score = 0;

    // FDV/MC — lower is better (fully unlocked tokens)
    const fdvMc = coin.fdvMcRatio;
    if (fdvMc > 0 && fdvMc < 1.2) score += 50;
    else if (fdvMc >= 1.2 && fdvMc < 1.5) score += 40;
    else if (fdvMc >= 1.5 && fdvMc < 2.0) score += 30;
    else if (fdvMc >= 2.0 && fdvMc < 3.0) score += 15;

    // TVL/MC — higher = more "real" value locked
    if (coin.dexLiquidity && coin.marketCap > 0) {
      const tvlMc = coin.dexLiquidity / coin.marketCap;
      if (tvlMc > 0.15) score += 50;
      else if (tvlMc > 0.10) score += 40;
      else if (tvlMc > 0.05) score += 30;
      else if (tvlMc > 0.02) score += 20;
      else score += 10;
    }

    return Math.min(100, score);
  }

  /** Momentum Score: Rate of Change vs BTC (0-100) */
  private async calculateMomentumScore(coin: CoinData): Promise<number> {
    const rocVsBtc = await this.getRocVsBtc(coin.symbol);

    // Outperforming BTC = higher score
    if (rocVsBtc > 20) return 100;
    if (rocVsBtc > 10) return 80;
    if (rocVsBtc > 5) return 60;
    if (rocVsBtc > 0) return 40;
    if (rocVsBtc > -10) return 20;
    return 0;
  }

  /** Get 7d Rate of Change vs BTC */
  private async getRocVsBtc(symbol: string): Promise<number> {
    const cacheKey = `roc_vs_btc:${symbol}`;
    const cached = this.cache.get<number>(cacheKey);
    if (cached !== null) return cached;

    try {
      const [coinKlines, btcKlines] = await Promise.all([
        this.fetchRecentKlines(symbol),
        this.fetchRecentKlines('BTC'),
      ]);

      if (coinKlines.length < 2 || btcKlines.length < 2) return 0;

      const coinRoc = ((coinKlines[coinKlines.length - 1] - coinKlines[0]) / coinKlines[0]) * 100;
      const btcRoc = ((btcKlines[btcKlines.length - 1] - btcKlines[0]) / btcKlines[0]) * 100;
      const roc = coinRoc - btcRoc;

      this.cache.set(cacheKey, roc, 3600_000);
      return roc;
    } catch {
      return 0;
    }
  }

  private async fetchRecentKlines(symbol: string): Promise<number[]> {
    const rawData = await fetchWithBackoff<unknown[][]>(
      `${BINANCE_URL}/klines?symbol=${symbol}USDT&interval=1d&limit=7`,
      { label: `alpha/klines/${symbol}` },
    );
    return rawData.map((k) => parseFloat(k[4] as string));
  }

  /**
   * Sentiment Score: Social volume Z-Score proxy (0-100).
   * Uses on-chain transaction velocity as a proxy for social/trading interest.
   */
  private calculateSentimentScore(coin: CoinData): number {
    if (!coin.dexTxns24h || !coin.volume24h) return 30;

    // Transaction density = txns per $1M volume
    const txnDensity = coin.dexTxns24h / (coin.volume24h / 1_000_000);
    if (txnDensity > 100) return 100;
    if (txnDensity > 50) return 80;
    if (txnDensity > 20) return 60;
    if (txnDensity > 10) return 40;
    return 20;
  }

  private estimateSocialZScore(coin: CoinData): number {
    if (!coin.dexTxns24h || !coin.volume24h) return 0;
    return coin.dexTxns24h / (coin.volume24h / 1_000_000);
  }

  /**
   * Whale Inflow Score: Net exchange inflow/outflow proxy (0-100).
   * Approximated via DEX vs CEX volume ratio — high DEX ratio suggests
   * tokens flowing out of exchanges (accumulation).
   */
  private calculateWhaleInflowScore(coin: CoinData): number {
    if (!coin.dexVolume24h || coin.volume24h <= 0) return 30;

    const dexCexRatio = coin.dexVolume24h / coin.volume24h;

    // High DEX ratio = accumulation (positive signal)
    if (dexCexRatio > 0.5) return 90;
    if (dexCexRatio > 0.3) return 70;
    if (dexCexRatio > 0.15) return 50;
    if (dexCexRatio > 0.05) return 30;
    return 10;
  }

  private estimateNetInflow(coin: CoinData): number {
    if (!coin.dexVolume24h || coin.volume24h <= 0) return 0;
    return -(coin.dexVolume24h / coin.volume24h);
  }
}
