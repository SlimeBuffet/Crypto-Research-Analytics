import { CoinData } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import { CircuitBreaker } from '../utils/circuit-breaker';
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
 * Layer 2b: Dynamic Scorer — Master Level Scoring Formula (Enhanced)
 *
 * Formula:
 *   FinalScore = ( Σ(w_i * S_i) / V_volatility ) × C_correlation
 *
 * Enhanced features:
 *   1. Circuit Breaker on Binance API calls
 *   2. BTC return caching for correlation computation
 *   3. Improved volatility divisor with finer granularity
 */
export class DynamicScorer {
  private binance: BinanceAdapter;
  private weights: ScoreWeights;
  private btcReturns: number[] | null = null;
  private circuitBreaker: CircuitBreaker;

  constructor(weights?: Partial<ScoreWeights>) {
    this.binance = new BinanceAdapter();
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
    this.circuitBreaker = new CircuitBreaker({
      name: 'dynamic-scorer',
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    });
  }

  async calculate(
    coin: CoinData,
    smcAnalysis: SmcAnalysis | null,
    forensicAudit: ForensicAuditResult | null,
    narrativeMap: NarrativeMapResult | null,
  ): Promise<DynamicScoreResult> {
    const baseScores = coin.scoreBreakdown;
    const smcScore = smcAnalysis ? Math.min(5, smcAnalysis.smcScore / 2) : 0;
    const forensicScore = forensicAudit ? this.calculateForensicScore(forensicAudit) : 2.5;
    const narrativeScore = narrativeMap ? Math.min(5, narrativeMap.adjustedNarrativeScore) : 0;

    const weightedSum =
      this.weights.liquidity * baseScores.liquidity +
      this.weights.tokenomics * baseScores.tokenomics +
      this.weights.marketCap * baseScores.marketCap +
      this.weights.momentum * baseScores.momentum +
      this.weights.onChain * baseScores.onChain +
      this.weights.smc * smcScore +
      this.weights.forensic * forensicScore +
      this.weights.narrative * narrativeScore;

    const volatility = await this.calculateVolatility(coin.symbol);
    const volatilityFactor = this.volatilityDivisor(volatility);
    const correlationPenalty = await this.calculateCorrelationPenalty(coin.symbol);

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

  private calculateForensicScore(audit: ForensicAuditResult): number {
    switch (audit.overallRiskLevel) {
      case 'SAFE': return 5;
      case 'CAUTION': return 3;
      case 'DANGER': return 1;
      case 'CRITICAL': return 0;
      default: return 2.5;
    }
  }

  private async calculateVolatility(symbol: string): Promise<number> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const klines = await this.binance.fetchKlines(symbol, '1d', 30);
        const closes = klines.map((k) => parseFloat(k.close));
        if (closes.length < 5) return 0.5;

        const returns: number[] = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }

        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
        return Math.sqrt(variance * 365);
      });
    } catch {
      return 0.5;
    }
  }

  private volatilityDivisor(annualizedVol: number): number {
    if (annualizedVol <= 0.3) return 1.0;
    if (annualizedVol <= 0.5) return 1.1;
    if (annualizedVol <= 0.8) return 1.2;
    if (annualizedVol <= 1.2) return 1.4;
    if (annualizedVol <= 2.0) return 1.7;
    return 2.0;
  }

  async calculateCorrelationPenalty(symbol: string): Promise<number> {
    try {
      if (!this.btcReturns) {
        await this.circuitBreaker.execute(async () => {
          const btcKlines = await this.binance.fetchKlines('BTC', '1d', 30);
          const btcCloses = btcKlines.map((k) => parseFloat(k.close));
          this.btcReturns = [];
          for (let i = 1; i < btcCloses.length; i++) {
            this.btcReturns.push((btcCloses[i] - btcCloses[i - 1]) / btcCloses[i - 1]);
          }
        });
      }

      const coinReturns: number[] = [];
      await this.circuitBreaker.execute(async () => {
        const coinKlines = await this.binance.fetchKlines(symbol, '1d', 30);
        const closes = coinKlines.map((k) => parseFloat(k.close));
        for (let i = 1; i < closes.length; i++) {
          coinReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }
      });

      if (!this.btcReturns || coinReturns.length < 5) return 1.0;

      const correlation = this.pearsonCorrelation(coinReturns, this.btcReturns);
      const absCor = Math.abs(correlation);

      if (absCor > 0.9) return 0.6;
      if (absCor > 0.8) return 0.7;
      if (absCor > 0.7) return 0.8;
      if (absCor > 0.5) return 0.9;
      return 1.0;
    } catch {
      return 1.0;
    }
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    const xS = x.slice(-n);
    const yS = y.slice(-n);
    const mX = xS.reduce((a, b) => a + b, 0) / n;
    const mY = yS.reduce((a, b) => a + b, 0) / n;
    let num = 0, dX = 0, dY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xS[i] - mX;
      const dy = yS[i] - mY;
      num += dx * dy;
      dX += dx * dx;
      dY += dy * dy;
    }
    const d = Math.sqrt(dX * dY);
    return d === 0 ? 0 : num / d;
  }

  updateWeights(newWeights: Partial<ScoreWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
    logger.info({ weights: this.weights }, 'Scorer weights updated');
  }

  getWeights(): ScoreWeights {
    return { ...this.weights };
  }
}
