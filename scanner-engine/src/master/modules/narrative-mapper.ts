import { CoinData } from '../../types';
import { logger } from '../../utils/logger';
import {
  NarrativeMapResult,
  NarrativeMatch,
  NarrativeDefinition,
} from '../types';

/**
 * Automated Narrative Mapper Module
 *
 * Maps coins to currently trending narratives using keyword-based
 * semantic matching. When a narrative like "RWA" is being discussed
 * by BlackRock, coins with RWA tags automatically get a ranking boost.
 *
 * Uses a keyword vector approach instead of a full Vector DB
 * for lightweight deployment.
 */
export class NarrativeMapper {
  private narratives: NarrativeDefinition[];

  constructor() {
    this.narratives = this.initializeNarratives();
  }

  /**
   * Map a coin to active narratives and calculate narrative score.
   */
  analyze(coin: CoinData): NarrativeMapResult {
    const matchedNarratives = this.matchNarratives(coin);

    const narrativeScore = this.calculateNarrativeScore(matchedNarratives);
    const trendingBoost = this.calculateTrendingBoost(matchedNarratives);

    return {
      symbol: coin.symbol,
      matchedNarratives,
      narrativeScore: Math.round(narrativeScore * 100) / 100,
      trendingBoost: Math.round(trendingBoost * 100) / 100,
      adjustedNarrativeScore: Math.round((narrativeScore + trendingBoost) * 100) / 100,
    };
  }

  /**
   * Match a coin's sector/categories to known narratives.
   */
  private matchNarratives(coin: CoinData): NarrativeMatch[] {
    const matches: NarrativeMatch[] = [];
    const coinText = this.buildCoinText(coin);

    for (const narrative of this.narratives) {
      const { relevanceScore, matchedKeywords } = this.calculateRelevance(
        coinText,
        narrative,
      );

      if (relevanceScore > 0.1) {
        matches.push({
          narrative: narrative.name,
          relevanceScore,
          trendingScore: narrative.isTrending ? narrative.weight * 1.5 : narrative.weight,
          keywords: matchedKeywords,
          isTrending: narrative.isTrending,
        });
      }
    }

    // Sort by relevance score descending
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return matches.slice(0, 5);
  }

  /**
   * Build searchable text from coin data.
   */
  private buildCoinText(coin: CoinData): string[] {
    const tokens: string[] = [];

    tokens.push(coin.symbol.toLowerCase());
    tokens.push(coin.name.toLowerCase());

    if (coin.sector) {
      tokens.push(coin.sector.toLowerCase());
    }

    for (const cat of coin.categories) {
      tokens.push(cat.toLowerCase());
    }

    return tokens;
  }

  /**
   * Calculate relevance between coin text and a narrative definition.
   */
  private calculateRelevance(
    coinTokens: string[],
    narrative: NarrativeDefinition,
  ): { relevanceScore: number; matchedKeywords: string[] } {
    const matchedKeywords: string[] = [];
    let totalWeight = 0;

    for (const keyword of narrative.keywords) {
      const kwLower = keyword.toLowerCase();

      for (const token of coinTokens) {
        if (
          token.includes(kwLower) ||
          kwLower.includes(token) ||
          this.fuzzyMatch(token, kwLower)
        ) {
          matchedKeywords.push(keyword);
          totalWeight += 1;
          break;
        }
      }
    }

    // Check sector match
    for (const sector of narrative.relatedSectors) {
      for (const token of coinTokens) {
        if (token.includes(sector.toLowerCase())) {
          totalWeight += 1.5;
          if (!matchedKeywords.includes(sector)) {
            matchedKeywords.push(sector);
          }
          break;
        }
      }
    }

    const maxPossible = narrative.keywords.length + narrative.relatedSectors.length * 1.5;
    const relevanceScore = maxPossible > 0 ? totalWeight / maxPossible : 0;

    return {
      relevanceScore: Math.min(1, relevanceScore),
      matchedKeywords,
    };
  }

  /**
   * Simple fuzzy matching based on character overlap.
   */
  private fuzzyMatch(a: string, b: string): boolean {
    if (a.length < 3 || b.length < 3) return false;

    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;

    let matches = 0;
    for (const char of shorter) {
      if (longer.includes(char)) matches++;
    }

    return matches / shorter.length > 0.8 && shorter.length >= 4;
  }

  /**
   * Calculate base narrative score.
   */
  private calculateNarrativeScore(matches: NarrativeMatch[]): number {
    if (matches.length === 0) return 0;

    let score = 0;
    for (const match of matches) {
      score += match.relevanceScore * match.trendingScore;
    }

    return Math.min(5, score);
  }

  /**
   * Calculate additional boost from trending narratives.
   */
  private calculateTrendingBoost(matches: NarrativeMatch[]): number {
    const trendingMatches = matches.filter((m) => m.isTrending);
    if (trendingMatches.length === 0) return 0;

    let boost = 0;
    for (const match of trendingMatches) {
      boost += match.relevanceScore * 0.5;
    }

    return Math.min(2, boost);
  }

  /**
   * Initialize narrative definitions with current market trends.
   */
  private initializeNarratives(): NarrativeDefinition[] {
    const now = Date.now();

    return [
      {
        id: 'ai-crypto',
        name: 'AI x Crypto',
        keywords: [
          'ai', 'artificial intelligence', 'machine learning', 'neural',
          'compute', 'gpu', 'inference', 'llm', 'agent', 'autonomous',
          'data marketplace', 'federated learning', 'decentralized ai',
        ],
        relatedSectors: ['AI', 'Artificial Intelligence', 'Machine Learning', 'AI Agents'],
        weight: 2.0,
        isTrending: true,
        lastUpdated: now,
      },
      {
        id: 'rwa',
        name: 'Real World Assets (RWA)',
        keywords: [
          'rwa', 'real world', 'tokenization', 'treasury', 'bonds',
          'real estate', 'commodities', 'credit', 'yield', 'blackrock',
          'securitization', 'institutional',
        ],
        relatedSectors: ['RWA', 'Real World Assets', 'Tokenization'],
        weight: 1.8,
        isTrending: true,
        lastUpdated: now,
      },
      {
        id: 'depin',
        name: 'DePIN (Decentralized Physical Infrastructure)',
        keywords: [
          'depin', 'infrastructure', 'physical', 'iot', 'sensor',
          'wireless', 'storage', 'compute', 'bandwidth', 'network',
          'helium', 'render', 'filecoin',
        ],
        relatedSectors: ['DePIN', 'Infrastructure', 'IoT'],
        weight: 1.6,
        isTrending: true,
        lastUpdated: now,
      },
      {
        id: 'lst-lrt',
        name: 'Liquid Staking & Restaking',
        keywords: [
          'staking', 'restaking', 'liquid', 'lst', 'lrt',
          'eigenlayer', 'validator', 'yield', 'eth staking',
          'avs', 'shared security',
        ],
        relatedSectors: ['Liquid Staking', 'Restaking', 'LST', 'LRT', 'DeFi'],
        weight: 1.4,
        isTrending: true,
        lastUpdated: now,
      },
      {
        id: 'l2-modular',
        name: 'Layer 2 & Modular Blockchain',
        keywords: [
          'layer 2', 'l2', 'rollup', 'zk', 'optimistic',
          'modular', 'data availability', 'da', 'celestia',
          'scaling', 'appchain', 'app-specific',
        ],
        relatedSectors: ['Layer 2', 'L2', 'Modular', 'Scaling', 'Infrastructure'],
        weight: 1.3,
        isTrending: false,
        lastUpdated: now,
      },
      {
        id: 'gaming',
        name: 'Gaming & Metaverse',
        keywords: [
          'gaming', 'game', 'metaverse', 'nft', 'play',
          'virtual world', 'gamefi', 'p2e', 'play-to-earn',
          'guild', 'esports',
        ],
        relatedSectors: ['Gaming', 'Metaverse', 'GameFi', 'NFT'],
        weight: 1.0,
        isTrending: false,
        lastUpdated: now,
      },
      {
        id: 'defi',
        name: 'DeFi 2.0',
        keywords: [
          'defi', 'dex', 'amm', 'lending', 'borrowing',
          'yield', 'liquidity', 'swap', 'perp', 'derivatives',
          'options', 'structured products',
        ],
        relatedSectors: ['DeFi', 'Decentralized Finance', 'DEX', 'Lending'],
        weight: 1.2,
        isTrending: false,
        lastUpdated: now,
      },
      {
        id: 'meme',
        name: 'Meme & Culture Coins',
        keywords: [
          'meme', 'dog', 'cat', 'pepe', 'doge', 'shib',
          'culture', 'community', 'viral', 'social',
        ],
        relatedSectors: ['Meme', 'Culture'],
        weight: 0.8,
        isTrending: true,
        lastUpdated: now,
      },
      {
        id: 'btc-ecosystem',
        name: 'Bitcoin Ecosystem',
        keywords: [
          'bitcoin', 'btc', 'ordinals', 'brc-20', 'rune',
          'lightning', 'stacks', 'layer2 bitcoin', 'taproot',
        ],
        relatedSectors: ['Bitcoin', 'BTC Ecosystem'],
        weight: 1.5,
        isTrending: true,
        lastUpdated: now,
      },
      {
        id: 'social',
        name: 'SocialFi & Creator Economy',
        keywords: [
          'social', 'socialfi', 'creator', 'content', 'fan',
          'friend.tech', 'lens', 'farcaster', 'decentralized social',
        ],
        relatedSectors: ['Social', 'SocialFi', 'Creator Economy'],
        weight: 1.1,
        isTrending: false,
        lastUpdated: now,
      },
      {
        id: 'privacy',
        name: 'Privacy & ZK Technology',
        keywords: [
          'privacy', 'zk', 'zero knowledge', 'zkp', 'zksnark',
          'zkstark', 'confidential', 'anonymous', 'mixnet',
        ],
        relatedSectors: ['Privacy', 'ZK', 'Zero Knowledge'],
        weight: 1.2,
        isTrending: false,
        lastUpdated: now,
      },
      {
        id: 'interop',
        name: 'Cross-Chain & Interoperability',
        keywords: [
          'cross-chain', 'bridge', 'interoperability', 'multichain',
          'omnichain', 'layerzero', 'wormhole', 'ibc',
        ],
        relatedSectors: ['Interoperability', 'Cross-Chain', 'Bridge'],
        weight: 1.1,
        isTrending: false,
        lastUpdated: now,
      },
    ];
  }

  /**
   * Update a narrative's trending status.
   */
  updateNarrativeTrend(narrativeId: string, isTrending: boolean): void {
    const narrative = this.narratives.find((n) => n.id === narrativeId);
    if (narrative) {
      narrative.isTrending = isTrending;
      narrative.lastUpdated = Date.now();
      logger.info({ narrativeId, isTrending }, 'Narrative trend updated');
    }
  }

  /**
   * Batch analyze multiple coins.
   */
  analyzeBatch(coins: CoinData[]): Map<string, NarrativeMapResult> {
    const results = new Map<string, NarrativeMapResult>();

    for (const coin of coins) {
      results.set(coin.symbol, this.analyze(coin));
    }

    return results;
  }
}
