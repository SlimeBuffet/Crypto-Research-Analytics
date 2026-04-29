import { CoinData, ScoreBreakdown } from '../types';
import { ScorerNormalizers } from './z-score-normalizer';

/**
 * Alpha Score Calculator — Stage 4.
 * Computes a 0-25 score across 5 dimensions (0-5 each).
 *
 * When a ScorerNormalizers instance is provided, liquidity and momentum
 * scores use Z-Score normalization so that "5/5" is only awarded to
 * true statistical anomalies relative to recent market history.
 * Without normalizers the original static thresholds are used.
 */
export class AlphaScorer {
  private normalizers: ScorerNormalizers | null;

  constructor(normalizers?: ScorerNormalizers) {
    this.normalizers = normalizers ?? null;
  }

  /** Calculate the full Alpha Score for a coin */
  calculate(coin: CoinData): { score: number; breakdown: ScoreBreakdown } {
    this.feedNormalizers(coin);

    const breakdown: ScoreBreakdown = {
      liquidity: this.scoreLiquidity(coin),
      tokenomics: this.scoreTokenomics(coin),
      marketCap: this.scoreMarketCap(coin),
      momentum: this.scoreMomentum(coin),
      onChain: this.scoreOnChain(coin),
    };

    const score =
      breakdown.liquidity +
      breakdown.tokenomics +
      breakdown.marketCap +
      breakdown.momentum +
      breakdown.onChain;

    return { score, breakdown };
  }

  /** Feed raw metric values into the normalizers' rolling windows */
  private feedNormalizers(coin: CoinData): void {
    if (!this.normalizers) return;

    const mc = coin.marketCap || 1;
    this.normalizers.volumeRatio.push(coin.volume24h / mc);
    this.normalizers.fdvMcRatio.push(coin.fdvMcRatio);
    this.normalizers.momentum7d.push(coin.priceChange7d);
    this.normalizers.momentum30d.push(coin.priceChange30d);

    if (coin.dexTxns24h) {
      this.normalizers.dexActivity.push(coin.dexTxns24h);
    }
  }

  /** Liquidity Score (0-5): CEX volume + DEX liquidity */
  scoreLiquidity(coin: CoinData): number {
    const mc = coin.marketCap || 1;
    const volumeRatio = coin.volume24h / mc;

    let score: number;
    if (this.normalizers) {
      const staticScore = this.staticLiquidityScore(volumeRatio);
      score = this.normalizers.volumeRatio.normalize(volumeRatio, 3, staticScore);
    } else {
      score = this.staticLiquidityScore(volumeRatio);
    }

    if (coin.dexLiquidity) {
      if (coin.dexLiquidity > 1_000_000) score += 2;
      else if (coin.dexLiquidity > 500_000) score += 1.5;
      else if (coin.dexLiquidity > 100_000) score += 1;
      else score += 0.5;
    }

    return Math.min(5, Math.round(score * 10) / 10);
  }

  private staticLiquidityScore(volumeRatio: number): number {
    if (volumeRatio > 0.5) return 3;
    if (volumeRatio > 0.2) return 2.5;
    if (volumeRatio > 0.1) return 2;
    if (volumeRatio > 0.05) return 1.5;
    if (volumeRatio > 0.01) return 1;
    return 0;
  }

  /** Tokenomics Score (0-5): FDV/MC ratio + supply metrics */
  scoreTokenomics(coin: CoinData): number {
    const fdvRatio = coin.fdvMcRatio;
    let score = 0;

    if (fdvRatio > 0 && fdvRatio < 1.2) score = 5;
    else if (fdvRatio >= 1.2 && fdvRatio < 1.5) score = 4;
    else if (fdvRatio >= 1.5 && fdvRatio < 2.0) score = 3;
    else if (fdvRatio >= 2.0 && fdvRatio < 3.0) score = 2;
    else if (fdvRatio >= 3.0 && fdvRatio < 5.0) score = 1;

    if (coin.maxSupply && coin.circulatingSupply > 0) {
      const circRatio = coin.circulatingSupply / coin.maxSupply;
      if (circRatio > 0.7) score = Math.min(5, score + 0.5);
    }

    return Math.min(5, score);
  }

  /** Market Cap Score (0-5): lower cap = higher 10x potential */
  scoreMarketCap(coin: CoinData): number {
    const mc = coin.marketCap;
    if (mc <= 0) return 0;

    if (mc < 20e6) return 5;
    if (mc < 50e6) return 4;
    if (mc < 100e6) return 3;
    if (mc < 200e6) return 2;
    if (mc < 500e6) return 1;
    return 0;
  }

  /** Momentum Score (0-5): price change trends */
  scoreMomentum(coin: CoinData): number {
    const c7d = coin.priceChange7d;
    const c30d = coin.priceChange30d;

    if (this.normalizers) {
      const staticScore = this.staticMomentumScore(c7d, c30d);
      const fallback7d = Math.round(staticScore * 3 / 5 * 10) / 10;
      const fallback30d = Math.round(staticScore * 2 / 5 * 10) / 10;
      const z7d = this.normalizers.momentum7d.normalize(c7d, 3, fallback7d);
      const z30d = this.normalizers.momentum30d.normalize(c30d, 2, fallback30d);
      return Math.min(5, Math.round((z7d + z30d) * 10) / 10);
    }

    return this.staticMomentumScore(c7d, c30d);
  }

  private staticMomentumScore(c7d: number, c30d: number): number {
    if (c7d > 20 && c30d > 50) return 5;
    if (c7d > 10 && c30d > 30) return 4;
    if (c7d > 5 && c30d > 15) return 3;
    if (c7d > 0 && c30d > 0) return 2;
    if (c7d > -10) return 1;
    return 0;
  }

  /** On-Chain Score (0-5): DEX activity and verification */
  scoreOnChain(coin: CoinData): number {
    let score = 0;

    if (coin.dexTxns24h) {
      if (coin.dexTxns24h > 5000) score += 2;
      else if (coin.dexTxns24h > 1000) score += 1.5;
      else if (coin.dexTxns24h > 500) score += 1;
      else if (coin.dexTxns24h > 100) score += 0.5;
    }

    if (coin.dexVolume24h && coin.volume24h > 0) {
      const dexCexRatio = coin.dexVolume24h / coin.volume24h;
      if (dexCexRatio > 0.5) score += 1.5;
      else if (dexCexRatio > 0.2) score += 1;
      else if (dexCexRatio > 0.05) score += 0.5;
    }

    if (coin.dexLiquidity && coin.marketCap > 0) {
      const liqMcRatio = coin.dexLiquidity / coin.marketCap;
      if (liqMcRatio > 0.1) score += 1.5;
      else if (liqMcRatio > 0.05) score += 1;
      else if (liqMcRatio > 0.01) score += 0.5;
    }

    return Math.min(5, Math.round(score * 10) / 10);
  }
}
