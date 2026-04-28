import { CoinData, BinanceKline } from '../../types';
import { BinanceAdapter } from '../../adapters/binance';
import { logger } from '../../utils/logger';
import { CircuitBreaker } from '../utils/circuit-breaker';
import {
  ManipulationGuardResult,
  ManipulationFlag,
  BenfordsLawResult,
  SpreadVarianceResult,
  HighFreqVolumeSpike,
} from '../types';

// Benford's Law expected first-digit distribution (digits 1-9)
const BENFORD_EXPECTED = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];

/**
 * Anti-Manipulation Guard Module (Enhanced)
 *
 * Reference: ccxt/ccxt (Data Sanitization) & jure87/wash-trading-detection
 *
 * Detection methods:
 *   1. Benford's Law — statistical test on leading digits of trade volumes
 *   2. Spread Variance Analysis — abnormal bid-ask spread patterns
 *   3. High-frequency volume spike detection (>300% in 1m = suspected wash)
 *   4. Price-Volume correlation analysis
 *   5. Pump-and-Dump pattern recognition
 *   6. Circular trading detection via DEX/CEX ratio
 */
export class AntiManipulationGuard {
  private binance: BinanceAdapter;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.binance = new BinanceAdapter();
    this.circuitBreaker = new CircuitBreaker({
      name: 'anti-manipulation',
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    });
  }

  /**
   * Run full manipulation analysis with Benford's Law and spread variance.
   */
  async analyze(coin: CoinData): Promise<ManipulationGuardResult> {
    const flags: ManipulationFlag[] = [];

    const volumeMcRatio = coin.marketCap > 0
      ? coin.volume24h / coin.marketCap
      : 0;

    let volumeAnomalyScore = 0;
    let priceVolumeCorrelation = 0;
    let benfordsResult: BenfordsLawResult | null = null;
    let spreadResult: SpreadVarianceResult | null = null;
    let highFreqSpikes: HighFreqVolumeSpike[] = [];

    try {
      await this.circuitBreaker.execute(async () => {
        // Fetch daily klines for overall analysis
        const klines = await this.binance.fetchKlines(coin.symbol, '1d', 30);
        volumeAnomalyScore = this.detectVolumeAnomaly(klines);
        priceVolumeCorrelation = this.calculatePriceVolumeCorrelation(klines);

        const pumpDump = this.detectPumpAndDump(klines);
        if (pumpDump) flags.push(pumpDump);

        // Benford's Law analysis on trade volumes
        const volumes = klines.map((k) => parseFloat(k.quoteAssetVolume));
        benfordsResult = this.benfordsLawTest(volumes);
        if (benfordsResult.isSuspicious) {
          flags.push({
            type: 'WASH_TRADING',
            severity: 'HIGH',
            evidence:
              `Benford's Law violation: χ² = ${benfordsResult.chiSquared.toFixed(2)}, ` +
              `p-value = ${benfordsResult.pValue.toFixed(4)}. Volume digit distribution ` +
              `deviates significantly from natural patterns.`,
            confidence: Math.min(0.95, 0.6 + benfordsResult.chiSquared / 100),
          });
        }

        // Spread variance analysis
        spreadResult = this.analyzeSpreadVariance(klines);
        if (spreadResult.isAnomalous) {
          flags.push({
            type: 'SPOOFING',
            severity: spreadResult.spreadAnomalyScore > 5 ? 'HIGH' : 'MEDIUM',
            evidence:
              `Abnormal spread variance detected: σ² = ${spreadResult.spreadVariance.toFixed(4)}, ` +
              `anomaly score = ${spreadResult.spreadAnomalyScore.toFixed(2)}σ.`,
            confidence: Math.min(0.85, 0.4 + spreadResult.spreadAnomalyScore * 0.08),
          });
        }

        // High-frequency 1-minute volume spike detection
        try {
          const klines1m = await this.binance.fetchKlines(coin.symbol, '1m', 60);
          highFreqSpikes = this.detectHighFreqVolumeSpikes(klines1m, 300);
          for (const spike of highFreqSpikes) {
            if (spike.isSuspected) {
              flags.push({
                type: 'WASH_TRADING',
                severity: spike.volumeChange > 500 ? 'CRITICAL' : 'HIGH',
                evidence:
                  `1m volume spike of ${spike.volumeChange.toFixed(0)}% with only ` +
                  `${Math.abs(spike.priceChange).toFixed(2)}% price change — ` +
                  `suspected wash trading at ${new Date(spike.timestamp).toISOString()}.`,
                confidence: Math.min(0.95, 0.5 + spike.volumeChange / 1000),
              });
            }
          }
        } catch {
          logger.debug({ symbol: coin.symbol }, '1m kline fetch failed for HF analysis');
        }
      });
    } catch {
      logger.debug({ symbol: coin.symbol }, 'Anti-manipulation analysis failed (circuit breaker)');
    }

    // Standard wash trading and artificial volume checks
    const washTrading = this.detectWashTrading(
      coin, volumeMcRatio, volumeAnomalyScore, priceVolumeCorrelation,
    );
    if (washTrading) flags.push(washTrading);

    const artificialVolume = this.detectArtificialVolume(coin, volumeMcRatio);
    if (artificialVolume) flags.push(artificialVolume);

    const circular = this.detectCircularTrading(coin);
    if (circular) flags.push(circular);

    const washTradingProbability = this.calculateWashTradingProbability(
      volumeMcRatio, volumeAnomalyScore, priceVolumeCorrelation, flags,
      benfordsResult, spreadResult, highFreqSpikes,
    );

    const isManipulated = washTradingProbability > 0.6 || flags.some(
      (f) => f.severity === 'HIGH' || f.severity === 'CRITICAL',
    );

    const adjustedScore = this.calculateScoreAdjustment(
      coin.alphaScore, washTradingProbability, flags,
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
   * Benford's Law test on trade volumes.
   *
   * Natural trading data follows Benford's distribution for leading digits.
   * Wash trading often produces artificial volumes that violate this law.
   * Uses chi-squared test against the expected Benford distribution.
   */
  private benfordsLawTest(values: number[]): BenfordsLawResult {
    const positiveValues = values.filter((v) => v > 0);
    if (positiveValues.length < 10) {
      return {
        chiSquared: 0,
        pValue: 1,
        isSuspicious: false,
        observedDistribution: new Array(9).fill(0),
        expectedDistribution: [...BENFORD_EXPECTED],
      };
    }

    // Count leading digits
    const digitCounts = new Array(9).fill(0);
    for (const value of positiveValues) {
      const leadingDigit = parseInt(value.toExponential().charAt(0), 10);
      if (leadingDigit >= 1 && leadingDigit <= 9) {
        digitCounts[leadingDigit - 1]++;
      }
    }

    // Convert to proportions
    const n = positiveValues.length;
    const observedDistribution = digitCounts.map((c) => c / n);

    // Chi-squared statistic
    let chiSquared = 0;
    for (let i = 0; i < 9; i++) {
      const expected = BENFORD_EXPECTED[i] * n;
      const observed = digitCounts[i];
      if (expected > 0) {
        chiSquared += Math.pow(observed - expected, 2) / expected;
      }
    }

    // Approximate p-value using chi-squared distribution (8 degrees of freedom)
    const pValue = this.chiSquaredPValue(chiSquared, 8);

    return {
      chiSquared: Math.round(chiSquared * 100) / 100,
      pValue: Math.round(pValue * 10000) / 10000,
      isSuspicious: pValue < 0.05,
      observedDistribution: observedDistribution.map((v) => Math.round(v * 1000) / 1000),
      expectedDistribution: [...BENFORD_EXPECTED],
    };
  }

  /**
   * Approximate chi-squared p-value using the regularized incomplete gamma function.
   */
  private chiSquaredPValue(x: number, k: number): number {
    if (x <= 0) return 1;
    const halfK = k / 2;
    const halfX = x / 2;

    // Use Wilson-Hilferty approximation
    const z = Math.pow(halfX / halfK, 1 / 3) - (1 - 2 / (9 * halfK));
    const denom = Math.sqrt(2 / (9 * halfK));

    if (denom === 0) return 0;

    const standardNormal = z / denom;
    // Approximate standard normal CDF
    return 1 - this.normalCDF(standardNormal);
  }

  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327;
    const p =
      d *
      Math.exp((-x * x) / 2) *
      (t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))));
    return x > 0 ? 1 - p : p;
  }

  /**
   * Analyze bid-ask spread variance.
   * Abnormally low or high spread variance indicates spoofing or manipulation.
   */
  private analyzeSpreadVariance(klines: BinanceKline[]): SpreadVarianceResult {
    if (klines.length < 5) {
      return { meanSpread: 0, spreadVariance: 0, spreadAnomalyScore: 0, isAnomalous: false };
    }

    // Approximate spread from high-low relative to close
    const spreads = klines.map((k) => {
      const high = parseFloat(k.high);
      const low = parseFloat(k.low);
      const close = parseFloat(k.close);
      return close > 0 ? (high - low) / close : 0;
    });

    const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const variance = spreads.reduce(
      (sum, s) => sum + Math.pow(s - meanSpread, 2), 0,
    ) / (spreads.length - 1);
    const std = Math.sqrt(variance);

    // Check if recent spread is anomalous
    const recentSpread = spreads[spreads.length - 1];
    const anomalyScore = std > 0 ? Math.abs(recentSpread - meanSpread) / std : 0;

    return {
      meanSpread: Math.round(meanSpread * 100000) / 100000,
      spreadVariance: Math.round(variance * 100000) / 100000,
      spreadAnomalyScore: Math.round(anomalyScore * 100) / 100,
      isAnomalous: anomalyScore > 3,
    };
  }

  /**
   * Detect high-frequency volume spikes in 1-minute data.
   * If volume increases >threshold% without significant price change,
   * flag as suspected wash trading.
   */
  private detectHighFreqVolumeSpikes(
    klines1m: BinanceKline[],
    thresholdPct: number,
  ): HighFreqVolumeSpike[] {
    const spikes: HighFreqVolumeSpike[] = [];

    if (klines1m.length < 10) return spikes;

    // Calculate rolling average volume (10-period)
    for (let i = 10; i < klines1m.length; i++) {
      const windowVolumes = klines1m
        .slice(i - 10, i)
        .map((k) => parseFloat(k.quoteAssetVolume));
      const avgVolume = windowVolumes.reduce((a, b) => a + b, 0) / windowVolumes.length;

      if (avgVolume === 0) continue;

      const currentVolume = parseFloat(klines1m[i].quoteAssetVolume);
      const volumeChangePct = ((currentVolume - avgVolume) / avgVolume) * 100;

      const prevClose = parseFloat(klines1m[i - 1].close);
      const currClose = parseFloat(klines1m[i].close);
      const priceChangePct = prevClose > 0
        ? ((currClose - prevClose) / prevClose) * 100
        : 0;

      const isSuspected =
        volumeChangePct > thresholdPct && Math.abs(priceChangePct) < 1;

      if (volumeChangePct > thresholdPct) {
        spikes.push({
          timestamp: klines1m[i].openTime,
          volumeChange: Math.round(volumeChangePct * 100) / 100,
          priceChange: Math.round(priceChangePct * 100) / 100,
          isSuspected,
          timeframeMinutes: 1,
        });
      }
    }

    return spikes;
  }

  private detectVolumeAnomaly(klines: BinanceKline[]): number {
    if (klines.length < 7) return 0;
    const volumes = klines.map((k) => parseFloat(k.quoteAssetVolume));
    const recentVolume = volumes[volumes.length - 1];
    const historical = volumes.slice(0, -1);
    const mean = historical.reduce((a, b) => a + b, 0) / historical.length;
    const variance = historical.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (historical.length - 1);
    const std = Math.sqrt(variance);
    if (std === 0) return 0;
    return (recentVolume - mean) / std;
  }

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

  private detectWashTrading(
    coin: CoinData, volumeMcRatio: number, anomalyScore: number, correlation: number,
  ): ManipulationFlag | null {
    if (anomalyScore > 3 && Math.abs(coin.priceChange24h) < 2 && volumeMcRatio > 0.5) {
      return {
        type: 'WASH_TRADING',
        severity: anomalyScore > 5 ? 'HIGH' : 'MEDIUM',
        evidence: `Volume anomaly ${anomalyScore.toFixed(1)}σ with ${coin.priceChange24h.toFixed(1)}% price change. V/MC: ${(volumeMcRatio * 100).toFixed(1)}%.`,
        confidence: Math.min(0.95, 0.5 + anomalyScore * 0.08),
      };
    }
    if (Math.abs(correlation) < 0.1 && volumeMcRatio > 0.3 && anomalyScore > 2) {
      return {
        type: 'WASH_TRADING',
        severity: 'MEDIUM',
        evidence: `Near-zero price-volume correlation (${correlation.toFixed(3)}) with high V/MC (${(volumeMcRatio * 100).toFixed(1)}%).`,
        confidence: 0.6,
      };
    }
    return null;
  }

  private detectArtificialVolume(coin: CoinData, volumeMcRatio: number): ManipulationFlag | null {
    if (volumeMcRatio > 2.0) {
      return {
        type: 'ARTIFICIAL_VOLUME',
        severity: volumeMcRatio > 5 ? 'CRITICAL' : 'HIGH',
        evidence: `V/MC ratio ${(volumeMcRatio * 100).toFixed(0)}% (healthy: 5-30%).`,
        confidence: Math.min(0.9, 0.4 + volumeMcRatio * 0.1),
      };
    }
    return null;
  }

  private detectPumpAndDump(klines: BinanceKline[]): ManipulationFlag | null {
    if (klines.length < 14) return null;
    const closes = klines.map((k) => parseFloat(k.close));
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
          evidence: `Pumped ${pumpPct.toFixed(0)}% then dumped ${dumpPct.toFixed(0)}% within 7 days.`,
          confidence: Math.min(0.85, 0.5 + pumpPct / 500 + dumpPct / 200),
        };
      }
    }
    return null;
  }

  private detectCircularTrading(coin: CoinData): ManipulationFlag | null {
    if (!coin.dexVolume24h || coin.volume24h === 0) return null;
    const dexCexRatio = coin.dexVolume24h / coin.volume24h;
    if (Math.abs(dexCexRatio - 1.0) < 0.1 && coin.volume24h > 5_000_000) {
      return {
        type: 'CIRCULAR_TRADING',
        severity: 'MEDIUM',
        evidence: `DEX/CEX ratio ${dexCexRatio.toFixed(2)} — suspiciously balanced.`,
        confidence: 0.45,
      };
    }
    return null;
  }

  private calculateWashTradingProbability(
    volumeMcRatio: number, anomalyScore: number, correlation: number,
    flags: ManipulationFlag[],
    benfords: BenfordsLawResult | null,
    spread: SpreadVarianceResult | null,
    hfSpikes: HighFreqVolumeSpike[],
  ): number {
    let probability = 0;
    if (anomalyScore > 3) probability += 0.15;
    if (anomalyScore > 5) probability += 0.1;
    if (volumeMcRatio > 1) probability += 0.15;
    if (volumeMcRatio > 2) probability += 0.1;
    if (Math.abs(correlation) < 0.1 && volumeMcRatio > 0.3) probability += 0.1;

    // Benford's Law contribution
    if (benfords && benfords.isSuspicious) probability += 0.2;

    // Spread variance contribution
    if (spread && spread.isAnomalous) probability += 0.1;

    // High-frequency spikes contribution
    const suspectedSpikes = hfSpikes.filter((s) => s.isSuspected);
    if (suspectedSpikes.length > 0) probability += Math.min(0.2, suspectedSpikes.length * 0.05);

    // Only count flags not already accounted for by dedicated parameters above
    // (Benford's → WASH_TRADING with "Benford's", spread → SPOOFING, HF spikes → WASH_TRADING with "1m volume")
    const alreadyCounted = new Set(['SPOOFING']);
    for (const flag of flags) {
      if (alreadyCounted.has(flag.type)) continue;
      if (flag.evidence.includes("Benford's Law")) continue;
      if (flag.evidence.includes('1m volume spike')) continue;
      if (flag.severity === 'CRITICAL') probability += 0.15;
      else if (flag.severity === 'HIGH') probability += 0.1;
      else if (flag.severity === 'MEDIUM') probability += 0.05;
    }
    return Math.min(1, probability);
  }

  private calculateScoreAdjustment(
    originalScore: number, washProb: number, flags: ManipulationFlag[],
  ): number {
    let penalty = 0;
    if (washProb > 0.8) penalty += originalScore * 0.5;
    else if (washProb > 0.6) penalty += originalScore * 0.3;
    else if (washProb > 0.4) penalty += originalScore * 0.15;
    for (const flag of flags) {
      if (flag.severity === 'CRITICAL') penalty += 3;
      else if (flag.severity === 'HIGH') penalty += 2;
      else if (flag.severity === 'MEDIUM') penalty += 1;
    }
    return Math.max(0, originalScore - penalty);
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

  async analyzeBatch(coins: CoinData[]): Promise<Map<string, ManipulationGuardResult>> {
    const results = new Map<string, ManipulationGuardResult>();
    for (const coin of coins) {
      try {
        results.set(coin.symbol, await this.analyze(coin));
      } catch {
        logger.debug({ symbol: coin.symbol }, 'Anti-manipulation failed');
      }
    }
    return results;
  }
}
