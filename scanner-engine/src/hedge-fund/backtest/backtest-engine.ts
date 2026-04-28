import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import { PriceChannelTrigger } from '../trigger';
import {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  EquityPoint,
  MonteCarloResult,
  TriggerConfig,
} from '../types';

const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  startDate: Date.now() - 90 * 24 * 60 * 60 * 1000,
  endDate: Date.now(),
  initialCapital: 100_000,
  positionSizePct: 5,
  stopLossPct: 5,
  takeProfitPct: 15,
};

/**
 * Module 3: Backtesting & Simulation Engine
 *
 * - Historical Performance Simulation
 * - Monte Carlo Simulation
 * - Walk-Forward Optimization
 */
export class BacktestEngine {
  private binance: BinanceAdapter;
  private trigger: PriceChannelTrigger;

  constructor(triggerConfig?: Partial<TriggerConfig>) {
    this.binance = new BinanceAdapter();
    this.trigger = new PriceChannelTrigger(triggerConfig);
  }

  /**
   * Run a historical backtest for a single symbol using the
   * Price Channel Trigger as entry signal.
   */
  async runBacktest(
    symbol: string,
    config?: Partial<BacktestConfig>,
  ): Promise<BacktestResult> {
    const cfg = { ...DEFAULT_BACKTEST_CONFIG, ...config };
    const days = Math.floor(
      (cfg.endDate - cfg.startDate) / (24 * 60 * 60 * 1000),
    );

    logger.info(
      { symbol, days, capital: cfg.initialCapital },
      'Starting backtest',
    );

    const klines = await this.binance.fetchKlines(symbol, '1d', Math.min(days, 365));

    if (klines.length < 20) {
      logger.warn({ symbol, got: klines.length }, 'Insufficient kline data for backtest');
      return this.emptyResult();
    }

    const trades: BacktestTrade[] = [];
    const equityCurve: EquityPoint[] = [];
    let equity = cfg.initialCapital;
    let peak = equity;
    let maxDrawdown = 0;
    let inPosition = false;
    let entryPrice = 0;
    let entryTime = 0;
    const positionSize = cfg.initialCapital * (cfg.positionSizePct / 100);

    for (let i = 15; i < klines.length; i++) {
      const windowKlines = klines.slice(0, i + 1);
      const state = this.trigger.evaluate(symbol, windowKlines);
      const close = parseFloat(klines[i].close);
      const timestamp = klines[i].closeTime;

      if (!inPosition && state.isTriggered) {
        inPosition = true;
        entryPrice = close;
        entryTime = timestamp;
      }

      if (inPosition) {
        const changePct = ((close - entryPrice) / entryPrice) * 100;

        if (changePct <= -cfg.stopLossPct || changePct >= cfg.takeProfitPct) {
          const pnlPct = changePct <= -cfg.stopLossPct
            ? -cfg.stopLossPct
            : cfg.takeProfitPct;
          const pnlUsd = positionSize * (pnlPct / 100);

          trades.push({
            symbol,
            entryPrice,
            exitPrice: close,
            entryTime,
            exitTime: timestamp,
            returnPct: pnlPct,
            pnlUsd,
            side: 'LONG',
          });

          equity += pnlUsd;
          inPosition = false;
        }

        if (!state.isTriggered && inPosition && i > 15) {
          const pnlPct = ((close - entryPrice) / entryPrice) * 100;
          const pnlUsd = positionSize * (pnlPct / 100);

          trades.push({
            symbol,
            entryPrice,
            exitPrice: close,
            entryTime,
            exitTime: timestamp,
            returnPct: pnlPct,
            pnlUsd,
            side: 'LONG',
          });

          equity += pnlUsd;
          inPosition = false;
        }
      }

      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;

      equityCurve.push({
        timestamp,
        equity: Math.round(equity * 100) / 100,
        drawdown: Math.round(dd * 100) / 100,
      });
    }

    const totalReturn =
      ((equity - cfg.initialCapital) / cfg.initialCapital) * 100;
    const tradingDays = klines.length;
    const annualizedReturn =
      Math.pow(1 + totalReturn / 100, 365 / tradingDays) * 100 - 100;

    const wins = trades.filter((t) => t.pnlUsd > 0);
    const losses = trades.filter((t) => t.pnlUsd <= 0);
    const winRate =
      trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

    const grossProfit = wins.reduce((s, t) => s + t.pnlUsd, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const returns = trades.map((t) => t.returnPct / 100);
    const meanReturn =
      returns.length > 0
        ? returns.reduce((a, b) => a + b, 0) / returns.length
        : 0;
    const stdReturn =
      returns.length > 1
        ? Math.sqrt(
            returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) /
              (returns.length - 1),
          )
        : 0;
    const sharpeRatio =
      stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

    const result: BacktestResult = {
      totalReturn: Math.round(totalReturn * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      totalTrades: trades.length,
      profitFactor: Math.round(profitFactor * 100) / 100,
      trades,
      equityCurve,
    };

    logger.info(
      {
        symbol,
        totalReturn: result.totalReturn,
        sharpe: result.sharpeRatio,
        winRate: result.winRate,
        trades: result.totalTrades,
        maxDrawdown: result.maxDrawdown,
      },
      'Backtest complete',
    );

    return result;
  }

  /**
   * Monte Carlo Simulation — runs N randomized permutations of
   * trade outcomes to estimate return distribution.
   */
  runMonteCarlo(
    backtestResult: BacktestResult,
    simulations = 1000,
  ): MonteCarloResult {
    if (backtestResult.trades.length === 0) {
      return {
        simulations: 0,
        medianReturn: 0,
        percentile5: 0,
        percentile95: 0,
        probabilityOfProfit: 0,
        maxDrawdownMedian: 0,
        confidenceInterval: { lower: 0, upper: 0 },
      };
    }

    const tradeReturns = backtestResult.trades.map((t) => t.returnPct / 100);
    const simReturns: number[] = [];
    const simDrawdowns: number[] = [];

    for (let sim = 0; sim < simulations; sim++) {
      let equity = 1.0;
      let peak = 1.0;
      let maxDD = 0;

      const shuffled = [...tradeReturns].sort(() => Math.random() - 0.5);

      for (const ret of shuffled) {
        equity *= 1 + ret;
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak;
        if (dd > maxDD) maxDD = dd;
      }

      simReturns.push((equity - 1) * 100);
      simDrawdowns.push(maxDD * 100);
    }

    simReturns.sort((a, b) => a - b);
    simDrawdowns.sort((a, b) => a - b);

    const idx5 = Math.floor(simulations * 0.05);
    const idx50 = Math.floor(simulations * 0.5);
    const idx95 = Math.floor(simulations * 0.95);

    const profitable = simReturns.filter((r) => r > 0).length;

    return {
      simulations,
      medianReturn: Math.round(simReturns[idx50] * 100) / 100,
      percentile5: Math.round(simReturns[idx5] * 100) / 100,
      percentile95: Math.round(simReturns[idx95] * 100) / 100,
      probabilityOfProfit:
        Math.round((profitable / simulations) * 10000) / 100,
      maxDrawdownMedian:
        Math.round(simDrawdowns[idx50] * 100) / 100,
      confidenceInterval: {
        lower: Math.round(simReturns[idx5] * 100) / 100,
        upper: Math.round(simReturns[idx95] * 100) / 100,
      },
    };
  }

  /**
   * Walk-Forward Optimization — tests parameter stability by
   * running backtests on rolling windows and measuring consistency.
   */
  async walkForwardTest(
    symbol: string,
    windows = 3,
  ): Promise<BacktestResult[]> {
    const totalDays = 180;
    const windowSize = Math.floor(totalDays / windows);

    logger.info(
      { symbol, windows, windowSize },
      'Starting walk-forward optimization',
    );

    const results: BacktestResult[] = [];

    for (let w = 0; w < windows; w++) {
      const endDate = Date.now() - w * windowSize * 24 * 60 * 60 * 1000;
      const startDate = endDate - windowSize * 24 * 60 * 60 * 1000;

      const result = await this.runBacktest(symbol, { startDate, endDate });
      results.push(result);
    }

    logger.info(
      {
        symbol,
        windows: results.length,
        returns: results.map((r) => r.totalReturn),
        sharpes: results.map((r) => r.sharpeRatio),
      },
      'Walk-forward optimization complete',
    );

    return results;
  }

  private emptyResult(): BacktestResult {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      totalTrades: 0,
      profitFactor: 0,
      trades: [],
      equityCurve: [],
    };
  }
}
