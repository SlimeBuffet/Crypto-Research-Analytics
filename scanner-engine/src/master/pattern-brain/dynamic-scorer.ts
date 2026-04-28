import { CoinData } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import {
  DynamicScoreResult,
  ScoreWeights,
  SmcAnalysis,
  ForensicAuditResult,
  NarrativeMapResult,
} from '../types';

const DEFAULT_WEIGHTS: ScoreWeights = {
  liquidity: 1.0,
  tokenomics: 1.0,
  marketCap: 1.0,
  momentum: 1.0,
  onChain: 1.0,
  smc: 1.2,
  forensic: 1.5,
  narrative: 0.8,
};

/**
 * Layer 2b: Dynamic Scorer — Master Level Scoring Formula
 *
 * Formula:
 *   FinalScore = ( Σ(w_i * S_i) / V_volatility ) × C_correlation
 *
 * Automatically reduces score when:
 *   - BTC correlation is too high (coin has no "independent strength")
 *   - Volatility is extreme (risk adjustment)
 *   - Forensic audit fails (security penalty)
 */
export class DynamicScorer {
  private binance: BinanceAdapter;
  private weights: ScoreWeights;
  private btcReturns: number[] | null = null;

  constructor(weights?: Partial<ScoreWeights>) {
    this.binance = new BinanceAdapter();
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Calculate the dynamic Master Score for a coin.
   */
  async calculate(
    coin: CoinData,
    smcAnalysis: SmcAnalysis | null,
    forensicAudit: ForensicAuditResult | null,
    narrativeMap: NarrativeMapResult | null,
  ): Promise<DynamicScoreResult> {
    // Base score components from existing Alpha Score
    const baseScores = coin.scoreBreakdown;

    // SMC score (0-10 mapped to 0-5)
    const smcScore = smcAnalysis ? Math.min(5, smcAnalysis.smcScore / 2) : 0;

    // Forensic score (inverted risk: high security = high score)
    const forensicScore = forensicAudit
      ? this.calculateForensicScore(forensicAudit)
      : 2.5;

    // Narrative score
    const narrativeScore = narrativeMap
      ? Math.min(5, narrativeMap.adjustedNarrativeScore)
      : 0;

    // Weighted sum: Σ(w_i * S_i)
    const weightedSum =
      this.weights.liquidity * baseScores.liquidity +
      this.weights.tokenomics * baseScores.tokenomics +
      this.weights.marketCap * baseScores.marketCap +
      this.weights.momentum * baseScores.momentum +
      this.weights.onChain * baseScores.onChain +
      this.weights.smc * smcScore +
      this.weights.forensic * forensicScore +
      this.weights.narrative * narrativeScore;

    // Volatility adjustment: V_volatility
    const volatility = await this.calculateVolatility(coin.symbol);
    const volatilityFactor = this.volatilityDivisor(volatility);

    // Correlation penalty: C_correlation
    const correlationPenalty = await this.calculateCorrelationPenalty(coin.symbol);

    // Final formula: (Σ w_i S_i / V_volatility) × C_correlation
    const volatilityAdjustedScore = weightedSum / volatilityFactor;
    const finalScore = volatilityAdjustedScore * correlationPenalty;

    return {
      rawScore: Math.round(weightedSum * 100) / 100,
      volatilityAdjustedScore: Math.round(volatilityAdjustedScore * 100) / 100,
      correlationPenalty: Math.round(correlationPenalty * 1000) / 1000,
      finalScore: Math.round(finalScore * 100) / 100,
      formula: `(Σw_i·S_i / V) × C = (${weightedSum.toFixed(2)} / ${volatilityFactor.toFixed(2)}) × ${correlationPenalty.toFixed(3)}`,
      weights: { ...this.weights },
    };
  }

  /**
   * Convert forensic audit into a 0-5 score.
   */
  private calculateForensicScore(audit: ForensicAuditResult): number {
    switch (audit.overallRiskLevel) {
      case 'SAFE':
        return 5;
      case 'CAUTION':
        return 3;
      case 'DANGER':
        return 1;
      case 'CRITICAL':
        return 0;
      default:
        return 2.5;
    }
  }

  /**
   * Calculate annualized volatility from daily returns.
   */
  private async calculateVolatility(symbol: string): Promise<number> {
    try {
      const klines = await this.binance.fetchKlines(symbol, '1d', 30);
      const closes = klines.map((k) => parseFloat(k.close));

      if (closes.length < 5) return 0.5;

      const returns: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }

      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance =
        returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
        (returns.length - 1);

      return Math.sqrt(variance * 365);
    } catch {
      return 0.5;
    }
  }

  /**
   * Convert volatility to a divisor for score adjustment.
   * Higher volatility = higher divisor = lower score.
   */
  private volatilityDivisor(annualizedVol: number): number {
    if (annualizedVol <= 0.3) return 1.0;
    if (annualizedVol <= 0.5) return 1.1;
    if (annualizedVol <= 0.8) return 1.2;
    if (annualizedVol <= 1.2) return 1.4;
    if (annualizedVol <= 2.0) return 1.7;
    return 2.0;
  }

  /**
   * Calculate BTC correlation penalty.
   * If the coin moves too closely with BTC, it lacks independent alpha.
   */
  private async calculateCorrelationPenalty(symbol: string): Promise<number> {
    if (symbol === 'BTC') return 1.0;

    try {
      const btcReturns = await this.getBtcReturns();
      const klines = await this.binance.fetchKlines(symbol, '1d', 30);
      const closes = klines.map((k) => parseFloat(k.close));

      if (closes.length < 5) return 1.0;

      const coinReturns: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        coinReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }

      const correlation = this.pearsonCorrelation(coinReturns, btcReturns);

      // High correlation with BTC = penalty
      // correlation > 0.8  → multiply by 0.7 (30% penalty)
      // correlation > 0.6  → multiply by 0.85 (15% penalty)
      // correlation <= 0.6 → no penalty (multiply by 1.0)
      if (Math.abs(correlation) > 0.8) return 0.7;
      if (Math.abs(correlation) > 0.6) return 0.85;
      return 1.0;
    } catch {
      return 1.0;
    }
  }

  /**
   * Get cached BTC daily returns.
   */
  private async getBtcReturns(): Promise<number[]> {
    if (this.btcReturns) return this.btcReturns;

    try {
      const klines = await this.binance.fetchKlines('BTC', '1d', 30);
      const closes = klines.map((k) => parseFloat(k.close));

      this.btcReturns = [];
      for (let i = 1; i < closes.length; i++) {
        this.btcReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }

      return this.btcReturns;
    } catch {
      return [];
    }
  }

  /**
   * Pearson correlation coefficient.
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;

    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);

    const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
    const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = xSlice[i] - meanX;
      const dy = ySlice[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    if (denom === 0) return 0;

    return numerator / denom;
  }

  /**
   * Update scoring weights (used by Auto-Optimizer).
   */
  updateWeights(newWeights: Partial<ScoreWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
    logger.info({ weights: this.weights }, 'Dynamic scorer weights updated');
  }

  getWeights(): ScoreWeights {
    return { ...this.weights };
  }
}
