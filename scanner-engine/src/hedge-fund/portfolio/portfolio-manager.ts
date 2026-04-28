import { logger } from '../../utils/logger';
import {
  PortfolioState,
  Position,
  KellyResult,
  RebalanceAction,
  BacktestResult,
} from '../types';

/**
 * Module 4: Portfolio Management Layer
 *
 * - Kelly Criterion Position Sizing
 * - Dynamic Rebalancing
 * - Trailing Stop-Loss / Take-Profit
 * - Drawdown Circuit Breaker
 */
export class PortfolioManager {
  private state: PortfolioState;
  private maxDrawdownPct: number;
  private targetAllocations = new Map<string, number>();

  constructor(initialCapital = 100_000, maxDrawdownPct = 15) {
    this.maxDrawdownPct = maxDrawdownPct;
    this.state = {
      positions: [],
      totalValue: initialCapital,
      totalPnl: 0,
      totalPnlPct: 0,
      cashBalance: initialCapital,
      maxDrawdown: 0,
      isCircuitBreakerActive: false,
    };
  }

  getState(): PortfolioState {
    return { ...this.state };
  }

  /**
   * Kelly Criterion — calculates optimal position sizing based on
   * historical win rate and average win/loss ratio.
   *
   * f* = (bp - q) / b
   * where b = avg win/loss ratio, p = win probability, q = 1-p
   *
   * Uses Half-Kelly for safety.
   */
  calculateKelly(backtestResult: BacktestResult): KellyResult {
    const trades = backtestResult.trades;
    if (trades.length < 5) {
      return {
        kellyFraction: 0,
        halfKelly: 0,
        recommendedAllocation: 2,
        winProbability: 0,
        avgWinLossRatio: 0,
      };
    }

    const wins = trades.filter((t) => t.pnlUsd > 0);
    const losses = trades.filter((t) => t.pnlUsd <= 0);

    const winProbability = wins.length / trades.length;

    const avgWin =
      wins.length > 0
        ? wins.reduce((s, t) => s + Math.abs(t.returnPct), 0) / wins.length
        : 0;
    const avgLoss =
      losses.length > 0
        ? losses.reduce((s, t) => s + Math.abs(t.returnPct), 0) / losses.length
        : 1;

    const b = avgLoss > 0 ? avgWin / avgLoss : 0;
    const q = 1 - winProbability;

    const kellyFraction = b > 0 ? (b * winProbability - q) / b : 0;
    const clampedKelly = Math.max(0, Math.min(0.25, kellyFraction));
    const halfKelly = clampedKelly / 2;

    const recommendedAllocation = Math.max(1, Math.round(halfKelly * 100));

    logger.info(
      {
        winProbability: Math.round(winProbability * 100) / 100,
        avgWinLossRatio: Math.round(b * 100) / 100,
        kellyFraction: Math.round(kellyFraction * 1000) / 1000,
        halfKelly: Math.round(halfKelly * 1000) / 1000,
        recommendedAllocation,
      },
      'Kelly Criterion calculated',
    );

    return {
      kellyFraction: Math.round(clampedKelly * 1000) / 1000,
      halfKelly: Math.round(halfKelly * 1000) / 1000,
      recommendedAllocation,
      winProbability: Math.round(winProbability * 1000) / 1000,
      avgWinLossRatio: Math.round(b * 100) / 100,
    };
  }

  /**
   * Add a new position to the portfolio.
   */
  addPosition(
    symbol: string,
    price: number,
    allocationPct: number,
    stopLossPct = 5,
    takeProfitPct = 15,
  ): Position | null {
    if (this.state.isCircuitBreakerActive) {
      logger.warn('Circuit breaker active — no new positions allowed');
      return null;
    }

    const positionValue = this.state.totalValue * (allocationPct / 100);
    if (positionValue > this.state.cashBalance) {
      logger.warn(
        { symbol, required: positionValue, available: this.state.cashBalance },
        'Insufficient cash for position',
      );
      return null;
    }

    const quantity = positionValue / price;
    const position: Position = {
      symbol,
      entryPrice: price,
      currentPrice: price,
      quantity,
      valueUsd: positionValue,
      pnlUsd: 0,
      pnlPct: 0,
      allocationPct,
      stopLoss: price * (1 - stopLossPct / 100),
      takeProfit: price * (1 + takeProfitPct / 100),
      entryTime: Date.now(),
    };

    this.state.positions.push(position);
    this.state.cashBalance -= positionValue;
    this.targetAllocations.set(symbol, allocationPct);

    logger.info(
      {
        symbol,
        price,
        value: positionValue,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
      },
      'Position opened',
    );

    return position;
  }

  /**
   * Update all positions with current prices and check stop-loss/take-profit.
   */
  updatePrices(priceMap: Map<string, number>): string[] {
    const closedSymbols: string[] = [];

    for (const pos of this.state.positions) {
      const newPrice = priceMap.get(pos.symbol);
      if (!newPrice) continue;

      pos.currentPrice = newPrice;
      pos.valueUsd = pos.quantity * newPrice;
      pos.pnlUsd = pos.valueUsd - pos.quantity * pos.entryPrice;
      pos.pnlPct = ((newPrice - pos.entryPrice) / pos.entryPrice) * 100;

      if (newPrice <= pos.stopLoss) {
        closedSymbols.push(pos.symbol);
        logger.info(
          { symbol: pos.symbol, price: newPrice, stopLoss: pos.stopLoss },
          'STOP LOSS triggered',
        );
      } else if (newPrice >= pos.takeProfit) {
        closedSymbols.push(pos.symbol);
        logger.info(
          { symbol: pos.symbol, price: newPrice, takeProfit: pos.takeProfit },
          'TAKE PROFIT triggered',
        );
      }
    }

    for (const symbol of closedSymbols) {
      this.closePosition(symbol);
    }

    this.recalculatePortfolio();
    this.checkCircuitBreaker();

    return closedSymbols;
  }

  /**
   * Close a position and return cash to the portfolio.
   */
  closePosition(symbol: string): void {
    const idx = this.state.positions.findIndex((p) => p.symbol === symbol);
    if (idx === -1) return;

    const pos = this.state.positions[idx];
    this.state.cashBalance += pos.valueUsd;
    this.state.positions.splice(idx, 1);
    this.targetAllocations.delete(symbol);

    logger.info(
      { symbol, pnlUsd: pos.pnlUsd, pnlPct: pos.pnlPct },
      'Position closed',
    );
  }

  /**
   * Dynamic Rebalancing — calculate required actions to bring
   * portfolio back to target allocations.
   */
  calculateRebalance(): RebalanceAction[] {
    const actions: RebalanceAction[] = [];
    const totalValue = this.state.totalValue;

    for (const pos of this.state.positions) {
      const currentAlloc = (pos.valueUsd / totalValue) * 100;
      const targetAlloc = this.targetAllocations.get(pos.symbol) || 0;
      const delta = targetAlloc - currentAlloc;
      const deltaUsd = (delta / 100) * totalValue;

      if (Math.abs(delta) > 1) {
        actions.push({
          symbol: pos.symbol,
          action: delta > 0 ? 'BUY' : 'SELL',
          currentAllocationPct: Math.round(currentAlloc * 100) / 100,
          targetAllocationPct: targetAlloc,
          deltaUsd: Math.round(deltaUsd * 100) / 100,
        });
      } else {
        actions.push({
          symbol: pos.symbol,
          action: 'HOLD',
          currentAllocationPct: Math.round(currentAlloc * 100) / 100,
          targetAllocationPct: targetAlloc,
          deltaUsd: 0,
        });
      }
    }

    return actions;
  }

  /**
   * Drawdown Circuit Breaker — auto-pause if portfolio drawdown
   * exceeds the configured threshold.
   */
  private checkCircuitBreaker(): void {
    if (this.state.maxDrawdown >= this.maxDrawdownPct) {
      if (!this.state.isCircuitBreakerActive) {
        this.state.isCircuitBreakerActive = true;
        logger.warn(
          {
            maxDrawdown: this.state.maxDrawdown,
            threshold: this.maxDrawdownPct,
          },
          'CIRCUIT BREAKER ACTIVATED — all new positions blocked',
        );
      }
    }
  }

  /**
   * Reset the circuit breaker (manual override).
   */
  resetCircuitBreaker(): void {
    this.state.isCircuitBreakerActive = false;
    logger.info('Circuit breaker reset');
  }

  private recalculatePortfolio(): void {
    const positionsValue = this.state.positions.reduce(
      (sum, p) => sum + p.valueUsd,
      0,
    );
    this.state.totalValue = positionsValue + this.state.cashBalance;

    const initialValue =
      this.state.positions.reduce(
        (sum, p) => sum + p.quantity * p.entryPrice,
        0,
      ) + this.state.cashBalance;

    this.state.totalPnl = this.state.totalValue - initialValue;
    this.state.totalPnlPct =
      initialValue > 0
        ? ((this.state.totalValue - initialValue) / initialValue) * 100
        : 0;

    const peak = Math.max(this.state.totalValue, initialValue);
    const drawdown = ((peak - this.state.totalValue) / peak) * 100;
    if (drawdown > this.state.maxDrawdown) {
      this.state.maxDrawdown = Math.round(drawdown * 100) / 100;
    }

    for (const pos of this.state.positions) {
      pos.allocationPct =
        this.state.totalValue > 0
          ? (pos.valueUsd / this.state.totalValue) * 100
          : 0;
    }
  }
}
