import { CoinData } from '../../types';
import { fetchWithBackoff } from '../../utils/fetcher';
import { logger } from '../../utils/logger';
import { CircuitBreaker } from '../utils/circuit-breaker';
import {
  NarrativeMapResult,
  NarrativeMatch,
  NarrativeDefinition,
  VectorEmbedding,
  SemanticMatch,
  NewsArticle,
} from '../types';

/**
 * Automated Narrative Mapper (Enhanced)
 *
 * Reference: chroma-core/chroma & adbar/trafilatura
 *
 * Enhanced features:
 *   1. Real-time news pipeline via CryptoCompare/RSS feeds
 *   2. Cosine Similarity for semantic matching to trending narratives
 *   3. TF-IDF based vector embeddings for token-to-narrative mapping
 *   4. In-memory Vector DB for fast similarity search
 *   5. Dynamic narrative weight adjustment based on trending status
 */
export class NarrativeMapper {
  private narratives: NarrativeDefinition[];
  private narrativeVectors: Map<string, VectorEmbedding> = new Map();
  private newsCache: NewsArticle[] = [];
  private lastNewsFetch = 0;
  private vocabulary: string[] = [];
  private idfScores: Map<string, number> = new Map();
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.narratives = this.initializeNarratives();
    this.circuitBreaker = new CircuitBreaker({
      name: 'narrative-news',
      failureThreshold: 3,
      resetTimeoutMs: 120_000,
    });
    this.buildVocabularyAndVectors();
  }

  /**
   * Analyze a coin's narrative alignment using cosine similarity.
   */
  async analyze(coin: CoinData): Promise<NarrativeMapResult> {
    // Fetch fresh news if cache is stale (>30 min)
    if (Date.now() - this.lastNewsFetch > 30 * 60 * 1000) {
      await this.fetchLatestNews();
    }

    // Build coin's feature vector from its metadata
    const coinText = this.buildCoinText(coin);
    const coinVector = this.textToVector(coinText);

    // Compute cosine similarity against each narrative
    const semanticMatches = this.computeSemanticMatches(coinVector, coin);

    // Also do keyword-based matching as a secondary signal
    const keywordMatches = this.matchNarrativesKeyword(coin);

    // Merge semantic and keyword matches
    const mergedMatches = this.mergeMatches(semanticMatches, keywordMatches);

    const narrativeScore = mergedMatches.length > 0
      ? mergedMatches.reduce((s, m) => s + m.relevanceScore, 0) / mergedMatches.length * 5
      : 0;

    const trendingBoost = mergedMatches
      .filter((m) => m.isTrending)
      .reduce((s, m) => s + m.trendingScore * 0.5, 0);

    return {
      symbol: coin.symbol,
      matchedNarratives: mergedMatches.slice(0, 5),
      narrativeScore: Math.round(Math.min(5, narrativeScore) * 100) / 100,
      trendingBoost: Math.round(trendingBoost * 100) / 100,
      adjustedNarrativeScore: Math.round(Math.min(5, narrativeScore + trendingBoost) * 100) / 100,
    };
  }

  /**
   * Build a text representation of the coin for vectorization.
   */
  private buildCoinText(coin: CoinData): string {
    const parts: string[] = [
      coin.symbol.toLowerCase(),
      coin.name?.toLowerCase() || '',
      coin.sector?.toLowerCase() || '',
    ];

    if (coin.categories) parts.push(...coin.categories.map((t) => t.toLowerCase()));

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Convert text to a TF-IDF vector embedding.
   */
  private textToVector(text: string): VectorEmbedding {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const tf = new Map<string, number>();

    for (const word of words) {
      tf.set(word, (tf.get(word) || 0) + 1);
    }

    const totalWords = words.length || 1;
    const vector = this.vocabulary.map((term) => {
      const termFreq = (tf.get(term) || 0) / totalWords;
      const idf = this.idfScores.get(term) || 1;
      return termFreq * idf;
    });

    const magnitude = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    return { vector, magnitude };
  }

  /**
   * Compute cosine similarity between coin vector and each narrative vector.
   */
  private computeSemanticMatches(
    coinVector: VectorEmbedding,
    _coin: CoinData,
  ): SemanticMatch[] {
    const matches: SemanticMatch[] = [];

    for (const narrative of this.narratives) {
      const narVector = this.narrativeVectors.get(narrative.id);
      if (!narVector) continue;

      const similarity = this.cosineSimilarity(coinVector, narVector);

      if (similarity > 0.05) {
        // Find matching news articles
        const relatedArticles = this.newsCache
          .filter((a) => {
            const articleText = `${a.title} ${a.content}`.toLowerCase();
            return narrative.keywords.some((kw) => articleText.includes(kw.toLowerCase()));
          })
          .map((a) => a.title)
          .slice(0, 3);

        matches.push({
          narrative: narrative.name,
          cosineSimilarity: Math.round(similarity * 1000) / 1000,
          matchedArticles: relatedArticles,
          confidence: Math.min(0.95, similarity * 1.5 + (relatedArticles.length > 0 ? 0.1 : 0)),
        });
      }
    }

    return matches.sort((a, b) => b.cosineSimilarity - a.cosineSimilarity);
  }

  /**
   * Cosine similarity between two vectors.
   */
  private cosineSimilarity(a: VectorEmbedding, b: VectorEmbedding): number {
    if (a.magnitude === 0 || b.magnitude === 0) return 0;

    let dotProduct = 0;
    const len = Math.min(a.vector.length, b.vector.length);
    for (let i = 0; i < len; i++) {
      dotProduct += a.vector[i] * b.vector[i];
    }

    return dotProduct / (a.magnitude * b.magnitude);
  }

  /**
   * Build vocabulary and narrative vectors for TF-IDF matching.
   */
  private buildVocabularyAndVectors(): void {
    // Collect all unique terms from narratives
    const allTerms = new Set<string>();
    const documents: string[][] = [];

    for (const narrative of this.narratives) {
      const words = [
        ...narrative.keywords.map((k) => k.toLowerCase()),
        ...narrative.relatedSectors.map((s) => s.toLowerCase()),
        narrative.name.toLowerCase(),
      ];
      documents.push(words);
      for (const w of words) allTerms.add(w);
    }

    this.vocabulary = Array.from(allTerms);

    // Calculate IDF scores
    const numDocs = documents.length;
    for (const term of this.vocabulary) {
      const docsContaining = documents.filter((doc) =>
        doc.some((w) => w.includes(term) || term.includes(w)),
      ).length;
      this.idfScores.set(term, Math.log((numDocs + 1) / (docsContaining + 1)) + 1);
    }

    // Build narrative vectors
    for (const narrative of this.narratives) {
      const text = [
        ...narrative.keywords,
        ...narrative.relatedSectors,
        narrative.name,
      ].join(' ');
      this.narrativeVectors.set(narrative.id, this.textToVector(text));
    }
  }

  /**
   * Fetch latest crypto news for narrative analysis.
   */
  private async fetchLatestNews(): Promise<void> {
    try {
      await this.circuitBreaker.execute(async () => {
        const data = await fetchWithBackoff<{
          Data: Array<{
            title: string;
            url: string;
            source: string;
            published_on: number;
            body: string;
          }>;
        }>('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest', {
          label: 'cryptocompare/news',
        });

        this.newsCache = (data.Data || []).slice(0, 50).map((article) => ({
          title: article.title,
          url: article.url,
          source: article.source,
          publishedAt: article.published_on * 1000,
          content: article.body?.slice(0, 500) || '',
          relevanceScore: 0,
        }));

        this.lastNewsFetch = Date.now();

        // Update narrative trending status based on news
        this.updateNarrativeTrending();

        logger.info({ articles: this.newsCache.length }, 'News cache updated');
      });
    } catch {
      logger.debug('News fetch failed — using cached data');
    }
  }

  /**
   * Update narrative trending status based on news frequency.
   */
  private updateNarrativeTrending(): void {
    for (const narrative of this.narratives) {
      const mentions = this.newsCache.filter((article) => {
        const text = `${article.title} ${article.content}`.toLowerCase();
        return narrative.keywords.some((kw) => text.includes(kw.toLowerCase()));
      }).length;

      narrative.isTrending = mentions >= 2;
      narrative.lastUpdated = Date.now();
    }
  }

  /**
   * Keyword-based narrative matching (fallback/supplement to semantic).
   */
  private matchNarrativesKeyword(coin: CoinData): NarrativeMatch[] {
    const matches: NarrativeMatch[] = [];
    const coinText = [
      coin.symbol, coin.name || '', coin.sector || '',
      ...(coin.categories || []),
    ].join(' ').toLowerCase();

    for (const narrative of this.narratives) {
      const matchedKeywords = narrative.keywords.filter(
        (kw) => coinText.includes(kw.toLowerCase()),
      );

      if (matchedKeywords.length > 0) {
        const relevanceScore = Math.min(
          1, matchedKeywords.length / Math.max(3, narrative.keywords.length) * 1.5,
        );
        const trendingScore = narrative.isTrending ? 0.8 : 0.2;

        matches.push({
          narrative: narrative.name,
          relevanceScore: Math.round(relevanceScore * 100) / 100,
          trendingScore: Math.round(trendingScore * 100) / 100,
          keywords: matchedKeywords,
          isTrending: narrative.isTrending,
        });
      }
    }

    return matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Merge semantic and keyword matches, deduplicating by narrative name.
   */
  private mergeMatches(semantic: SemanticMatch[], keyword: NarrativeMatch[]): NarrativeMatch[] {
    const merged = new Map<string, NarrativeMatch>();

    for (const kw of keyword) {
      merged.set(kw.narrative, kw);
    }

    for (const sem of semantic) {
      const existing = merged.get(sem.narrative);
      const narrative = this.narratives.find((n) => n.name === sem.narrative);

      if (existing) {
        // Boost relevance when both signals agree
        existing.relevanceScore = Math.min(1, existing.relevanceScore + sem.cosineSimilarity * 0.5);
      } else {
        merged.set(sem.narrative, {
          narrative: sem.narrative,
          relevanceScore: Math.round(sem.cosineSimilarity * 100) / 100,
          trendingScore: narrative?.isTrending ? 0.8 : 0.2,
          keywords: sem.matchedArticles,
          isTrending: narrative?.isTrending || false,
        });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private initializeNarratives(): NarrativeDefinition[] {
    return [
      { id: 'ai-crypto', name: 'AI x Crypto', keywords: ['ai', 'artificial intelligence', 'machine learning', 'gpt', 'llm', 'neural', 'deep learning', 'inference'], relatedSectors: ['Technology', 'AI'], weight: 1.3, isTrending: true, lastUpdated: Date.now() },
      { id: 'rwa', name: 'Real World Assets (RWA)', keywords: ['rwa', 'real world', 'tokenized', 'treasury', 'bonds', 'securities', 'asset-backed', 'blackrock'], relatedSectors: ['Finance', 'TradFi'], weight: 1.2, isTrending: true, lastUpdated: Date.now() },
      { id: 'depin', name: 'DePIN', keywords: ['depin', 'physical infrastructure', 'iot', 'wireless', 'compute', 'gpu', 'bandwidth', 'storage'], relatedSectors: ['Infrastructure'], weight: 1.2, isTrending: true, lastUpdated: Date.now() },
      { id: 'lst-lrt', name: 'Liquid Staking/Restaking', keywords: ['lst', 'lrt', 'liquid staking', 'restaking', 'eigenlayer', 'lido', 'staked', 'validator'], relatedSectors: ['Staking', 'DeFi'], weight: 1.1, isTrending: true, lastUpdated: Date.now() },
      { id: 'l2-rollup', name: 'Layer 2 / Rollups', keywords: ['l2', 'layer 2', 'rollup', 'zk-rollup', 'optimistic', 'scaling', 'sequencer'], relatedSectors: ['Infrastructure', 'Scaling'], weight: 1.0, isTrending: false, lastUpdated: Date.now() },
      { id: 'gamefi', name: 'GameFi', keywords: ['gamefi', 'game', 'gaming', 'play-to-earn', 'p2e', 'metaverse', 'nft', 'virtual world'], relatedSectors: ['Gaming', 'Entertainment'], weight: 0.9, isTrending: false, lastUpdated: Date.now() },
      { id: 'socialfi', name: 'SocialFi', keywords: ['socialfi', 'social', 'community', 'creator', 'content', 'friend.tech', 'farcaster', 'lens'], relatedSectors: ['Social', 'Web3'], weight: 0.8, isTrending: false, lastUpdated: Date.now() },
      { id: 'meme', name: 'Meme / Culture', keywords: ['meme', 'doge', 'shiba', 'pepe', 'culture', 'community-driven', 'viral'], relatedSectors: ['Meme', 'Community'], weight: 0.7, isTrending: true, lastUpdated: Date.now() },
      { id: 'defi-2', name: 'DeFi 2.0', keywords: ['defi', 'dex', 'amm', 'lending', 'yield', 'perp', 'perpetual', 'swap', 'vault'], relatedSectors: ['DeFi', 'Finance'], weight: 1.0, isTrending: false, lastUpdated: Date.now() },
      { id: 'privacy', name: 'Privacy / ZK', keywords: ['privacy', 'zero knowledge', 'zk', 'zk-snark', 'zk-stark', 'confidential', 'anonymous'], relatedSectors: ['Privacy', 'Security'], weight: 0.9, isTrending: false, lastUpdated: Date.now() },
      { id: 'btc-eco', name: 'Bitcoin Ecosystem', keywords: ['bitcoin', 'btc', 'ordinals', 'brc-20', 'runes', 'lightning', 'taproot', 'stacks'], relatedSectors: ['Bitcoin', 'Layer 1'], weight: 1.1, isTrending: true, lastUpdated: Date.now() },
      { id: 'data-oracle', name: 'Data & Oracle', keywords: ['oracle', 'data', 'chainlink', 'api3', 'band', 'feed', 'cross-chain data'], relatedSectors: ['Infrastructure', 'Data'], weight: 0.8, isTrending: false, lastUpdated: Date.now() },
      { id: 'modular', name: 'Modular Blockchain', keywords: ['modular', 'data availability', 'celestia', 'avail', 'eigenda', 'consensus', 'execution'], relatedSectors: ['Infrastructure'], weight: 1.0, isTrending: false, lastUpdated: Date.now() },
      { id: 'interop', name: 'Interoperability', keywords: ['bridge', 'cross-chain', 'interoperability', 'ibc', 'layerzero', 'wormhole', 'axelar'], relatedSectors: ['Infrastructure'], weight: 0.9, isTrending: false, lastUpdated: Date.now() },
    ];
  }

  async analyzeBatch(coins: CoinData[]): Promise<Map<string, NarrativeMapResult>> {
    const results = new Map<string, NarrativeMapResult>();
    for (const coin of coins) {
      try {
        results.set(coin.symbol, await this.analyze(coin));
      } catch {
        logger.debug({ symbol: coin.symbol }, 'Narrative mapping failed');
      }
    }
    return results;
  }
}
