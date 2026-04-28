// ============================================================================
// Master Level Architecture — Autonomous Intelligence Hub
// ============================================================================

// Types
export type {
  // Layer 1: Ingestor
  IngestorConfig,
  StreamTradeEvent,
  OrderBookSnapshot,
  PriceLevel,
  WorkerProcessResult,
  AggregatedTradeData,
  VolumeProfile,
  GraduatedToken,
  WorkerTaskPayload,
  WorkerTaskResult,

  // Layer 2: Pattern Brain
  SmcAnalysis,
  MarketStructure,
  OrderBlock,
  FairValueGap,
  LiquidityLevel,
  SwingPoint,
  DynamicScoreResult,
  ScoreWeights,
  VectorizedOHLC,

  // Layer 3: Forensic Shield
  ForensicAuditResult,
  ContractSecurity,
  WhaleAnalysis,
  WhaleWallet,
  WhaleMovement,
  GoPlusTokenSecurity,
  GoPlusLpHolder,
  GoPlusDexInfo,
  DeBankWhaleProfile,
  DeBankTokenHolding,
  CrossValidationResult,

  // Layer 4: Agentic Orchestrator (ElizaOS)
  AlphaReport,
  ReasoningChain,
  ElizaCharacter,
  ElizaDecision,
  ElizaPluginReport,
  ReActStep,
  ReActTrace,
  BtcGateResult,
  MasterScoreResult,

  // Module: Smart Money Convergence
  SmcConvergenceResult,
  LiquidityGrab,

  // Module: Anti-Manipulation Guard
  ManipulationGuardResult,
  ManipulationFlag,
  BenfordsLawResult,
  SpreadVarianceResult,
  HighFreqVolumeSpike,

  // Module: Narrative Mapper
  NarrativeMapResult,
  NarrativeMatch,
  NarrativeDefinition,
  VectorEmbedding,
  SemanticMatch,
  NewsArticle,

  // Module: Auto-Optimization
  OptimizationResult,
  OptimizationBacktest,
  HistoricalPerformance,

  // Master Engine
  MasterConfig,
  MasterPipelineResult,
  MasterScanSummary,
  IAlphaHunter,
  IDataProvider,
} from './types';

// Layer 1: Ingestor
export { StreamIngestor } from './ingestor';

// Layer 2: Pattern Brain
export { SmcProcessor, DynamicScorer } from './pattern-brain';

// Layer 3: Forensic Shield
export { ForensicAuditEngine } from './forensic-shield';

// Layer 4: Agentic Orchestrator (ElizaOS)
export { AlphaNarrator } from './agentic-orchestrator';
export { ElizaOrchestrator } from './agents';

// Modules
export { SmcConvergenceEngine, AntiManipulationGuard, NarrativeMapper } from './modules';

// Optimizer
export { AutoOptimizer } from './optimizer';

// Utils
export { CircuitBreaker, CircuitOpenError } from './utils';

// Master Engine
export { MasterScannerEngine } from './engine';
