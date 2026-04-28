// ============================================================================
// Master Level Architecture — Barrel Export
// "From Data Fetcher to Autonomous Alpha Engine"
// ============================================================================

// Engine
export { MasterScannerEngine } from './engine';

// Layer 1: Ingestor
export { StreamIngestor } from './ingestor';

// Layer 2: Pattern Brain
export { SmcProcessor, DynamicScorer } from './pattern-brain';

// Layer 3: Forensic Shield
export { ForensicAuditEngine } from './forensic-shield';

// Layer 4: Agentic Orchestrator
export { AlphaNarrator } from './agentic-orchestrator';

// Premium Modules
export { SmcConvergenceEngine, AntiManipulationGuard, NarrativeMapper } from './modules';

// Optimizer
export { AutoOptimizer } from './optimizer';

// Types
export type {
  // Layer 1
  IngestorConfig,
  StreamTradeEvent,
  OrderBookSnapshot,
  PriceLevel,
  WorkerProcessResult,
  AggregatedTradeData,
  VolumeProfile,
  GraduatedToken,

  // Layer 2
  SmcAnalysis,
  MarketStructure,
  OrderBlock,
  FairValueGap,
  LiquidityLevel,
  SwingPoint,
  DynamicScoreResult,
  ScoreWeights,

  // Layer 3
  ForensicAuditResult,
  ContractSecurity,
  WhaleAnalysis,
  WhaleWallet,
  WhaleMovement,

  // Layer 4
  AlphaReport,
  ReasoningChain,

  // Modules
  SmcConvergenceResult,
  LiquidityGrab,
  ManipulationGuardResult,
  ManipulationFlag,
  NarrativeMapResult,
  NarrativeMatch,
  NarrativeDefinition,

  // Optimizer
  OptimizationResult,
  OptimizationBacktest,
  HistoricalPerformance,

  // Engine
  MasterConfig,
  MasterPipelineResult,
  MasterScanSummary,
  IAlphaHunter,
  IDataProvider,
} from './types';
