/**
 * Z-Score Normalizer — Dynamic scoring via statistical normalization.
 *
 * Instead of static thresholds that become stale across market regimes,
 * this normalizer computes:
 *
 *   Score_norm = (X - mu) / sigma
 *
 * Where X is the current metric value, mu is the rolling mean,
 * and sigma is the rolling standard deviation.
 *
 * A score of 5/5 is only given when the metric is a true anomaly
 * (>2 sigma above the mean) relative to its recent history.
 */
export class ZScoreNormalizer {
  private window: number[];
  private maxWindowSize: number;

  constructor(maxWindowSize = 100) {
    this.window = [];
    this.maxWindowSize = maxWindowSize;
  }

  /** Add a new observation to the rolling window */
  push(value: number): void {
    this.window.push(value);
    if (this.window.length > this.maxWindowSize) {
      this.window.shift();
    }
  }

  /** Add an entire batch of observations */
  pushBatch(values: number[]): void {
    for (const v of values) {
      this.push(v);
    }
  }

  /** Compute mean of the current window */
  get mean(): number {
    if (this.window.length === 0) return 0;
    return this.window.reduce((a, b) => a + b, 0) / this.window.length;
  }

  /** Compute standard deviation of the current window */
  get stdDev(): number {
    if (this.window.length < 2) return 1;
    const m = this.mean;
    const variance = this.window.reduce((sum, v) => sum + (v - m) ** 2, 0) / this.window.length;
    return Math.sqrt(variance) || 1;
  }

  /** Number of observations in the window */
  get size(): number {
    return this.window.length;
  }

  /**
   * Compute the Z-Score for a given raw value.
   * Returns 0 when insufficient data (< 5 observations).
   */
  zScore(value: number): number {
    if (this.window.length < 5) return 0;
    return (value - this.mean) / this.stdDev;
  }

  /**
   * Convert a raw metric value to a normalized score in range [0, maxScore].
   *
   * Mapping (z-score -> score):
   *   z > 2.0  → maxScore     (true anomaly)
   *   z > 1.5  → 80% max
   *   z > 1.0  → 60% max
   *   z > 0.5  → 40% max
   *   z > 0.0  → 20% max
   *   z <= 0   → 0
   *
   * Falls back to the provided fallbackScore when data is insufficient.
   */
  normalize(value: number, maxScore: number, fallbackScore: number): number {
    if (this.window.length < 5) return fallbackScore;

    const z = this.zScore(value);

    if (z > 2.0) return maxScore;
    if (z > 1.5) return maxScore * 0.8;
    if (z > 1.0) return maxScore * 0.6;
    if (z > 0.5) return maxScore * 0.4;
    if (z > 0.0) return maxScore * 0.2;
    return 0;
  }
}

/**
 * Collection of normalizers for different scoring dimensions.
 * Maintains rolling statistics per metric so scores adapt dynamically.
 */
export class ScorerNormalizers {
  readonly volumeRatio: ZScoreNormalizer;
  readonly fdvMcRatio: ZScoreNormalizer;
  readonly momentum7d: ZScoreNormalizer;
  readonly momentum30d: ZScoreNormalizer;
  readonly dexActivity: ZScoreNormalizer;

  constructor(windowSize = 100) {
    this.volumeRatio = new ZScoreNormalizer(windowSize);
    this.fdvMcRatio = new ZScoreNormalizer(windowSize);
    this.momentum7d = new ZScoreNormalizer(windowSize);
    this.momentum30d = new ZScoreNormalizer(windowSize);
    this.dexActivity = new ZScoreNormalizer(windowSize);
  }
}
