// ============================================================================
// Hedge Fund Intelligence & Execution System — Domain Types
// ============================================================================

import { CoinData, BinanceKline } from '../types';

// ---------------------------------------------------------------------------
// Technical Trigger (SMA Price Channel)
// ---------------------------------------------------------------------------

export interface PriceChannelState {
  symbol: string;
  highLine: number;
  lowLine: number;
  currentPrice: number;
  isTriggered: boolean;
  klines: BinanceKline[];
}

export interface TriggerConfig {
  highPeriod: number;   // Lookback for highest highs (default: 8)
  lowPeriod: number;    // Lookback for lowest lows (default: 8)
  smaPeriod: number;    // SMA smoothing period (default: 5)
  offset: number;       // Channel offset (default: 0)
}

// ---------------------------------------------------------------------------
// Pillar A: Multi-Factor Alpha
// ---------------------------------------------------------------------------

export interface AlphaFactorResult {
  symbol: string;
  valueScore: number;
  momentumScore: number;
  sentimentScore: number;
  whaleScore: number;
  totalAlphaScore: number;
  details: AlphaDetails;
}

export interface AlphaDetails {
  fdvMcRatio: number;
  tvlMcRatio: number;
  rocVsBtc: number;
  socialVolumeZScore: number;
  netExchangeFlow: number;
}

// ---------------------------------------------------------------------------
// Pillar B: Quantitative Risk Engine
// ---------------------------------------------------------------------------

export interface RiskAssessment {
  symbol: string;
  correlationRisk: CorrelationRisk;
  valueAtRisk: VaRResult;
  securityAudit: SecurityAuditResult;
  overallRiskScore: number;
  isApproved: boolean;
}

export interface CorrelationRisk {
  correlationMatrix: Map<string, number>;
  highCorrelationPairs: string[];
  maxCorrelation: number;
  isSectorOverExposed: boolean;
}

export interface VaRResult {
  var95: number;
  var99: number;
  volatility24h: number;
  maxDrawdown: number;
}

export interface SecurityAuditResult {
  hasMintFunction: boolean;
  isHoneypot: boolean;
  ownershipStatus: 'renounced' | 'active' | 'unknown';
  riskFlags: string[];
  isSecure: boolean;
}

// ---------------------------------------------------------------------------
// Pillar C: Liquidity & Execution
// ---------------------------------------------------------------------------

export interface ExecutionPlan {
  symbol: string;
  orderBookAnalysis: OrderBookAnalysis;
  executionStrategy: ExecutionStrategy;
  routingPlan: RoutingPlan;
}

export interface OrderBookAnalysis {
  bidDepthUsd: number;
  askDepthUsd: number;
  spread: number;
  estimatedSlippage: number;
  isLiquidEnough: boolean;
}

export interface ExecutionStrategy {
  type: 'VWAP' | 'TWAP';
  totalQuantityUsd: number;
  numSlices: number;
  intervalMs: number;
  maxSlippagePct: number;
  slices: ExecutionSlice[];
}

export interface ExecutionSlice {
  index: number;
  targetPrice: number;
  quantityUsd: number;
  exchange: string;
  timestamp: number;
}

export interface RoutingPlan {
  routes: RouteAllocation[];
  primaryExchange: string;
  fallbackExchanges: string[];
}

export interface RouteAllocation {
  exchange: string;
  allocationPct: number;
  estimatedSlippage: number;
  liquidityDepth: number;
}

// ---------------------------------------------------------------------------
// Pillar D: Global Macro Overlay
// ---------------------------------------------------------------------------

export interface MacroState {
  dxy: DxyState;
  fedRate: FedRateState;
  riskMultiplier: number;
  signal: 'GREEN' | 'YELLOW' | 'RED';
  recommendation: string;
}

export interface DxyState {
  current: number;
  sma20: number;
  isBreakout: boolean;
  trend: 'RISING' | 'FALLING' | 'NEUTRAL';
}

export interface FedRateState {
  currentRate: number;
  previousRate: number;
  direction: 'HIKING' | 'CUTTING' | 'HOLDING';
}

// ---------------------------------------------------------------------------
// Module 1: On-Chain Analytics
// ---------------------------------------------------------------------------

export interface OnChainAnalytics {
  symbol: string;
  walletConcentration: WalletConcentration;
  smartMoneyFlow: SmartMoneyFlow;
  unlockSchedule: UnlockScheduleInfo;
  protocolRevenue: ProtocolRevenue;
}

export interface WalletConcentration {
  giniCoefficient: number;
  top10HoldersPct: number;
  top50HoldersPct: number;
  isConcentrated: boolean;
}

export interface SmartMoneyFlow {
  netFlowUsd24h: number;
  smartMoneyBuying: boolean;
  whaleTransactions: number;
  avgWhaleSize: number;
}

export interface UnlockScheduleInfo {
  nextUnlockDate: number | null;
  nextUnlockPct: number;
  totalLockedPct: number;
  unlockRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
}

export interface ProtocolRevenue {
  dailyRevenueUsd: number;
  weeklyRevenueUsd: number;
  revenueMcRatio: number;
  isProfitable: boolean;
}

// ---------------------------------------------------------------------------
// Module 2: Market Microstructure
// ---------------------------------------------------------------------------

export interface MicrostructureAnalysis {
  symbol: string;
  fundingRate: FundingRateAnalysis;
  openInterest: OpenInterestAnalysis;
  liquidationMap: LiquidationHeatmap;
  cvd: CumulativeVolumeDelta;
}

export interface FundingRateAnalysis {
  currentRate: number;
  avgRate8h: number;
  isNegative: boolean;
  squeezePotential: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface OpenInterestAnalysis {
  currentOI: number;
  oiChange24h: number;
  oiChangePct: number;
  isSpike: boolean;
}

export interface LiquidationHeatmap {
  longLiquidationLevels: LiquidationLevel[];
  shortLiquidationLevels: LiquidationLevel[];
  nearestLiquidationPct: number;
}

export interface LiquidationLevel {
  price: number;
  estimatedVolumeUsd: number;
  distancePct: number;
}

export interface CumulativeVolumeDelta {
  delta24h: number;
  deltaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  buyVolumePct: number;
  sellVolumePct: number;
}

// ---------------------------------------------------------------------------
// Module 3: Backtesting & Simulation
// ---------------------------------------------------------------------------

export interface BacktestConfig {
  startDate: number;
  endDate: number;
  initialCapital: number;
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
}

export interface BacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
}

export interface BacktestTrade {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  returnPct: number;
  pnlUsd: number;
  side: 'LONG' | 'SHORT';
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  drawdown: number;
}

export interface MonteCarloResult {
  simulations: number;
  medianReturn: number;
  percentile5: number;
  percentile95: number;
  probabilityOfProfit: number;
  maxDrawdownMedian: number;
  confidenceInterval: { lower: number; upper: number };
}

// ---------------------------------------------------------------------------
// Module 4: Portfolio Management
// ---------------------------------------------------------------------------

export interface PortfolioState {
  positions: Position[];
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  cashBalance: number;
  maxDrawdown: number;
  isCircuitBreakerActive: boolean;
}

export interface Position {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  valueUsd: number;
  pnlUsd: number;
  pnlPct: number;
  allocationPct: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
}

export interface KellyResult {
  kellyFraction: number;
  halfKelly: number;
  recommendedAllocation: number;
  winProbability: number;
  avgWinLossRatio: number;
}

export interface RebalanceAction {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  currentAllocationPct: number;
  targetAllocationPct: number;
  deltaUsd: number;
}

// ---------------------------------------------------------------------------
// Module 5: Real-time Alerts
// ---------------------------------------------------------------------------

export interface AlertConfig {
  telegramBotToken: string | null;
  telegramChatId: string | null;
  discordWebhookUrl: string | null;
  priceAlertThresholdPct: number;
  volumeSpikeMultiplier: number;
  enableWebSocket: boolean;
}

export interface Alert {
  id: string;
  type: AlertType;
  symbol: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  timestamp: number;
  data: Record<string, unknown>;
}

export type AlertType =
  | 'PRICE_SPIKE'
  | 'VOLUME_SPIKE'
  | 'TRIGGER_ACTIVATED'
  | 'STOP_LOSS_HIT'
  | 'TAKE_PROFIT_HIT'
  | 'MACRO_SIGNAL_CHANGE'
  | 'WHALE_MOVEMENT'
  | 'FUNDING_RATE_EXTREME'
  | 'LIQUIDATION_CASCADE';

export interface WebSocketFeed {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
  bidPrice: number;
  askPrice: number;
}

// ---------------------------------------------------------------------------
// Module 6: Narrative/Catalyst Engine
// ---------------------------------------------------------------------------

export interface NarrativeAnalysis {
  symbol: string;
  devActivity: DevActivityMetrics;
  catalysts: CatalystEvent[];
  sectorFlow: SectorRotation;
  narrativeScore: number;
}

export interface DevActivityMetrics {
  weeklyCommits: number;
  monthlyCommits: number;
  contributors: number;
  lastCommitDaysAgo: number;
  isActive: boolean;
}

export interface CatalystEvent {
  type: 'LISTING' | 'PARTNERSHIP' | 'UPGRADE' | 'UNLOCK' | 'AIRDROP' | 'GOVERNANCE';
  description: string;
  date: number | null;
  impactEstimate: 'HIGH' | 'MEDIUM' | 'LOW';
  source: string;
}

export interface SectorRotation {
  sector: string;
  inflowUsd7d: number;
  outflowUsd7d: number;
  netFlow: number;
  trendDirection: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
  sectorRank: number;
}

// ---------------------------------------------------------------------------
// Orchestrator / Pipeline
// ---------------------------------------------------------------------------

export type PipelineStage =
  | 'TRIGGER'
  | 'ALPHA'
  | 'RISK'
  | 'MACRO'
  | 'EXECUTION';

export interface PipelineResult {
  symbol: string;
  coin: CoinData;
  trigger: PriceChannelState;
  alpha: AlphaFactorResult;
  risk: RiskAssessment;
  macro: MacroState;
  execution: ExecutionPlan | null;
  onchain: OnChainAnalytics | null;
  microstructure: MicrostructureAnalysis | null;
  narrative: NarrativeAnalysis | null;
  finalVerdict: 'EXECUTE' | 'HOLD' | 'REJECT';
  rejectionReason: string | null;
  timestamp: number;
}

export interface HedgeFundConfig {
  triggerConfig: TriggerConfig;
  maxCorrelation: number;
  maxSlippagePct: number;
  positionSizeUsd: number;
  maxOpenPositions: number;
  executionType: 'VWAP' | 'TWAP';
  executionSlices: number;
  executionIntervalMs: number;
  macroEnabled: boolean;
}

export interface ScanSummary {
  totalScanned: number;
  triggered: number;
  alphaApproved: number;
  riskApproved: number;
  macroApproved: number;
  executionReady: number;
  results: PipelineResult[];
  macroState: MacroState;
  timestamp: number;
  elapsedMs: number;
}
