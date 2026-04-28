import { CoinData } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import {
  ScoreWeights,
  OptimizationResult,
  OptimizationBacktest,
  HistoricalPerformance,
} from '../types';
import { DynamicScorer } from '../pattern-brain/dynamic-scorer';

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
 * Auto-Optimization Module
 *
 * Looks at which coins actually achieved 10x returns in the past,
 * then tunes the scoring weights so the system can better
 * identify similar coins in the future.
 *
 * Uses a simple grid search over weight combinations
 * to maximize the F1 score (precision × recall balance).
 */
export class AutoOptimizer {
  private binance: BinanceAdapter;
  private historicalData: HistoricalPerformance[] = [];
  private currentWeights: ScoreWeights;

  constructor(initialWeights?: Partial<ScoreWeights>) {
    this.binance = new BinanceAdapter();
    this.currentWeights = { ...DEFAULT_WEIGHTS, ...initialWeights };
  }

  /**
   * Run the auto-optimization process.
   * Analyzes historical performance and tunes weights.
   */
  async optimize(
    coins: CoinData[],
    scorer: DynamicScorer,
  ): Promise<OptimizationResult> {
    logger.info('Starting auto-optimization...');

    // Collect historical performance data
    await this.collectHistoricalPerformance(coins);

    if (this.historicalData.length < 5) {
      logger.info('Not enough historical data for optimization');
      return {
        previousWeights: { ...this.currentWeights },
        optimizedWeights: { ...this.currentWeights },
        improvement: 0,
        backtestResults: this.emptyBacktest(),
        appliedAt: Date.now(),
      };
    }

    // Run grid search to find optimal weights
    const previousWeights = { ...this.currentWeights };
    const { bestWeights, bestBacktest } = this.gridSearchOptimize();

    // Calculate improvement
    const baselineBacktest = this.evaluateWeights(previousWeights);
    const improvement = bestBacktest.f1Score - baselineBacktest.f1Score;

    // Only apply if there's meaningful improvement
    if (improvement > 0.05) {
      this.currentWeights = bestWeights;
      scorer.updateWeights(bestWeights);

      logger.info(
        {
          previousF1: baselineBacktest.f1Score.toFixed(3),
          newF1: bestBacktest.f1Score.toFixed(3),
          improvement: improvement.toFixed(3),
        },
        'Weights optimized',
      );
    } else {
      logger.info('Optimization did not yield significant improvement');
    }

    return {
      previousWeights,
      optimizedWeights: { ...this.currentWeights },
      improvement: Math.round(improvement * 1000) / 1000,
      backtestResults: bestBacktest,
      appliedAt: Date.now(),
    };
  }

  /**
   * Collect historical performance data for coins.
   * Uses price history to determine if a coin has achieved significant returns.
   */
  private async collectHistoricalPerformance(coins: CoinData[]): Promise<void> {
    for (const coin of coins.slice(0, 50)) {
      try {
        const klines = await this.binance.fetchKlines(coin.symbol, '1d', 30);

        if (klines.length < 10) continue;

        const entryPrice = parseFloat(klines[0].close);
        const closes = klines.map((k) => parseFloat(k.close));
        const peakPrice = Math.max(...closes);
        const currentPrice = closes[closes.length - 1];
        const maxReturn = ((peakPrice - entryPrice) / entryPrice) * 100;

        this.historicalData.push({
          symbol: coin.symbol,
          entryPrice,
          peakPrice,
          currentPrice,
          maxReturn,
          is10x: maxReturn >= 900, // 10x = 900% gain
          scoreAtEntry: coin.alphaScore,
          weightsAtEntry: { ...this.currentWeights },
          timestamp: klines[0].openTime,
        });
      } catch {
        // Skip coins without sufficient history
      }
    }
  }

  /**
   * Grid search over weight combinations to maximize F1 score.
   */
  private gridSearchOptimize(): {
    bestWeights: ScoreWeights;
    bestBacktest: OptimizationBacktest;
  } {
    let bestWeights = { ...this.currentWeights };
    let bestBacktest = this.evaluateWeights(bestWeights);

    // Weight adjustment factors to try
    const factors = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const weightKeys: (keyof ScoreWeights)[] = [
      'liquidity', 'tokenomics', 'marketCap', 'momentum',
      'onChain', 'smc', 'forensic', 'narrative',
    ];

    // Simple grid search: try adjusting each weight independently
    for (const key of weightKeys) {
      for (const factor of factors) {
        const testWeights = { ...bestWeights };
        testWeights[key] = DEFAULT_WEIGHTS[key] * factor;

        const backtest = this.evaluateWeights(testWeights);

        if (backtest.f1Score > bestBacktest.f1Score) {
          bestWeights = { ...testWeights };
          bestBacktest = backtest;
        }
      }
    }

    return { bestWeights, bestBacktest };
  }

  /**
   * Evaluate a set of weights against historical data.
   * Returns precision, recall, and F1 score.
   */
  private evaluateWeights(weights: ScoreWeights): OptimizationBacktest {
    if (this.historicalData.length === 0) {
      return this.emptyBacktest();
    }

    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    const threshold = 15; // Score threshold for "predicted winner"

    for (const record of this.historicalData) {
      // Recalculate score with new weights
      const simulatedScore = this.simulateScore(record, weights);
      const predicted = simulatedScore >= threshold;
      const actual = record.maxReturn >= 100; // >100% return = success

      if (predicted && actual) truePositives++;
      else if (predicted && !actual) falsePositives++;
      else if (!predicted && actual) falseNegatives++;
    }

    const precision =
      truePositives + falsePositives > 0
        ? truePositives / (truePositives + falsePositives)
        : 0;

    const recall =
      truePositives + falseNegatives > 0
        ? truePositives / (truePositives + falseNegatives)
        : 0;

    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    return {
      totalCoinsAnalyzed: this.historicalData.length,
      winnersCorrectlyIdentified: truePositives,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1Score: Math.round(f1Score * 1000) / 1000,
    };
  }

  /**
   * Simulate a weighted score for a historical record.
   */
  private simulateScore(
    record: HistoricalPerformance,
    weights: ScoreWeights,
  ): number {
    // Use the original score as a base, then apply weight adjustments
    const baseScore = record.scoreAtEntry;
    const originalWeights = record.weightsAtEntry;

    // Calculate weight adjustment ratio
    const totalOriginal = Object.values(originalWeights).reduce((a, b) => a + b, 0);
    const totalNew = Object.values(weights).reduce((a, b) => a + b, 0);

    const ratio = totalOriginal > 0 ? totalNew / totalOriginal : 1;

    return baseScore * ratio;
  }

  /**
   * Get current optimized weights.
   */
  getWeights(): ScoreWeights {
    return { ...this.currentWeights };
  }

  /**
   * Manually set weights.
   */
  setWeights(weights: Partial<ScoreWeights>): void {
    this.currentWeights = { ...this.currentWeights, ...weights };
  }

  /**
   * Get historical performance data.
   */
  getHistoricalData(): HistoricalPerformance[] {
    return [...this.historicalData];
  }

  private emptyBacktest(): OptimizationBacktest {
    return {
      totalCoinsAnalyzed: 0,
      winnersCorrectlyIdentified: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
    };
  }
}
