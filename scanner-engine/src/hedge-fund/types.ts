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
