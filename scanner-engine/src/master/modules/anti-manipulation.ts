import { CoinData, BinanceKline } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import {
  ManipulationGuardResult,
  ManipulationFlag,
} from '../types';

/**
 * Anti-Manipulation Guard Module
 *
 * Monitors Volume/Market Cap ratio anomalies to detect:
 *   - Wash Trading (artificial volume inflation)
 *   - Spoofing (fake order book depth)
 *   - Pump-and-Dump schemes
 *   - Circular Trading patterns
 *
 * If volume rises 500% but price stays flat, the system flags
 * this as Wash Trading and penalizes the coin's score.
 */
export class AntiManipulationGuard {
  private binance: BinanceAdapter;

  constructor() {
    this.binance = new BinanceAdapter();
  }

  /**
   * Analyze a coin for manipulation signals.
   */
  async analyze(coin: CoinData): Promise<ManipulationGuardResult> {
    const flags: ManipulationFlag[] = [];

    const volumeMcRatio = coin.marketCap > 0
      ? coin.volume24h / coin.marketCap
      : 0;

    // Fetch historical data for anomaly detection
    let volumeAnomalyScore = 0;
    let priceVolumeCorrelation = 0;

    try {
      const klines = await this.binance.fetchKlines(coin.symbol, '1d', 30);
      volumeAnomalyScore = this.detectVolumeAnomaly(klines);
      priceVolumeCorrelation = this.calculatePriceVolumeCorrelation(klines);

      // Check for pump-and-dump pattern
      const pumpDump = this.detectPumpAndDump(klines);
      if (pumpDump) flags.push(pumpDump);

    } catch {
      logger.debug({ symbol: coin.symbol }, 'Anti-manipulation kline fetch failed');
    }

    // Check wash trading indicators
    const washTrading = this.detectWashTrading(
      coin,
      volumeMcRatio,
      volumeAnomalyScore,
      priceVolumeCorrelation,
    );
    if (washTrading) flags.push(washTrading);

    // Check artificial volume
    const artificialVolume = this.detectArtificialVolume(coin, volumeMcRatio);
    if (artificialVolume) flags.push(artificialVolume);

    // Check circular trading via DEX/CEX ratio
    const circular = this.detectCircularTrading(coin);
    if (circular) flags.push(circular);

    // Calculate wash trading probability
    const washTradingProbability = this.calculateWashTradingProbability(
      volumeMcRatio,
      volumeAnomalyScore,
      priceVolumeCorrelation,
      flags,
    );

    const isManipulated = washTradingProbability > 0.6 || flags.some(
      (f) => f.severity === 'HIGH' || f.severity === 'CRITICAL',
    );

    // Calculate score adjustment (penalty)
    const adjustedScore = this.calculateScoreAdjustment(
      coin.alphaScore,
      washTradingProbability,
      flags,
    );

    return {
      symbol: coin.symbol,
      volumeMcRatio: Math.round(volumeMcRatio * 10000) / 10000,
      volumeAnomalyScore: Math.round(volumeAnomalyScore * 100) / 100,
      priceVolumeCorrelation: Math.round(priceVolumeCorrelation * 1000) / 1000,
      washTradingProbability: Math.round(washTradingProbability * 1000) / 1000,
      isManipulated,
      manipulationFlags: flags,
      adjustedScore: Math.round(adjustedScore * 100) / 100,
    };
  }

  /**
   * Detect volume anomalies by comparing recent volume to historical average.
   * Returns anomaly score (0 = normal, >3 = suspicious, >5 = highly anomalous).
   */
  private detectVolumeAnomaly(klines: BinanceKline[]): number {
    if (klines.length < 7) return 0;

    const volumes = klines.map((k) => parseFloat(k.quoteAssetVolume));
    const recentVolume = volumes[volumes.length - 1];

    // Calculate mean and std of historical volumes (excluding most recent)
    const historical = volumes.slice(0, -1);
    const mean = historical.reduce((a, b) => a + b, 0) / historical.length;
    const variance =
      historical.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      (historical.length - 1);
    const std = Math.sqrt(variance);

    if (std === 0) return 0;

    // Z-score of recent volume
    return (recentVolume - mean) / std;
  }

  /**
   * Calculate correlation between price change and volume change.
   * Low correlation + high volume = potential wash trading.
   */
  private calculatePriceVolumeCorrelation(klines: BinanceKline[]): number {
    if (klines.length < 5) return 0;

    const priceChanges: number[] = [];
    const volumeChanges: number[] = [];

    for (let i = 1; i < klines.length; i++) {
      const prevClose = parseFloat(klines[i - 1].close);
      const currClose = parseFloat(klines[i].close);
      const prevVol = parseFloat(klines[i - 1].quoteAssetVolume);
      const currVol = parseFloat(klines[i].quoteAssetVolume);

      if (prevClose > 0 && prevVol > 0) {
        priceChanges.push((currClose - prevClose) / prevClose);
        volumeChanges.push((currVol - prevVol) / prevVol);
      }
    }

    return this.pearsonCorrelation(priceChanges, volumeChanges);
  }

  /**
   * Detect wash trading signals.
   * Key indicator: very high volume but minimal price movement.
   */
  private detectWashTrading(
    coin: CoinData,
    volumeMcRatio: number,
    anomalyScore: number,
    priceVolumeCorrelation: number,
  ): ManipulationFlag | null {
    // Volume > 500% of typical AND price barely moved
    if (
      anomalyScore > 3 &&
      Math.abs(coin.priceChange24h) < 2 &&
      volumeMcRatio > 0.5
    ) {
      const severity = anomalyScore > 5 ? 'HIGH' : 'MEDIUM';
      const confidence = Math.min(0.95, 0.5 + anomalyScore * 0.08);

      return {
        type: 'WASH_TRADING',
        severity,
        evidence:
          `Volume anomaly score ${anomalyScore.toFixed(1)}σ above mean ` +
          `with only ${coin.priceChange24h.toFixed(1)}% price change. ` +
          `Volume/MC ratio: ${(volumeMcRatio * 100).toFixed(1)}%.`,
        confidence,
      };
    }

    // Low price-volume correlation with high volume
    if (
      Math.abs(priceVolumeCorrelation) < 0.1 &&
      volumeMcRatio > 0.3 &&
      anomalyScore > 2
    ) {
      return {
        type: 'WASH_TRADING',
        severity: 'MEDIUM',
        evidence:
          `Near-zero price-volume correlation (${priceVolumeCorrelation.toFixed(3)}) ` +
          `despite high volume/MC ratio (${(volumeMcRatio * 100).toFixed(1)}%).`,
        confidence: 0.6,
      };
    }

    return null;
  }

  /**
   * Detect artificial volume inflation.
   */
  private detectArtificialVolume(
    coin: CoinData,
    volumeMcRatio: number,
  ): ManipulationFlag | null {
    // Extremely high volume relative to market cap
    if (volumeMcRatio > 2.0) {
      return {
        type: 'ARTIFICIAL_VOLUME',
        severity: volumeMcRatio > 5 ? 'CRITICAL' : 'HIGH',
        evidence:
          `Volume/MC ratio of ${(volumeMcRatio * 100).toFixed(0)}% is ` +
          `abnormally high. Typical healthy range is 5-30%.`,
        confidence: Math.min(0.9, 0.4 + volumeMcRatio * 0.1),
      };
    }

    return null;
  }

  /**
   * Detect pump-and-dump patterns from price history.
   * Pattern: sharp price increase followed by sharp decline.
   */
  private detectPumpAndDump(klines: BinanceKline[]): ManipulationFlag | null {
    if (klines.length < 14) return null;

    const closes = klines.map((k) => parseFloat(k.close));

    // Look for 7-day pump followed by dump
    for (let i = 7; i < closes.length; i++) {
      const pumpStart = closes[i - 7];
      const pumpPeak = Math.max(...closes.slice(i - 7, i));
      const current = closes[i];

      const pumpPct = ((pumpPeak - pumpStart) / pumpStart) * 100;
      const dumpPct = ((pumpPeak - current) / pumpPeak) * 100;

      if (pumpPct > 100 && dumpPct > 50) {
        return {
          type: 'PUMP_AND_DUMP',
          severity: 'HIGH',
          evidence:
            `Price pumped ${pumpPct.toFixed(0)}% then dumped ${dumpPct.toFixed(0)}% ` +
            `within a 7-day window — classic pump-and-dump pattern.`,
          confidence: Math.min(0.85, 0.5 + (pumpPct / 500) + (dumpPct / 200)),
        };
      }
    }

    return null;
  }

  /**
   * Detect circular trading via unusual DEX/CEX volume distribution.
   */
  private detectCircularTrading(coin: CoinData): ManipulationFlag | null {
    if (!coin.dexVolume24h || coin.volume24h === 0) return null;

    const dexCexRatio = coin.dexVolume24h / coin.volume24h;

    // Suspiciously balanced DEX/CEX ratio with high volume
    if (
      Math.abs(dexCexRatio - 1.0) < 0.1 &&
      coin.volume24h > 5_000_000
    ) {
      return {
        type: 'CIRCULAR_TRADING',
        severity: 'MEDIUM',
        evidence:
          `DEX/CEX volume ratio is suspiciously balanced (${dexCexRatio.toFixed(2)}) ` +
          `which may indicate circular trading between venues.`,
        confidence: 0.45,
      };
    }

    return null;
  }

  /**
   * Calculate overall wash trading probability.
   */
  private calculateWashTradingProbability(
    volumeMcRatio: number,
    anomalyScore: number,
    correlation: number,
    flags: ManipulationFlag[],
  ): number {
    let probability = 0;

    // Volume anomaly contribution
    if (anomalyScore > 3) probability += 0.2;
    if (anomalyScore > 5) probability += 0.15;

    // Volume/MC ratio contribution
    if (volumeMcRatio > 1) probability += 0.2;
    if (volumeMcRatio > 2) probability += 0.15;

    // Low correlation contribution
    if (Math.abs(correlation) < 0.1 && volumeMcRatio > 0.3) probability += 0.15;

    // Existing flags contribution
    for (const flag of flags) {
      if (flag.severity === 'CRITICAL') probability += 0.2;
      else if (flag.severity === 'HIGH') probability += 0.15;
      else if (flag.severity === 'MEDIUM') probability += 0.1;
    }

    return Math.min(1, probability);
  }

  /**
   * Calculate score adjustment (penalty) based on manipulation findings.
   */
  private calculateScoreAdjustment(
    originalScore: number,
    washTradingProbability: number,
    flags: ManipulationFlag[],
  ): number {
    let penalty = 0;

    // Wash trading probability penalty
    if (washTradingProbability > 0.8) penalty += originalScore * 0.5;
    else if (washTradingProbability > 0.6) penalty += originalScore * 0.3;
    else if (washTradingProbability > 0.4) penalty += originalScore * 0.15;

    // Per-flag penalties
    for (const flag of flags) {
      if (flag.severity === 'CRITICAL') penalty += 3;
      else if (flag.severity === 'HIGH') penalty += 2;
      else if (flag.severity === 'MEDIUM') penalty += 1;
    }

    return Math.max(0, originalScore - penalty);
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
   * Batch analyze multiple coins.
   */
  async analyzeBatch(
    coins: CoinData[],
  ): Promise<Map<string, ManipulationGuardResult>> {
    const results = new Map<string, ManipulationGuardResult>();

    for (const coin of coins) {
      try {
        const result = await this.analyze(coin);
        results.set(coin.symbol, result);
      } catch {
        logger.debug({ symbol: coin.symbol }, 'Anti-manipulation analysis failed');
      }
    }

    return results;
  }
}
