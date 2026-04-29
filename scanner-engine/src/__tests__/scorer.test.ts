import { describe, it, expect } from 'vitest';
import { AlphaScorer } from '../core/scorer';
import { CoinData } from '../types';

function makeCoin(overrides: Partial<CoinData> = {}): CoinData {
  return {
    id: 'test',
    symbol: 'TEST',
    name: 'Test Coin',
    binancePair: 'TESTUSDT',
    chain: null,
    price: 1.0,
    marketCap: 50_000_000,
    fullyDilutedValuation: 60_000_000,
    volume24h: 5_000_000,
    fdvMcRatio: 1.2,
    circulatingSupply: 50_000_000,
    totalSupply: 60_000_000,
    maxSupply: 100_000_000,
    priceChange24h: 5,
    priceChange7d: 10,
    priceChange30d: 30,
    dexLiquidity: 500_000,
    dexVolume24h: 1_000_000,
    dexTxns24h: 2000,
    sector: 'DeFi',
    categories: ['DeFi'],
    alphaScore: 0,
    scoreBreakdown: { liquidity: 0, tokenomics: 0, marketCap: 0, momentum: 0, onChain: 0 },
    dataSources: ['binance'],
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe('AlphaScorer', () => {
  const scorer = new AlphaScorer();

  describe('calculate()', () => {
    it('should return a score and breakdown for a valid coin', () => {
      const coin = makeCoin();
      const result = scorer.calculate(coin);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(25);
      expect(result.breakdown).toHaveProperty('liquidity');
      expect(result.breakdown).toHaveProperty('tokenomics');
      expect(result.breakdown).toHaveProperty('marketCap');
      expect(result.breakdown).toHaveProperty('momentum');
      expect(result.breakdown).toHaveProperty('onChain');
    });

    it('should sum breakdown components to the total score', () => {
      const coin = makeCoin();
      const { score, breakdown } = scorer.calculate(coin);

      const summed =
        breakdown.liquidity +
        breakdown.tokenomics +
        breakdown.marketCap +
        breakdown.momentum +
        breakdown.onChain;

      expect(score).toBeCloseTo(summed, 5);
    });
  });

  describe('scoreLiquidity()', () => {
    it('should score 0 when volume ratio is near zero', () => {
      const coin = makeCoin({ volume24h: 100, marketCap: 100_000_000, dexLiquidity: null });
      const score = scorer.scoreLiquidity(coin);
      expect(score).toBe(0);
    });

    it('should give higher score for higher volume/mc ratio', () => {
      const low = makeCoin({ volume24h: 600_000, marketCap: 100_000_000, dexLiquidity: null });
      const high = makeCoin({ volume24h: 60_000_000, marketCap: 100_000_000, dexLiquidity: null });

      expect(scorer.scoreLiquidity(high)).toBeGreaterThan(scorer.scoreLiquidity(low));
    });

    it('should add bonus for DEX liquidity', () => {
      const noDex = makeCoin({ volume24h: 5_000_000, marketCap: 50_000_000, dexLiquidity: null });
      const withDex = makeCoin({ volume24h: 5_000_000, marketCap: 50_000_000, dexLiquidity: 2_000_000 });

      expect(scorer.scoreLiquidity(withDex)).toBeGreaterThan(scorer.scoreLiquidity(noDex));
    });

    it('should cap at 5', () => {
      const coin = makeCoin({ volume24h: 500_000_000, marketCap: 10_000_000, dexLiquidity: 5_000_000 });
      expect(scorer.scoreLiquidity(coin)).toBeLessThanOrEqual(5);
    });
  });

  describe('scoreTokenomics()', () => {
    it('should give 5 for very low FDV/MC ratio', () => {
      const coin = makeCoin({ fdvMcRatio: 1.05 });
      expect(scorer.scoreTokenomics(coin)).toBe(5);
    });

    it('should give 4 for FDV/MC 1.2-1.5', () => {
      const coin = makeCoin({ fdvMcRatio: 1.3 });
      expect(scorer.scoreTokenomics(coin)).toBe(4);
    });

    it('should give 3 for FDV/MC 1.5-2.0', () => {
      const coin = makeCoin({ fdvMcRatio: 1.7 });
      expect(scorer.scoreTokenomics(coin)).toBe(3);
    });

    it('should give 0 for FDV/MC >= 5.0', () => {
      const coin = makeCoin({ fdvMcRatio: 6.0, maxSupply: null });
      expect(scorer.scoreTokenomics(coin)).toBe(0);
    });

    it('should add 0.5 bonus for high circulating ratio', () => {
      const noBonus = makeCoin({ fdvMcRatio: 1.3, circulatingSupply: 30_000_000, maxSupply: 100_000_000 });
      const withBonus = makeCoin({ fdvMcRatio: 1.3, circulatingSupply: 80_000_000, maxSupply: 100_000_000 });

      expect(scorer.scoreTokenomics(withBonus)).toBe(4.5);
      expect(scorer.scoreTokenomics(noBonus)).toBe(4);
    });
  });

  describe('scoreMarketCap()', () => {
    it('should give 5 for micro-cap < 20M', () => {
      expect(scorer.scoreMarketCap(makeCoin({ marketCap: 15_000_000 }))).toBe(5);
    });

    it('should give 4 for 20-50M', () => {
      expect(scorer.scoreMarketCap(makeCoin({ marketCap: 35_000_000 }))).toBe(4);
    });

    it('should give 0 for >= 500M', () => {
      expect(scorer.scoreMarketCap(makeCoin({ marketCap: 1_000_000_000 }))).toBe(0);
    });

    it('should give 0 for zero/negative market cap', () => {
      expect(scorer.scoreMarketCap(makeCoin({ marketCap: 0 }))).toBe(0);
      expect(scorer.scoreMarketCap(makeCoin({ marketCap: -100 }))).toBe(0);
    });
  });

  describe('scoreMomentum()', () => {
    it('should give 5 for strong momentum (7d>20, 30d>50)', () => {
      const coin = makeCoin({ priceChange7d: 25, priceChange30d: 60 });
      expect(scorer.scoreMomentum(coin)).toBe(5);
    });

    it('should give 1 for slight decline but > -10% 7d', () => {
      const coin = makeCoin({ priceChange7d: -5, priceChange30d: -20 });
      expect(scorer.scoreMomentum(coin)).toBe(1);
    });

    it('should give 0 for heavy crash (7d < -10%)', () => {
      const coin = makeCoin({ priceChange7d: -15, priceChange30d: -40 });
      expect(scorer.scoreMomentum(coin)).toBe(0);
    });
  });

  describe('scoreOnChain()', () => {
    it('should give 0 when no DEX data', () => {
      const coin = makeCoin({ dexTxns24h: null, dexVolume24h: null, dexLiquidity: null });
      expect(scorer.scoreOnChain(coin)).toBe(0);
    });

    it('should reward high DEX activity', () => {
      const low = makeCoin({ dexTxns24h: 50, dexVolume24h: null, dexLiquidity: null });
      const high = makeCoin({ dexTxns24h: 10_000, dexVolume24h: null, dexLiquidity: null });

      expect(scorer.scoreOnChain(high)).toBeGreaterThan(scorer.scoreOnChain(low));
    });

    it('should cap at 5', () => {
      const coin = makeCoin({
        dexTxns24h: 50_000,
        dexVolume24h: 100_000_000,
        volume24h: 10_000_000,
        dexLiquidity: 50_000_000,
        marketCap: 10_000_000,
      });
      expect(scorer.scoreOnChain(coin)).toBeLessThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('should handle coin with zero market cap gracefully', () => {
      const coin = makeCoin({ marketCap: 0 });
      const result = scorer.calculate(coin);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle coin with all zeros', () => {
      const coin = makeCoin({
        marketCap: 0,
        volume24h: 0,
        fdvMcRatio: 0,
        priceChange7d: 0,
        priceChange30d: 0,
        dexTxns24h: 0,
        dexVolume24h: 0,
        dexLiquidity: 0,
      });
      const result = scorer.calculate(coin);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should never return negative scores', () => {
      const coin = makeCoin({
        priceChange7d: -50,
        priceChange30d: -80,
        volume24h: 0,
        marketCap: 10_000_000_000,
      });
      const result = scorer.calculate(coin);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.liquidity).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.tokenomics).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.marketCap).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.momentum).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.onChain).toBeGreaterThanOrEqual(0);
    });
  });
});
