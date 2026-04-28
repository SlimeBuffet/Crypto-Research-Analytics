// ============================================================================
// Hedge Fund Intelligence & Execution System Types
// ============================================================================

import { CoinData } from './index';

// ---------------------------------------------------------------------------
// Trigger Unit — SMA Price Channel
// ---------------------------------------------------------------------------

export interface KlineCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceChannelResult {
  symbol: string;
  currentPrice: number;
  highLine: number;
  lowLine: number;
  isInInflowState: boolean;
  channelWidth: number;
  priceAboveHighPct: number;
}

// ---------------------------------------------------------------------------
// Pillar A — Multi-Factor Alpha (The Brain)
// ---------------------------------------------------------------------------

export interface AlphaAnalysis {
  valueScore: number;
  momentumScore: number;
  sentimentScore: number;
  whaleInflowScore: number;
  totalAlphaScore: number;
  details: AlphaDetails;
}

export interface AlphaDetails {
  fdvMcRatio: number;
  tvlMcRatio: number;
  rocVsBtc: number;
  socialVolumeZScore: number;
  netExchangeInflow: number;
}

// ---------------------------------------------------------------------------
// Pillar B — Quantitative Risk Engine (The Shield)
// ---------------------------------------------------------------------------

export interface RiskAnalysis {
  correlationRisk: number;
  valueAtRisk: number;
  securityAudit: SecurityAuditResult;
  totalRiskScore: number;
  approved: boolean;
  rejectReason: string | null;
}

export interface SecurityAuditResult {
  hasMintFunction: boolean;
  isHoneypot: boolean;
  ownershipRenounced: boolean;
  score: number;
  flags: string[];
}

export interface CorrelationEntry {
  symbolA: string;
  symbolB: string;
  correlation: number;
}

// ---------------------------------------------------------------------------
// Pillar C — Liquidity & Execution (The Sword)
// ---------------------------------------------------------------------------

export interface LiquidityAnalysis {
  orderBookDepth: OrderBookDepth;
  estimatedSlippage: number;
  recommendedStrategy: 'VWAP' | 'TWAP' | 'ICEBERG' | 'MARKET';
  smartRoute: SmartRoute;
  executable: boolean;
}

export interface OrderBookDepth {
  bidDepthUsd: number;
  askDepthUsd: number;
  spreadPct: number;
  impactFor100k: number;
  impactFor500k: number;
}

export interface SmartRoute {
  primaryVenue: string;
  splitRatio: Record<string, number>;
  estimatedFillPrice: number;
  estimatedSlippage: number;
}

export interface VwapParams {
  totalQuantity: number;
  durationMinutes: number;
  intervalMinutes: number;
  maxSlippagePct: number;
}

export interface TwapParams {
  totalQuantity: number;
  durationMinutes: number;
  numSlices: number;
  randomization: number;
}

// ---------------------------------------------------------------------------
// Pillar D — Global Macro Overlay (The Compass)
// ---------------------------------------------------------------------------

export interface MacroAnalysis {
  dxyLevel: number;
  dxyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  dxyBreakout: boolean;
  fedRateLevel: number;
  fedRateTrend: 'HAWKISH' | 'DOVISH' | 'NEUTRAL';
  riskMultiplier: number;
  signal: 'GREEN' | 'YELLOW' | 'RED';
  rationale: string;
}

// ---------------------------------------------------------------------------
// Combined output
// ---------------------------------------------------------------------------

export interface HedgeFundSignal {
  coin: CoinData;
  trigger: PriceChannelResult;
  alpha: AlphaAnalysis;
  risk: RiskAnalysis;
  liquidity: LiquidityAnalysis;
  macro: MacroAnalysis;
  finalVerdict: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'REJECT';
  compositeScore: number;
  positionSizePct: number;
  timestamp: number;
}

export interface HedgeFundConfig {
  smaHighPeriod: number;
  smaLowPeriod: number;
  smaSmoothPeriod: number;
  correlationThreshold: number;
  maxSlippagePct: number;
  varConfidenceLevel: number;
  maxPositionSizePct: number;
  dxyBreakoutThreshold: number;
}
