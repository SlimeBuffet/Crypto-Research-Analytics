import WebSocket from 'ws';
import { logger } from '../../utils/logger';
import {
  IngestorConfig,
  StreamTradeEvent,
  OrderBookSnapshot,
  PriceLevel,
  AggregatedTradeData,
  WorkerProcessResult,
  VolumeProfile,
  GraduatedToken,
} from '../types';

const DEFAULT_CONFIG: IngestorConfig = {
  binanceWsUrl: 'wss://stream.binance.com:9443/ws',
  heliusRpcUrl: process.env.HELIUS_RPC_URL || null,
  maxStreams: 50,
  reconnectIntervalMs: 5000,
  heartbeatIntervalMs: 30000,
};

/**
 * Layer 1: The Ingestor — Stream-First Data Ingestion
 *
 * Uses WebSocket streams instead of polling for real-time
 * Order Book and Aggregated Trades monitoring.
 * Processes data in-thread to avoid blocking the main event loop.
 */
export class StreamIngestor {
  private config: IngestorConfig;
  private connections: Map<string, WebSocket> = new Map();
  private tradeBuffers: Map<string, StreamTradeEvent[]> = new Map();
  private orderBooks: Map<string, OrderBookSnapshot> = new Map();
  private isRunning = false;
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config?: Partial<IngestorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Subscribe to real-time trade streams for given symbols.
   * Uses Binance WebSocket combined streams.
   */
  async subscribeToTrades(symbols: string[]): Promise<void> {
    if (this.isRunning) {
      logger.warn('Ingestor already running, skipping duplicate subscribe');
      return;
    }

    this.isRunning = true;
    const batchSize = this.config.maxStreams;
    const batches = this.chunkArray(symbols, batchSize);

    logger.info(
      { totalSymbols: symbols.length, batches: batches.length, batchSize },
      'Starting stream subscriptions',
    );

    for (const batch of batches) {
      await this.connectBatch(batch);
    }
  }

  /**
   * Connect a batch of symbols to a single combined WebSocket stream.
   */
  private async connectBatch(symbols: string[]): Promise<void> {
    const streams = symbols
      .map((s) => `${s.toLowerCase()}usdt@aggTrade`)
      .join('/');

    const wsUrl = `${this.config.binanceWsUrl}/${streams}`;
    const batchId = symbols.slice(0, 3).join('-');

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        logger.info({ batchId, count: symbols.length }, 'WebSocket stream connected');
        this.setupHeartbeat(batchId, ws);
        resolve();
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const parsed = JSON.parse(data.toString()) as {
            s: string;
            p: string;
            q: string;
            T: number;
            m: boolean;
            t: number;
          };

          const trade: StreamTradeEvent = {
            symbol: parsed.s.replace('USDT', ''),
            price: parseFloat(parsed.p),
            quantity: parseFloat(parsed.q),
            timestamp: parsed.T,
            isBuyerMaker: parsed.m,
            tradeId: parsed.t,
          };

          this.bufferTrade(trade);
        } catch {
          // skip malformed messages
        }
      });

      ws.on('error', (err) => {
        logger.error({ batchId, error: err.message }, 'WebSocket error');
        reject(err);
      });

      ws.on('close', () => {
        logger.warn({ batchId }, 'WebSocket disconnected');
        this.clearHeartbeat(batchId);

        if (this.isRunning) {
          setTimeout(() => {
            logger.info({ batchId }, 'Reconnecting stream...');
            this.connectBatch(symbols).catch(() => {
              logger.error({ batchId }, 'Reconnection failed');
            });
          }, this.config.reconnectIntervalMs);
        }
      });

      this.connections.set(batchId, ws);
    });
  }

  /**
   * Buffer incoming trade for batch processing.
   */
  private bufferTrade(trade: StreamTradeEvent): void {
    const buffer = this.tradeBuffers.get(trade.symbol) || [];
    buffer.push(trade);

    // Keep buffer capped at 1000 trades per symbol
    if (buffer.length > 1000) {
      buffer.splice(0, buffer.length - 1000);
    }

    this.tradeBuffers.set(trade.symbol, buffer);
  }

  /**
   * Process buffered trades for a symbol — runs aggregation logic
   * that would normally be in a Worker Thread.
   */
  processBufferedTrades(symbol: string): WorkerProcessResult {
    const trades = this.tradeBuffers.get(symbol) || [];
    const aggregated = this.aggregateTrades(trades);
    const volumeProfile = this.buildVolumeProfile(trades);
    const orderBook = this.orderBooks.get(symbol);

    const result: WorkerProcessResult = {
      symbol,
      aggregatedTrades: aggregated,
      orderBookImbalance: orderBook?.imbalanceRatio ?? 0,
      volumeProfile,
      processedAt: Date.now(),
    };

    // Clear buffer after processing
    this.tradeBuffers.set(symbol, []);

    return result;
  }

  /**
   * Aggregate raw trades into buy/sell volume, VWAP, etc.
   */
  private aggregateTrades(trades: StreamTradeEvent[]): AggregatedTradeData {
    if (trades.length === 0) {
      return {
        buyVolume: 0,
        sellVolume: 0,
        netDelta: 0,
        tradeCount: 0,
        avgTradeSize: 0,
        largeTradeCount: 0,
        vwap: 0,
      };
    }

    let buyVolume = 0;
    let sellVolume = 0;
    let totalValueTraded = 0;
    let totalQuantity = 0;
    let largeTradeCount = 0;

    const avgSize = trades.reduce((s, t) => s + t.quantity * t.price, 0) / trades.length;
    const largeThreshold = avgSize * 5;

    for (const trade of trades) {
      const value = trade.price * trade.quantity;

      if (trade.isBuyerMaker) {
        sellVolume += value;
      } else {
        buyVolume += value;
      }

      totalValueTraded += value;
      totalQuantity += trade.quantity;

      if (value > largeThreshold) {
        largeTradeCount++;
      }
    }

    const vwap = totalQuantity > 0 ? totalValueTraded / totalQuantity : 0;

    return {
      buyVolume,
      sellVolume,
      netDelta: buyVolume - sellVolume,
      tradeCount: trades.length,
      avgTradeSize: totalValueTraded / trades.length,
      largeTradeCount,
      vwap,
    };
  }

  /**
   * Build a volume profile from trade data.
   * Identifies high/low volume nodes and Point of Control.
   */
  private buildVolumeProfile(trades: StreamTradeEvent[]): VolumeProfile {
    if (trades.length === 0) {
      return {
        highVolumeNodes: [],
        lowVolumeNodes: [],
        pointOfControl: 0,
        valueAreaHigh: 0,
        valueAreaLow: 0,
      };
    }

    const prices = trades.map((t) => t.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;

    if (range === 0) {
      return {
        highVolumeNodes: [minPrice],
        lowVolumeNodes: [],
        pointOfControl: minPrice,
        valueAreaHigh: minPrice,
        valueAreaLow: minPrice,
      };
    }

    // Create 20 price bins
    const numBins = 20;
    const binSize = range / numBins;
    const bins: number[] = new Array(numBins).fill(0);

    for (const trade of trades) {
      const binIndex = Math.min(
        numBins - 1,
        Math.floor((trade.price - minPrice) / binSize),
      );
      bins[binIndex] += trade.quantity * trade.price;
    }

    // Find Point of Control (highest volume bin)
    let pocIndex = 0;
    let maxVolume = 0;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] > maxVolume) {
        maxVolume = bins[i];
        pocIndex = i;
      }
    }

    const totalVolume = bins.reduce((a, b) => a + b, 0);
    const threshold = totalVolume * 0.05;

    const highVolumeNodes: number[] = [];
    const lowVolumeNodes: number[] = [];

    for (let i = 0; i < bins.length; i++) {
      const price = minPrice + (i + 0.5) * binSize;
      if (bins[i] > totalVolume * 0.1) {
        highVolumeNodes.push(Math.round(price * 10000) / 10000);
      } else if (bins[i] < threshold) {
        lowVolumeNodes.push(Math.round(price * 10000) / 10000);
      }
    }

    // Value Area (70% of volume around POC)
    const valueAreaTarget = totalVolume * 0.7;
    let vaVolume = bins[pocIndex];
    let vaHigh = pocIndex;
    let vaLow = pocIndex;

    while (vaVolume < valueAreaTarget && (vaHigh < numBins - 1 || vaLow > 0)) {
      const above = vaHigh < numBins - 1 ? bins[vaHigh + 1] : 0;
      const below = vaLow > 0 ? bins[vaLow - 1] : 0;

      if (above >= below && vaHigh < numBins - 1) {
        vaHigh++;
        vaVolume += bins[vaHigh];
      } else if (vaLow > 0) {
        vaLow--;
        vaVolume += bins[vaLow];
      } else {
        break;
      }
    }

    return {
      highVolumeNodes,
      lowVolumeNodes,
      pointOfControl: Math.round((minPrice + (pocIndex + 0.5) * binSize) * 10000) / 10000,
      valueAreaHigh: Math.round((minPrice + (vaHigh + 1) * binSize) * 10000) / 10000,
      valueAreaLow: Math.round((minPrice + vaLow * binSize) * 10000) / 10000,
    };
  }

  /**
   * Fetch order book snapshot for a symbol via REST (for initial state).
   */
  async fetchOrderBookSnapshot(symbol: string, depth = 20): Promise<OrderBookSnapshot> {
    const { fetchWithBackoff } = await import('../../utils/fetcher');
    const baseUrl = process.env.BINANCE_BASE_URL || 'https://data-api.binance.vision/api/v3';

    const data = await fetchWithBackoff<{
      bids: [string, string][];
      asks: [string, string][];
    }>(
      `${baseUrl}/depth?symbol=${symbol}USDT&limit=${depth}`,
      { label: `binance/depth/${symbol}` },
    );

    const parseLevels = (levels: [string, string][]): PriceLevel[] =>
      levels.map(([price, qty]) => ({
        price: parseFloat(price),
        quantity: parseFloat(qty),
        totalUsd: parseFloat(price) * parseFloat(qty),
      }));

    const bids = parseLevels(data.bids);
    const asks = parseLevels(data.asks);

    const bidDepth = bids.reduce((s, l) => s + l.totalUsd, 0);
    const askDepth = asks.reduce((s, l) => s + l.totalUsd, 0);
    const totalDepth = bidDepth + askDepth;
    const imbalanceRatio = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0;

    const snapshot: OrderBookSnapshot = {
      symbol,
      bids,
      asks,
      timestamp: Date.now(),
      imbalanceRatio,
    };

    this.orderBooks.set(symbol, snapshot);
    return snapshot;
  }

  /**
   * Detect newly graduated tokens from Solana via Helius RPC.
   */
  async detectGraduatedTokens(): Promise<GraduatedToken[]> {
    if (!this.config.heliusRpcUrl) {
      return [];
    }

    try {
      const { fetchWithBackoff } = await import('../../utils/fetcher');
      const response = await fetchWithBackoff<{
        result: Array<{
          mint: string;
          symbol: string;
          name: string;
          timestamp: number;
        }>;
      }>(this.config.heliusRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: {
          jsonrpc: '2.0',
          id: 1,
          method: 'getRecentTokenGraduations',
          params: [{ limit: 50 }],
        },
        label: 'helius/graduated-tokens',
      });

      return (response.result || []).map((token) => ({
        mintAddress: token.mint,
        symbol: token.symbol || 'UNKNOWN',
        name: token.name || 'Unknown Token',
        graduatedAt: token.timestamp,
        initialLiquidity: 0,
        currentMarketCap: 0,
        source: 'helius' as const,
      }));
    } catch {
      logger.debug('Helius graduated token fetch failed');
      return [];
    }
  }

  /**
   * Get aggregated data for all buffered symbols.
   */
  processAllBuffers(): Map<string, WorkerProcessResult> {
    const results = new Map<string, WorkerProcessResult>();

    for (const symbol of this.tradeBuffers.keys()) {
      results.set(symbol, this.processBufferedTrades(symbol));
    }

    return results;
  }

  /**
   * Check if we have stream data for a given symbol.
   */
  hasStreamData(symbol: string): boolean {
    const buffer = this.tradeBuffers.get(symbol);
    return !!buffer && buffer.length > 0;
  }

  /**
   * Stop all WebSocket connections and clean up.
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;

    for (const [id, ws] of this.connections) {
      this.clearHeartbeat(id);
      ws.close();
    }

    this.connections.clear();
    this.tradeBuffers.clear();
    this.orderBooks.clear();

    logger.info('Stream ingestor shutdown complete');
  }

  private setupHeartbeat(id: string, ws: WebSocket): void {
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, this.config.heartbeatIntervalMs);
    this.heartbeatTimers.set(id, timer);
  }

  private clearHeartbeat(id: string): void {
    const timer = this.heartbeatTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(id);
    }
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
