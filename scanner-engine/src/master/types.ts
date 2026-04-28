// ============================================================================
// Master Level Architecture — Domain Types
// "Sentient Pipeline" — From Data Fetcher to Autonomous Alpha Engine
// ============================================================================

import { CoinData } from '../types';

// ---------------------------------------------------------------------------
// Layer 1: The Ingestor (Stream-First)
// ---------------------------------------------------------------------------

/** Configuration for the WebSocket stream ingestor */
export interface IngestorConfig {
  binanceWsUrl: string;
  heliusRpcUrl: string | null;
  maxStreams: number;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
}

/** Raw trade event from WebSocket stream */
export interface StreamTradeEvent {
  symbol: string;
  price: number;
  quantity: number;
  timestamp: number;
  isBuyerMaker: boolean;
  tradeId: number;
}

/** Aggregated order book snapshot */
export interface OrderBookSnapshot {
  symbol: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  timestamp: number;
  imbalanceRatio: number;
}

export interface PriceLevel {
  price: number;
  quantity: number;
  totalUsd: number;
}

/** Result from worker thread processing */
export interface WorkerProcessResult {
  symbol: string;
  aggregatedTrades: AggregatedTradeData;
  orderBookImbalance: number;
  volumeProfile: VolumeProfile;
  processedAt: number;
}

export interface AggregatedTradeData {
  buyVolume: number;
  sellVolume: number;
  netDelta: number;
  tradeCount: number;
  avgTradeSize: number;
  largeTradeCount: number;
  vwap: number;
}

export interface VolumeProfile {
  highVolumeNodes: number[];
  lowVolumeNodes: number[];
  pointOfControl: number;
  valueAreaHigh: number;
  valueAreaLow: number;
}

/** Graduated token detected from Solana (Helius RPC) */
export interface GraduatedToken {
  mintAddress: string;
  symbol: string;
  name: string;
  graduatedAt: number;
  initialLiquidity: number;
  currentMarketCap: number;
  source: 'helius' | 'dexscreener';
}

// ---------------------------------------------------------------------------
// Layer 2: The Pattern Brain (SMC & Liquidity)
// ---------------------------------------------------------------------------

/** Smart Money Concepts analysis result */
export interface SmcAnalysis {
  symbol: string;
  marketStructure: MarketStructure;
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  liquidityLevels: LiquidityLevel[];
  smcScore: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/** Market structure analysis (MSS detection) */
export interface MarketStructure {
  currentTrend: 'BULLISH' | 'BEARISH' | 'RANGING';
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  mssDetected: boolean;
  mssType: 'BULLISH_MSS' | 'BEARISH_MSS' | null;
  mssPrice: number | null;
  mssTimestamp: number | null;
  breakOfStructure: boolean;
}

export interface SwingPoint {
  price: number;
  timestamp: number;
  index: number;
  isValid: boolean;
}

/** Order Block detection */
export interface OrderBlock {
  type: 'BULLISH_OB' | 'BEARISH_OB';
  highPrice: number;
  lowPrice: number;
  midPrice: number;
  timestamp: number;
  timeframe: string;
  isMitigated: boolean;
  strength: number;
  touchCount: number;
}

/** Fair Value Gap (imbalance) */
export interface FairValueGap {
  type: 'BULLISH_FVG' | 'BEARISH_FVG';
  highPrice: number;
  lowPrice: number;
  gapSize: number;
  gapPercentage: number;
  timestamp: number;
  timeframe: string;
  isFilled: boolean;
  fillPercentage: number;
}

/** Liquidity levels (equal highs/lows, stop hunts) */
export interface LiquidityLevel {
  type: 'BUY_SIDE' | 'SELL_SIDE';
  price: number;
  strength: number;
  touchCount: number;
  isSwept: boolean;
  sweepTimestamp: number | null;
}

/** Dynamic scoring with correlation penalty */
export interface DynamicScoreResult {
  rawScore: number;
  volatilityAdjustedScore: number;
  correlationPenalty: number;
  finalScore: number;
  formula: string;
  weights: ScoreWeights;
}

export interface ScoreWeights {
  liquidity: number;
  tokenomics: number;
  marketCap: number;
  momentum: number;
  onChain: number;
  smc: number;
  forensic: number;
  narrative: number;
}

// ---------------------------------------------------------------------------
// Layer 3: The Forensic Shield (Security Engine)
// ---------------------------------------------------------------------------

/** Full forensic audit result */
export interface ForensicAuditResult {
  symbol: string;
  contractSecurity: ContractSecurity;
  whaleAnalysis: WhaleAnalysis;
  manipulationScore: number;
  overallRiskLevel: 'SAFE' | 'CAUTION' | 'DANGER' | 'CRITICAL';
  riskFlags: string[];
  isApproved: boolean;
}

/** Smart contract security analysis */
export interface ContractSecurity {
  hasMintFunction: boolean;
  hasProxyContract: boolean;
  isLiquidityLocked: boolean;
  liquidityLockDuration: number | null;
  ownershipStatus: 'RENOUNCED' | 'ACTIVE' | 'MULTI_SIG' | 'UNKNOWN';
  honeypotRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  taxBuy: number;
  taxSell: number;
  isOpenSource: boolean;
  auditStatus: 'AUDITED' | 'PARTIAL' | 'UNAUDITED' | 'UNKNOWN';
  riskFlags: string[];
}

/** Whale wallet concentration analysis */
export interface WhaleAnalysis {
  top10HoldersPct: number;
  top10NonExchangePct: number;
  isConcentrated: boolean;
  whaleWallets: WhaleWallet[];
  concentrationRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  recentWhaleMovements: WhaleMovement[];
}

export interface WhaleWallet {
  address: string;
  balancePct: number;
  isExchange: boolean;
  label: string | null;
}

export interface WhaleMovement {
  fromAddress: string;
  toAddress: string;
  amountUsd: number;
  timestamp: number;
  type: 'ACCUMULATION' | 'DISTRIBUTION' | 'TRANSFER';
}

// ---------------------------------------------------------------------------
// Layer 4: The Agentic Orchestrator (LLM Reasoning)
// ---------------------------------------------------------------------------

/** AI-generated alpha report */
export interface AlphaReport {
  symbol: string;
  verdict: 'ULTRA_GEM' | 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID';
  confidence: number;
  narrative: string;
  reasoning: ReasoningChain;
  catalysts: string[];
  risks: string[];
  timestamp: number;
}

/** Chain-of-thought reasoning for the verdict */
export interface ReasoningChain {
  marketContext: string;
  technicalAnalysis: string;
  fundamentalAnalysis: string;
  securityAssessment: string;
  narrativeFit: string;
  finalConclusion: string;
}

// ---------------------------------------------------------------------------
// Module: Smart Money Convergence (SMC Score)
// ---------------------------------------------------------------------------

/** Liquidity grab / sweep detection */
export interface SmcConvergenceResult {
  symbol: string;
  liquidityGrabs: LiquidityGrab[];
  convergenceScore: number;
  isUltraGem: boolean;
  institutionalSignal: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
}

export interface LiquidityGrab {
  type: 'LONG_SQUEEZE' | 'SHORT_SQUEEZE';
  sweepPrice: number;
  rejectionPrice: number;
  rejectionStrength: number;
  timestamp: number;
  volumeSpike: number;
  isConfirmed: boolean;
}

// ---------------------------------------------------------------------------
// Module: Anti-Manipulation Guard
// ---------------------------------------------------------------------------

/** Wash trading / manipulation detection */
export interface ManipulationGuardResult {
  symbol: string;
  volumeMcRatio: number;
  volumeAnomalyScore: number;
  priceVolumeCorrelation: number;
  washTradingProbability: number;
  isManipulated: boolean;
  manipulationFlags: ManipulationFlag[];
  adjustedScore: number;
}

export interface ManipulationFlag {
  type: 'WASH_TRADING' | 'SPOOFING' | 'PUMP_AND_DUMP' | 'ARTIFICIAL_VOLUME' | 'CIRCULAR_TRADING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Module: Automated Narrative Mapper
// ---------------------------------------------------------------------------

/** Narrative mapping result */
export interface NarrativeMapResult {
  symbol: string;
  matchedNarratives: NarrativeMatch[];
  narrativeScore: number;
  trendingBoost: number;
  adjustedNarrativeScore: number;
}

export interface NarrativeMatch {
  narrative: string;
  relevanceScore: number;
  trendingScore: number;
  keywords: string[];
  isTrending: boolean;
}

/** Known narrative definitions */
export interface NarrativeDefinition {
  id: string;
  name: string;
  keywords: string[];
  relatedSectors: string[];
  weight: number;
  isTrending: boolean;
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// Module: Auto-Optimization
// ---------------------------------------------------------------------------

/** Weight optimization result */
export interface OptimizationResult {
  previousWeights: ScoreWeights;
  optimizedWeights: ScoreWeights;
  improvement: number;
  backtestResults: OptimizationBacktest;
  appliedAt: number;
}

export interface OptimizationBacktest {
  totalCoinsAnalyzed: number;
  winnersCorrectlyIdentified: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/** Historical coin performance for optimization */
export interface HistoricalPerformance {
  symbol: string;
  entryPrice: number;
  peakPrice: number;
  currentPrice: number;
  maxReturn: number;
  is10x: boolean;
  scoreAtEntry: number;
  weightsAtEntry: ScoreWeights;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Master Scanner Engine
// ---------------------------------------------------------------------------

/** Configuration for the MasterScannerEngine */
export interface MasterConfig {
  ingestor: IngestorConfig;
  enableSmc: boolean;
  enableForensics: boolean;
  enableNarrative: boolean;
  enableAntiManipulation: boolean;
  enableAutoOptimization: boolean;
  enableAgentic: boolean;
  smcTimeframes: string[];
  forensicMinMarketCap: number;
  optimizationIntervalMs: number;
  weights: ScoreWeights;
}

/** Complete master pipeline result for a single coin */
export interface MasterPipelineResult {
  symbol: string;
  coin: CoinData;
  smcAnalysis: SmcAnalysis | null;
  forensicAudit: ForensicAuditResult | null;
  smcConvergence: SmcConvergenceResult | null;
  manipulationGuard: ManipulationGuardResult | null;
  narrativeMap: NarrativeMapResult | null;
  alphaReport: AlphaReport | null;
  dynamicScore: DynamicScoreResult;
  finalVerdict: 'ULTRA_GEM' | 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID';
  timestamp: number;
}

/** Summary of the full master scan */
export interface MasterScanSummary {
  totalScanned: number;
  passedSmc: number;
  passedForensic: number;
  passedManipulation: number;
  ultraGems: number;
  strongBuys: number;
  results: MasterPipelineResult[];
  optimizationApplied: boolean;
  scanDurationMs: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Enhanced: Benford's Law Analysis (Anti-Manipulation)
// ---------------------------------------------------------------------------

export interface BenfordsLawResult {
  chiSquared: number;
  pValue: number;
  isSuspicious: boolean;
  observedDistribution: number[];
  expectedDistribution: number[];
}

export interface SpreadVarianceResult {
  meanSpread: number;
  spreadVariance: number;
  spreadAnomalyScore: number;
  isAnomalous: boolean;
}

export interface HighFreqVolumeSpike {
  timestamp: number;
  volumeChange: number;
  priceChange: number;
  isSuspected: boolean;
  timeframeMinutes: number;
}

// ---------------------------------------------------------------------------
// Enhanced: GoPlus SDK + DeBank (Forensic Shield)
// ---------------------------------------------------------------------------

export interface GoPlusTokenSecurity {
  isOpenSource: boolean;
  isProxy: boolean;
  isMintable: boolean;
  canTakeBackOwnership: boolean;
  ownerChangeBalance: boolean;
  hiddenOwner: boolean;
  selfDestruct: boolean;
  externalCall: boolean;
  isAntiWhale: boolean;
  tradingCooldown: boolean;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
  personalSlippageModifiable: boolean;
  cannotBuy: boolean;
  cannotSellAll: boolean;
  buyTax: number;
  sellTax: number;
  holderCount: number;
  totalSupply: string;
  creatorAddress: string;
  creatorPercent: number;
  ownerAddress: string;
  ownerPercent: number;
  lpHolders: GoPlusLpHolder[];
  dexInfo: GoPlusDexInfo[];
}

export interface GoPlusLpHolder {
  address: string;
  tag: string | null;
  isContract: boolean;
  balance: number;
  percent: number;
  isLocked: boolean;
  lockedDetail: Array<{ amount: string; endTime: string; optTime: string }>;
}

export interface GoPlusDexInfo {
  name: string;
  liquidity: string;
  pair: string;
}

export interface DeBankWhaleProfile {
  address: string;
  totalUsdValue: number;
  tokenHoldings: DeBankTokenHolding[];
  chainDistribution: Record<string, number>;
  lastActiveAt: number;
}

export interface DeBankTokenHolding {
  symbol: string;
  amount: number;
  usdValue: number;
  percentage: number;
}

export interface CrossValidationResult {
  dexScreenerData: { liquidity: number; volume24h: number; pairAddress: string } | null;
  mobulaData: { liquidity: number; volume24h: number; marketCap: number } | null;
  isConsistent: boolean;
  discrepancyPct: number;
  validatedSource: 'dexscreener' | 'mobula' | 'both' | 'neither';
}

// ---------------------------------------------------------------------------
// Enhanced: Vectorized SMC Computation
// ---------------------------------------------------------------------------

export interface VectorizedOHLC {
  opens: Float64Array;
  highs: Float64Array;
  lows: Float64Array;
  closes: Float64Array;
  volumes: Float64Array;
  timestamps: Float64Array;
  length: number;
}

// ---------------------------------------------------------------------------
// Enhanced: Piscina Worker Thread Pool
// ---------------------------------------------------------------------------

export interface WorkerTaskPayload {
  type: 'smc_analysis' | 'forensic_audit' | 'manipulation_check' | 'narrative_map';
  symbol: string;
  data: unknown;
}

export interface WorkerTaskResult {
  type: string;
  symbol: string;
  result: unknown;
  durationMs: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Enhanced: Real-time News Pipeline (Narrative Mapper)
// ---------------------------------------------------------------------------

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  content: string;
  relevanceScore: number;
}

export interface VectorEmbedding {
  vector: number[];
  magnitude: number;
}

export interface SemanticMatch {
  narrative: string;
  cosineSimilarity: number;
  matchedArticles: string[];
  confidence: number;
}

// ---------------------------------------------------------------------------
// Enhanced: ElizaOS Agentic Orchestrator
// ---------------------------------------------------------------------------

export interface ElizaCharacter {
  name: string;
  role: string;
  personality: string[];
  instructions: string[];
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  minRiskRewardRatio: number;
}

export interface ElizaDecision {
  decision: 'BUY' | 'SELL' | 'HOLD' | 'AVOID';
  reasoning: string;
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
  confidence: number;
  investment_thesis: string;
  catalysts: string[];
  risks: string[];
  position_sizing: number;
  timestamp: number;
}

export interface ElizaPluginReport {
  pluginName: string;
  symbol: string;
  findings: string[];
  score: number;
  recommendation: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  rawData: unknown;
}

export interface ReActStep {
  thought: string;
  action: string;
  observation: string;
  timestamp: number;
}

export interface ReActTrace {
  steps: ReActStep[];
  finalDecision: ElizaDecision;
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Enhanced: BTC Gate for Master Scoring
// ---------------------------------------------------------------------------

export interface BtcGateResult {
  btcPrice: number;
  btcChange24h: number;
  btcChange7d: number;
  btcTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  gateValue: number;
  isGateOpen: boolean;
}

export interface MasterScoreResult {
  smcScore: number;
  narrativeScore: number;
  securityScore: number;
  riskVolatility: number;
  btcGate: number;
  rawScore: number;
  finalScore: number;
  formula: string;
  weights: { w1: number; w2: number; w3: number };
}

/** IAlphaHunter interface for extensibility */
export interface IAlphaHunter {
  readonly id: string;
  analyze(ticker: string): Promise<AlphaReport>;
}

/** IDataProvider interface for adapter abstraction */
export interface IDataProvider {
  readonly name: string;
  readonly priority: number;
  isAvailable(): boolean;
  fetchMarketData(symbols: string[]): Promise<Map<string, Partial<CoinData>>>;
}
