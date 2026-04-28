import { CoinData } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { fetchWithBackoff } from '../../utils/fetcher';
import { logger } from '../../utils/logger';
import {
  ExecutionPlan,
  ExecutionTask,
  ExecutionPriority,
  OrderBookAnalysis,
  ExecutionStrategy,
  ExecutionSlice,
  RoutingPlan,
  RouteAllocation,
} from '../types';

/**
 * Pillar C: Liquidity & Execution — "The Sword"
 *
 * Sub-components:
 *   1. Order Book Depth Analysis — minimize slippage (< 1%)
 *   2. VWAP/TWAP execution      — hide institutional footprints
 *   3. Smart Order Routing       — route between Binance + top DEXs
 */
export class ExecutionEngine {
  private binance: BinanceAdapter;
  private maxSlippagePct: number;

  constructor(maxSlippagePct = 1.0) {
    this.binance = new BinanceAdapter();
    this.maxSlippagePct = maxSlippagePct;
  }

  async plan(
    coin: CoinData,
    positionSizeUsd: number,
    strategy: 'VWAP' | 'TWAP' = 'VWAP',
    numSlices = 10,
    intervalMs = 60_000,
    priority: ExecutionPriority = 'MEDIUM',
  ): Promise<ExecutionPlan> {
    const orderBookAnalysis = await this.analyzeOrderBook(coin, positionSizeUsd);
    const routingPlan = this.buildRoutingPlan(coin, orderBookAnalysis);
    const executionStrategy = this.buildExecutionStrategy(
      coin,
      positionSizeUsd,
      strategy,
      numSlices,
      intervalMs,
      routingPlan,
    );

    return {
      symbol: coin.symbol,
      priority,
      orderBookAnalysis,
      executionStrategy,
      routingPlan,
    };
  }

  /** Determine execution priority based on alpha score */
  static assignPriority(alphaScore: number): ExecutionPriority {
    if (alphaScore >= 90) return 'HIGH';
    if (alphaScore >= 75) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Order Book Depth Analysis.
   * Fetches the Binance order book and estimates slippage for a given position size.
   */
  private async analyzeOrderBook(
    coin: CoinData,
    positionSizeUsd: number,
  ): Promise<OrderBookAnalysis> {
    let bidDepthUsd = 0;
    let askDepthUsd = 0;
    let spread = 0;

    try {
      const orderBook = await fetchWithBackoff<{
        bids: string[][];
        asks: string[][];
      }>(
        `${process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3'}/depth?symbol=${coin.binancePair}&limit=100`,
        { label: `binance/depth/${coin.symbol}` },
      );

      for (const [price, qty] of orderBook.bids) {
        bidDepthUsd += parseFloat(price) * parseFloat(qty);
      }

      for (const [price, qty] of orderBook.asks) {
        askDepthUsd += parseFloat(price) * parseFloat(qty);
      }

      if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const bestBid = parseFloat(orderBook.bids[0][0]);
        const bestAsk = parseFloat(orderBook.asks[0][0]);
        spread = ((bestAsk - bestBid) / bestBid) * 100;
      }
    } catch (err) {
      const error = err as Error;
      logger.warn(
        { symbol: coin.symbol, error: error.message },
        'Order book fetch failed, using volume estimates',
      );
      bidDepthUsd = coin.volume24h * 0.02;
      askDepthUsd = coin.volume24h * 0.02;
      spread = 0.1;
    }

    const estimatedSlippage = this.estimateSlippage(positionSizeUsd, askDepthUsd);
    const isLiquidEnough = estimatedSlippage < this.maxSlippagePct;

    return {
      bidDepthUsd,
      askDepthUsd,
      spread,
      estimatedSlippage,
      isLiquidEnough,
    };
  }

  /**
   * Estimate slippage based on position size relative to available depth.
   * Uses a simplified market impact model: slippage ~ (order_size / depth)^0.5
   */
  private estimateSlippage(positionSizeUsd: number, depthUsd: number): number {
    if (depthUsd <= 0) return 100;

    const ratio = positionSizeUsd / depthUsd;
    const slippage = Math.sqrt(ratio) * 100;
    return Math.min(slippage, 100);
  }

  /**
   * Build VWAP or TWAP execution strategy.
   * Splits the order into time-weighted slices to reduce market impact.
   */
  private buildExecutionStrategy(
    coin: CoinData,
    positionSizeUsd: number,
    type: 'VWAP' | 'TWAP',
    numSlices: number,
    intervalMs: number,
    routing: RoutingPlan,
  ): ExecutionStrategy {
    const slices: ExecutionSlice[] = [];
    const now = Date.now();

    if (type === 'VWAP') {
      const weights = this.generateVwapWeights(numSlices);
      for (let i = 0; i < numSlices; i++) {
        const route = routing.routes[i % routing.routes.length];
        slices.push({
          index: i,
          targetPrice: coin.price * (1 + (i * 0.0005)),
          quantityUsd: positionSizeUsd * weights[i],
          exchange: route.exchange,
          timestamp: now + i * intervalMs,
        });
      }
    } else {
      const sliceSize = positionSizeUsd / numSlices;
      for (let i = 0; i < numSlices; i++) {
        const route = routing.routes[i % routing.routes.length];
        slices.push({
          index: i,
          targetPrice: coin.price,
          quantityUsd: sliceSize,
          exchange: route.exchange,
          timestamp: now + i * intervalMs,
        });
      }
    }

    return {
      type,
      totalQuantityUsd: positionSizeUsd,
      numSlices,
      intervalMs,
      maxSlippagePct: this.maxSlippagePct,
      slices,
    };
  }

  /**
   * Generate VWAP-style weights: heavier at the edges (open/close),
   * lighter in the middle to match typical intraday volume patterns.
   */
  private generateVwapWeights(n: number): number[] {
    const raw: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      raw.push(1 + 0.5 * x * x);
    }

    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map((w) => w / total);
  }

  /**
   * Smart Order Routing — split across Binance and top DEXs.
   * Allocation is based on available liquidity depth.
   */
  private buildRoutingPlan(
    coin: CoinData,
    orderBook: OrderBookAnalysis,
  ): RoutingPlan {
    const routes: RouteAllocation[] = [];

    const cexDepth = orderBook.askDepthUsd;
    const dexDepth = coin.dexLiquidity || 0;
    const totalDepth = cexDepth + dexDepth;

    if (totalDepth <= 0) {
      routes.push({
        exchange: 'binance',
        allocationPct: 100,
        estimatedSlippage: orderBook.estimatedSlippage,
        liquidityDepth: cexDepth,
      });

      return {
        routes,
        primaryExchange: 'binance',
        fallbackExchanges: [],
      };
    }

    const cexAllocation = Math.round((cexDepth / totalDepth) * 100);
    const dexAllocation = 100 - cexAllocation;

    routes.push({
      exchange: 'binance',
      allocationPct: cexAllocation,
      estimatedSlippage: this.estimateSlippage(
        (cexAllocation / 100) * cexDepth * 0.1,
        cexDepth,
      ),
      liquidityDepth: cexDepth,
    });

    if (dexDepth > 0) {
      const dexName = coin.chain === 'bsc'
        ? 'pancakeswap'
        : coin.chain === 'ethereum'
          ? 'uniswap'
          : coin.chain === 'solana'
            ? 'raydium'
            : 'dex_aggregator';

      routes.push({
        exchange: dexName,
        allocationPct: dexAllocation,
        estimatedSlippage: this.estimateSlippage(
          (dexAllocation / 100) * dexDepth * 0.1,
          dexDepth,
        ),
        liquidityDepth: dexDepth,
      });
    }

    routes.sort((a, b) => b.allocationPct - a.allocationPct);

    return {
      routes,
      primaryExchange: routes[0].exchange,
      fallbackExchanges: routes.slice(1).map((r) => r.exchange),
    };
  }

  /**
   * Batch plan execution for multiple coins (legacy interface).
   */
  async planBatch(
    coins: CoinData[],
    positionSizeUsd: number,
    strategy: 'VWAP' | 'TWAP',
    numSlices: number,
    intervalMs: number,
  ): Promise<Map<string, ExecutionPlan>> {
    const tasks: ExecutionTask[] = coins.map((coin) => ({
      coin,
      priority: 'MEDIUM',
      alphaScore: 0,
      positionSizeUsd,
      strategy,
      numSlices,
      intervalMs,
    }));

    return this.planWithPriorityQueue(tasks);
  }

  /**
   * Priority Queue Execution — processes tasks by priority.
   * HIGH priority tasks execute first and are retried on rate-limit.
   * LOW priority tasks are deferred when rate-limited.
   */
  async planWithPriorityQueue(
    tasks: ExecutionTask[],
  ): Promise<Map<string, ExecutionPlan>> {
    const priorityOrder: Record<ExecutionPriority, number> = {
      HIGH: 0,
      MEDIUM: 1,
      LOW: 2,
    };

    const sorted = [...tasks].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
        || b.alphaScore - a.alphaScore,
    );

    const results = new Map<string, ExecutionPlan>();
    let rateLimitHit = false;
    const deferred: ExecutionTask[] = [];

    for (const task of sorted) {
      if (rateLimitHit && task.priority === 'LOW') {
        deferred.push(task);
        continue;
      }

      try {
        const plan = await this.plan(
          task.coin,
          task.positionSizeUsd,
          task.strategy,
          task.numSlices,
          task.intervalMs,
          task.priority,
        );
        results.set(task.coin.symbol, plan);
      } catch (err) {
        const error = err as Error;
        const isRateLimit = error.message.includes('429') || error.message.includes('rate');

        if (isRateLimit) {
          rateLimitHit = true;
          logger.warn(
            { symbol: task.coin.symbol, priority: task.priority },
            'Rate limit hit — deferring LOW priority tasks',
          );

          if (task.priority === 'HIGH') {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
              const retryPlan = await this.plan(
                task.coin,
                task.positionSizeUsd,
                task.strategy,
                task.numSlices,
                task.intervalMs,
                task.priority,
              );
              results.set(task.coin.symbol, retryPlan);
            } catch (retryErr) {
              const retryError = retryErr as Error;
              logger.warn(
                { symbol: task.coin.symbol, error: retryError.message },
                'HIGH priority retry also failed',
              );
            }
          } else {
            deferred.push(task);
          }
        } else {
          logger.warn(
            { symbol: task.coin.symbol, error: error.message },
            'Execution planning failed',
          );
        }
      }
    }

    if (deferred.length > 0) {
      logger.info(
        { deferred: deferred.length },
        'Processing deferred LOW priority tasks after cooldown',
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));

      for (const task of deferred) {
        try {
          const plan = await this.plan(
            task.coin,
            task.positionSizeUsd,
            task.strategy,
            task.numSlices,
            task.intervalMs,
            task.priority,
          );
          results.set(task.coin.symbol, plan);
        } catch (err) {
          const error = err as Error;
          logger.warn(
            { symbol: task.coin.symbol, error: error.message },
            'Deferred execution planning failed',
          );
        }
      }
    }

    logger.info(
      {
        planned: results.size,
        total: tasks.length,
        deferred: deferred.length,
        liquidEnough: [...results.values()].filter(
          (p) => p.orderBookAnalysis.isLiquidEnough,
        ).length,
        byPriority: {
          high: tasks.filter((t) => t.priority === 'HIGH').length,
          medium: tasks.filter((t) => t.priority === 'MEDIUM').length,
          low: tasks.filter((t) => t.priority === 'LOW').length,
        },
      },
      'Pillar C: Priority queue execution complete',
    );

    return results;
  }
}
