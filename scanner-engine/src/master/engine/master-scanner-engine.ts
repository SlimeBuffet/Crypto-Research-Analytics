import { CoinData } from '../../types';
import { ScannerEngine } from '../../core/scanner-engine';
import { logger } from '../../utils/logger';

import { StreamIngestor } from '../ingestor';
import { SmcProcessor, DynamicScorer } from '../pattern-brain';
import { ForensicAuditEngine } from '../forensic-shield';
import { AlphaNarrator } from '../agentic-orchestrator';
import { SmcConvergenceEngine, AntiManipulationGuard, NarrativeMapper } from '../modules';
import { AutoOptimizer } from '../optimizer';
import {
  MasterConfig,
  MasterPipelineResult,
  MasterScanSummary,
  IDataProvider,
} from '../types';

const DEFAULT_MASTER_CONFIG: MasterConfig = {
  ingestor: {
    binanceWsUrl: 'wss://stream.binance.com:9443/ws',
    heliusRpcUrl: process.env.HELIUS_RPC_URL || null,
    maxStreams: 50,
    reconnectIntervalMs: 5000,
    heartbeatIntervalMs: 30000,
  },
  enableSmc: true,
  enableForensics: true,
  enableNarrative: true,
  enableAntiManipulation: true,
  enableAutoOptimization: true,
  enableAgentic: true,
  smcTimeframes: ['1h', '4h', '1d'],
  forensicMinMarketCap: 5_000_000,
  optimizationIntervalMs: 24 * 60 * 60 * 1000, // 24h
  weights: {
    liquidity: 1.0,
    tokenomics: 1.0,
    marketCap: 1.0,
    momentum: 1.0,
    onChain: 1.0,
    smc: 1.2,
    forensic: 1.5,
    narrative: 0.8,
  },
};

/**
 * Master Scanner Engine — "The Sentient Pipeline"
 *
 * Orchestrates the 4-layer architecture:
 *   Layer 1: Ingestor      → WebSocket stream-first data ingestion
 *   Layer 2: Pattern Brain  → SMC analysis + Dynamic scoring
 *   Layer 3: Forensic Shield → Security audit + Whale tracking
 *   Layer 4: Agentic        → LLM-style reasoning and narrative
 *
 * Plus 3 premium modules:
 *   - Smart Money Convergence (Liquidity Grab detection)
 *   - Anti-Manipulation Guard (Wash trading detection)
 *   - Automated Narrative Mapper (Trending narrative boost)
 *
 * Plus Auto-Optimization:
 *   - Historical weight tuning for better future predictions
 *
 * Pipeline: Ingest → Analyze → Audit → Score → Narrate
 */
export class MasterScannerEngine {
  private config: MasterConfig;
  private adapters: IDataProvider[] = [];

  // Base engine
  private scanner: ScannerEngine;

  // Layer 1
  private ingestor: StreamIngestor;

  // Layer 2
  private smcProcessor: SmcProcessor;
  private dynamicScorer: DynamicScorer;

  // Layer 3
  private forensicEngine: ForensicAuditEngine;

  // Layer 4
  private narrator: AlphaNarrator;

  // Premium Modules
  private smcConvergence: SmcConvergenceEngine;
  private antiManipulation: AntiManipulationGuard;
  private narrativeMapper: NarrativeMapper;

  // Optimizer
  private autoOptimizer: AutoOptimizer;

  constructor(config?: Partial<MasterConfig>) {
    this.config = { ...DEFAULT_MASTER_CONFIG, ...config };

    // Base scanner (existing pipeline)
    this.scanner = new ScannerEngine();

    // Layer 1: Ingestor
    this.ingestor = new StreamIngestor(this.config.ingestor);

    // Layer 2: Pattern Brain
    this.smcProcessor = new SmcProcessor();
    this.dynamicScorer = new DynamicScorer(this.config.weights);

    // Layer 3: Forensic Shield
    this.forensicEngine = new ForensicAuditEngine();

    // Layer 4: Agentic Orchestrator
    this.narrator = new AlphaNarrator();

    // Premium Modules
    this.smcConvergence = new SmcConvergenceEngine();
    this.antiManipulation = new AntiManipulationGuard();
    this.narrativeMapper = new NarrativeMapper();

    // Auto-Optimizer
    this.autoOptimizer = new AutoOptimizer(this.config.weights);
  }

  /**
   * Execute the full Master Intelligence Suite.
   *
   * Pipeline:
   *   0. Base scan (existing ScannerEngine)
   *   1. Stream ingestor (order book snapshots for top candidates)
   *   2. SMC analysis (Order Blocks, FVG, MSS)
   *   3. Forensic audit (contract security, whale tracking)
   *   4. Anti-manipulation guard (wash trading detection)
   *   5. Narrative mapping (trending narratives boost)
   *   6. SMC Convergence (liquidity grab detection)
   *   7. Dynamic scoring (master formula with correlation penalty)
   *   8. Agentic narration (reasoning and verdict)
   *   9. Auto-optimization (weight tuning)
   */
  async runIntelligenceSuite(): Promise<MasterScanSummary> {
    const startTime = Date.now();

    logger.info('='.repeat(70));
    logger.info('  MASTER SCANNER ENGINE — AUTONOMOUS ALPHA ENGINE');
    logger.info('='.repeat(70));
    logger.info({ config: this.configSummary() }, 'Master configuration');

    // ================================================================
    // Stage 0: Base Discovery (existing pipeline)
    // ================================================================
    logger.info('━━━ Stage 0: Base Discovery (Scanner Engine) ━━━');
    const allCoins = await this.scanner.scan();
    logger.info({ candidates: allCoins.length }, 'Base scan complete');

    if (allCoins.length === 0) {
      logger.info('No candidates found. Pipeline ends.');
      return this.emptySummary(startTime);
    }

    // ================================================================
    // Stage 1: Stream Ingestor — Order Book Snapshots
    // ================================================================
    logger.info('━━━ Stage 1: Stream Ingestor (Order Book) ━━━');
    const topCandidates = allCoins.slice(0, 30);
    await this.enrichWithOrderBookData(topCandidates);
    logger.info({ enriched: topCandidates.length }, 'Order book enrichment complete');

    // ================================================================
    // Stage 2: Pattern Brain — SMC Analysis
    // ================================================================
    let smcResults = new Map<string, NonNullable<MasterPipelineResult['smcAnalysis']>>();
    if (this.config.enableSmc) {
      logger.info('━━━ Stage 2: Pattern Brain (SMC Analysis) ━━━');
      const symbols = topCandidates.map((c) => c.symbol);
      smcResults = await this.smcProcessor.analyzeBatch(
        symbols,
        this.config.smcTimeframes,
      );
      logger.info({ analyzed: smcResults.size }, 'SMC analysis complete');
    }

    // ================================================================
    // Stage 3: Forensic Shield — Security Audit
    // ================================================================
    let forensicResults = new Map<string, NonNullable<MasterPipelineResult['forensicAudit']>>();
    if (this.config.enableForensics) {
      logger.info('━━━ Stage 3: Forensic Shield (Security Audit) ━━━');
      const coinsForAudit = topCandidates.filter(
        (c) => c.marketCap >= this.config.forensicMinMarketCap,
      );
      forensicResults = await this.forensicEngine.auditBatch(coinsForAudit);

      const approved = Array.from(forensicResults.values()).filter((r) => r.isApproved).length;
      logger.info(
        { audited: forensicResults.size, approved, rejected: forensicResults.size - approved },
        'Forensic audit complete',
      );
    }

    // ================================================================
    // Stage 4: Anti-Manipulation Guard
    // ================================================================
    let manipulationResults = new Map<string, NonNullable<MasterPipelineResult['manipulationGuard']>>();
    if (this.config.enableAntiManipulation) {
      logger.info('━━━ Stage 4: Anti-Manipulation Guard ━━━');
      manipulationResults = await this.antiManipulation.analyzeBatch(topCandidates);

      const manipulated = Array.from(manipulationResults.values()).filter(
        (r) => r.isManipulated,
      ).length;
      logger.info(
        { analyzed: manipulationResults.size, flagged: manipulated },
        'Anti-manipulation check complete',
      );
    }

    // ================================================================
    // Stage 5: Narrative Mapper
    // ================================================================
    let narrativeResults = new Map<string, NonNullable<MasterPipelineResult['narrativeMap']>>();
    if (this.config.enableNarrative) {
      logger.info('━━━ Stage 5: Narrative Mapper ━━━');
      narrativeResults = this.narrativeMapper.analyzeBatch(topCandidates);
      logger.info({ mapped: narrativeResults.size }, 'Narrative mapping complete');
    }

    // ================================================================
    // Stage 6: SMC Convergence (Liquidity Grab Detection)
    // ================================================================
    let convergenceResults = new Map<string, NonNullable<MasterPipelineResult['smcConvergence']>>();
    if (this.config.enableSmc) {
      logger.info('━━━ Stage 6: SMC Convergence (Liquidity Grabs) ━━━');
      convergenceResults = await this.smcConvergence.analyzeBatch(
        topCandidates,
        smcResults,
      );

      const ultraGems = Array.from(convergenceResults.values()).filter(
        (r) => r.isUltraGem,
      ).length;
      logger.info(
        { analyzed: convergenceResults.size, ultraGems },
        'SMC convergence complete',
      );
    }

    // ================================================================
    // Stage 7: Dynamic Scoring (Master Formula)
    // ================================================================
    logger.info('━━━ Stage 7: Dynamic Scoring (Master Formula) ━━━');
    const pipelineResults: MasterPipelineResult[] = [];

    for (const coin of topCandidates) {
      const smc = smcResults.get(coin.symbol) ?? null;
      const forensic = forensicResults.get(coin.symbol) ?? null;
      const narrative = narrativeResults.get(coin.symbol) ?? null;
      const convergence = convergenceResults.get(coin.symbol) ?? null;
      const manipulation = manipulationResults.get(coin.symbol) ?? null;

      // Calculate dynamic master score
      const dynamicScore = await this.dynamicScorer.calculate(
        coin,
        smc,
        forensic,
        narrative,
      );

      // Apply anti-manipulation penalty
      if (manipulation && manipulation.isManipulated) {
        dynamicScore.finalScore = Math.max(0, dynamicScore.finalScore * 0.5);
      }

      // Generate alpha report (agentic narration)
      let alphaReport = null;
      if (this.config.enableAgentic) {
        alphaReport = await this.narrator.generateReport(
          coin.symbol,
          coin,
          smc,
          forensic,
          narrative,
          convergence,
          manipulation,
          dynamicScore,
        );
      }

      // Determine final verdict
      const finalVerdict = alphaReport?.verdict ?? this.determineFallbackVerdict(
        dynamicScore.finalScore,
        forensic?.isApproved ?? true,
        manipulation?.isManipulated ?? false,
        convergence?.isUltraGem ?? false,
      );

      pipelineResults.push({
        symbol: coin.symbol,
        coin,
        smcAnalysis: smc,
        forensicAudit: forensic,
        smcConvergence: convergence,
        manipulationGuard: manipulation,
        narrativeMap: narrative,
        alphaReport,
        dynamicScore,
        finalVerdict,
        timestamp: Date.now(),
      });
    }

    // Sort by dynamic score descending
    pipelineResults.sort(
      (a, b) => b.dynamicScore.finalScore - a.dynamicScore.finalScore,
    );

    // ================================================================
    // Stage 8: Auto-Optimization (Weight Tuning)
    // ================================================================
    let optimizationApplied = false;
    if (this.config.enableAutoOptimization) {
      logger.info('━━━ Stage 8: Auto-Optimization ━━━');
      const optResult = await this.autoOptimizer.optimize(
        topCandidates,
        this.dynamicScorer,
      );
      optimizationApplied = optResult.improvement > 0.05;

      logger.info(
        {
          improvement: optResult.improvement,
          applied: optimizationApplied,
          f1Score: optResult.backtestResults.f1Score,
        },
        'Auto-optimization complete',
      );
    }

    // ================================================================
    // Summary
    // ================================================================
    const elapsed = Date.now() - startTime;

    const summary: MasterScanSummary = {
      totalScanned: allCoins.length,
      passedSmc: pipelineResults.filter(
        (r) => r.smcAnalysis && r.smcAnalysis.smcScore > 3,
      ).length,
      passedForensic: pipelineResults.filter(
        (r) => !r.forensicAudit || r.forensicAudit.isApproved,
      ).length,
      passedManipulation: pipelineResults.filter(
        (r) => !r.manipulationGuard || !r.manipulationGuard.isManipulated,
      ).length,
      ultraGems: pipelineResults.filter(
        (r) => r.finalVerdict === 'ULTRA_GEM',
      ).length,
      strongBuys: pipelineResults.filter(
        (r) => r.finalVerdict === 'STRONG_BUY',
      ).length,
      results: pipelineResults,
      optimizationApplied,
      scanDurationMs: elapsed,
      timestamp: Date.now(),
    };

    this.logSummary(summary);

    return summary;
  }

  /**
   * Enrich candidates with order book snapshot data.
   */
  private async enrichWithOrderBookData(coins: CoinData[]): Promise<void> {
    for (const coin of coins.slice(0, 10)) {
      try {
        await this.ingestor.fetchOrderBookSnapshot(coin.symbol);
      } catch {
        logger.debug({ symbol: coin.symbol }, 'Order book fetch failed');
      }
    }
  }

  /**
   * Fallback verdict when agentic narrator is disabled.
   */
  private determineFallbackVerdict(
    score: number,
    forensicApproved: boolean,
    isManipulated: boolean,
    isUltraGem: boolean,
  ): 'ULTRA_GEM' | 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID' {
    if (!forensicApproved || isManipulated) return 'AVOID';
    if (isUltraGem && score >= 15) return 'ULTRA_GEM';
    if (score >= 20) return 'STRONG_BUY';
    if (score >= 15) return 'BUY';
    if (score >= 10) return 'NEUTRAL';
    return 'AVOID';
  }

  /**
   * Log the final scan summary.
   */
  private logSummary(summary: MasterScanSummary): void {
    logger.info('');
    logger.info('═'.repeat(70));
    logger.info('  MASTER SCAN RESULTS');
    logger.info('═'.repeat(70));
    logger.info(
      {
        totalScanned: summary.totalScanned,
        passedSmc: summary.passedSmc,
        passedForensic: summary.passedForensic,
        passedManipulation: summary.passedManipulation,
        ultraGems: summary.ultraGems,
        strongBuys: summary.strongBuys,
        duration: `${(summary.scanDurationMs / 1000).toFixed(1)}s`,
        optimized: summary.optimizationApplied,
      },
      'Scan summary',
    );

    // Log top results
    const top = summary.results.slice(0, 10);
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      logger.info(
        {
          rank: i + 1,
          symbol: r.symbol,
          verdict: r.finalVerdict,
          masterScore: r.dynamicScore.finalScore,
          smcScore: r.smcAnalysis?.smcScore ?? 'N/A',
          smcBias: r.smcAnalysis?.bias ?? 'N/A',
          forensic: r.forensicAudit?.overallRiskLevel ?? 'N/A',
          manipulation: r.manipulationGuard?.isManipulated ? 'FLAGGED' : 'CLEAN',
          narrative: r.narrativeMap?.matchedNarratives.slice(0, 2).map(
            (n) => n.narrative,
          ).join(', ') ?? 'N/A',
          correlationPenalty: r.dynamicScore.correlationPenalty,
        },
        `#${i + 1} ${r.symbol} [${r.finalVerdict}]`,
      );

      // Log alpha report narrative if available
      if (r.alphaReport) {
        logger.info(
          { narrative: r.alphaReport.narrative.slice(0, 200) + '...' },
          `  → ${r.symbol} Alpha Report`,
        );
      }
    }

    logger.info('═'.repeat(70));
  }

  /**
   * Get a summary of the configuration for logging.
   */
  private configSummary(): Record<string, unknown> {
    return {
      smc: this.config.enableSmc,
      forensics: this.config.enableForensics,
      narrative: this.config.enableNarrative,
      antiManipulation: this.config.enableAntiManipulation,
      autoOptimization: this.config.enableAutoOptimization,
      agentic: this.config.enableAgentic,
      smcTimeframes: this.config.smcTimeframes,
    };
  }

  /**
   * Create an empty summary for early exits.
   */
  private emptySummary(startTime: number): MasterScanSummary {
    return {
      totalScanned: 0,
      passedSmc: 0,
      passedForensic: 0,
      passedManipulation: 0,
      ultraGems: 0,
      strongBuys: 0,
      results: [],
      optimizationApplied: false,
      scanDurationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  /**
   * Shutdown all running streams and clean up.
   */
  async shutdown(): Promise<void> {
    await this.ingestor.shutdown();
    logger.info('Master Scanner Engine shutdown complete');
  }
}
