import { describe, it, expect } from 'vitest';
import { ZScoreNormalizer, ScorerNormalizers } from '../core/z-score-normalizer';

describe('ZScoreNormalizer', () => {
  describe('push / size', () => {
    it('should track window size', () => {
      const n = new ZScoreNormalizer(5);
      expect(n.size).toBe(0);
      n.push(1);
      n.push(2);
      expect(n.size).toBe(2);
    });

    it('should evict oldest values when window is full', () => {
      const n = new ZScoreNormalizer(3);
      n.pushBatch([10, 20, 30]);
      expect(n.size).toBe(3);
      n.push(40);
      expect(n.size).toBe(3);
      expect(n.mean).toBeCloseTo(30, 1);
    });
  });

  describe('mean', () => {
    it('should return 0 for empty window', () => {
      const n = new ZScoreNormalizer();
      expect(n.mean).toBe(0);
    });

    it('should compute correct mean', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([2, 4, 6, 8, 10]);
      expect(n.mean).toBeCloseTo(6, 5);
    });
  });

  describe('stdDev', () => {
    it('should return 1 for fewer than 2 values (safe default)', () => {
      const n = new ZScoreNormalizer();
      expect(n.stdDev).toBe(1);
      n.push(5);
      expect(n.stdDev).toBe(1);
    });

    it('should compute correct standard deviation', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(n.stdDev).toBeCloseTo(2, 0);
    });
  });

  describe('zScore()', () => {
    it('should return 0 when insufficient data (< 5)', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([1, 2, 3, 4]);
      expect(n.zScore(10)).toBe(0);
    });

    it('should compute positive z-score for above-mean values', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
      expect(n.zScore(15)).toBeGreaterThan(0);
    });

    it('should compute negative z-score for below-mean values', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
      expect(n.zScore(5)).toBeLessThan(0);
    });

    it('should return 0 z-score for the mean value', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([5, 10, 15, 20, 25]);
      expect(n.zScore(n.mean)).toBeCloseTo(0, 5);
    });
  });

  describe('normalize()', () => {
    it('should return fallback when data is insufficient', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([1, 2, 3]);
      expect(n.normalize(100, 5, 3)).toBe(3);
    });

    it('should return maxScore for extreme outliers (z > 2)', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
      // stdDev ≈ 0, so any value != mean gives large z
      // but stdDev won't be 0 because we guard against it
      // Let's use varied data:
      const n2 = new ZScoreNormalizer();
      n2.pushBatch([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      // mean ≈ 5.5, stdDev ≈ 2.87
      // z(12) = (12-5.5)/2.87 ≈ 2.26 → maxScore
      expect(n2.normalize(12, 5, 0)).toBe(5);
    });

    it('should return 0 for values below the mean', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      // mean = 55, z(30) < 0
      expect(n.normalize(30, 5, 0)).toBe(0);
    });

    it('should give middle scores for moderate z-values', () => {
      const n = new ZScoreNormalizer();
      n.pushBatch([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      // mean=5.5, stdDev≈2.87
      // z(7) = (7-5.5)/2.87 ≈ 0.52 → 40% of max
      const score = n.normalize(7, 5, 0);
      expect(score).toBe(2); // 5 * 0.4 = 2
    });
  });
});

describe('ScorerNormalizers', () => {
  it('should create separate normalizers for each metric', () => {
    const normalizers = new ScorerNormalizers(50);
    expect(normalizers.volumeRatio).toBeInstanceOf(ZScoreNormalizer);
    expect(normalizers.fdvMcRatio).toBeInstanceOf(ZScoreNormalizer);
    expect(normalizers.momentum7d).toBeInstanceOf(ZScoreNormalizer);
    expect(normalizers.momentum30d).toBeInstanceOf(ZScoreNormalizer);
    expect(normalizers.dexActivity).toBeInstanceOf(ZScoreNormalizer);
  });
});
