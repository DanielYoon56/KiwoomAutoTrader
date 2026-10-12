export interface TradingSessionConfig {
  id: number;
  enabled: boolean;
  startTime: string; // "09:00"
  endTime: string;   // "15:20"
  timezone: string;  // "Asia/Seoul"
  cancelPendingEntryOrdersAtEnd: boolean;
  blockNewEntryOutside: boolean;
  updatedAt: string;
}

export interface EntryTimeCheckResult {
  allowed: boolean;
  reason: string;
  sessionState: 'PRE_SESSION' | 'OPEN_SESSION' | 'POST_SESSION' | 'RESTRICTED' | 'DISABLED';
  kstTimeString: string;
  kstDateString: string;
  dayOfWeek: number;
}

export type PortfolioRiskModel = 'MODEL_A' | 'MODEL_B' | 'MODEL_C';

export interface StrategyConfig {
  id: number;
  minExecutionStrength: number;
  minProgramNetBuyKRW: number;
  investmentPerStockKRW: number;
  maxHoldingsCount: number;
  maxTotalInvestmentKRW: number;
  dailyLossLimitKRW: number;
  stopLossRate: number;
  takeProfitRate: number;
  pendingOrderTimeoutSec: number;
  autoTradingEnabled: boolean;
  portfolioRiskModel: PortfolioRiskModel;
  warningLossRate: number;        // e.g. -0.01 (-1.0%)
  maxPortfolioLossRate: number;   // e.g. -0.02 (-2.0%)
  circuitBreakerTriggered: boolean;
  updatedAt: string;
}

export interface RiskStatusDetails {
  currentLossKRW: number;
  currentLossRate: number;
  model: PortfolioRiskModel;
  stage: 'NORMAL' | 'WARNING_STEPDOWN' | 'CIRCUIT_BREAKER_LOCKED';
  stageDescription: string;
  effectiveAllocationRatio: number; // 1.0 (20%) or 0.5 (10%) or 0.0 (0%)
  circuitBreakerActive: boolean;
}

export interface Position {
  stockCode: string;
  stockName: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  evaluatedAmount: number;
  unrealizedPnL: number;
  returnRate: number;
  boughtAt: string;
  stopLossPrice: number;
  takeProfitPrice: number;
  entryReason: string;
}

export interface Order {
  id: string;
  stockCode: string;
  stockName: string;
  orderType: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  reason: string;
  createdAt: string;
  updatedAt: string;
  filledAt?: string;
  filledPrice?: number;
}

export interface BrokerAccountSummary {
  initialCash: number;
  currentCash: number;
  totalStockValue: number;
  totalAssetValue: number;
  totalUnrealizedPnL: number;
  totalRealizedPnL: number;
  unrealizedReturnRate: number;
  holdingsCount: number;
  feeRate: number;
  taxRate: number;
  slippageRate: number;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  category: 'SESSION' | 'ENTRY' | 'EXIT' | 'ORDER' | 'RISK' | 'CONFIG' | 'SYSTEM';
  action: string;
  stockCode?: string;
  details: string;
}

export interface ConditionEvaluationResult {
  stockCode: string;
  stockName: string;
  matched: boolean;
  passedConditions: string[];
  rejectedReasons: string[];
  checks: {
    conditionA_search: boolean;
    conditionB_executionStrength: boolean;
    conditionC_programNetBuy: boolean;
    conditionD_dataFreshness: boolean;
    conditionE_riskLimits: boolean;
    conditionF_noDuplicate: boolean;
    conditionG_sessionTime: boolean;
  };
  details: {
    executionStrengthVal: number;
    executionStrengthThreshold: number;
    programNetBuyKRWVal: number;
    programNetBuyThresholdKRW: number;
    freshnessSeconds: number;
    sessionReason: string;
  };
}

export interface MonitoredStockItem {
  code: string;
  name: string;
  currentPrice: number;
  changeRate: number;
  executionStrength: number;
  programNetBuyRaw: number;
  programNetBuyUnit: string;
  programNetBuyKRW: number;
  inConditionSearch: boolean;
  conditionFormulaName: string;
  caughtFormulas?: string[];
  updatedAt: string;
  isFresh: boolean;
  freshnessSeconds: number;
  evaluation?: ConditionEvaluationResult | null;
  activeScenario?: string;
}

export interface ConditionFormula {
  id: string;
  name: string;
  screenNo: string; // e.g. "0150", "0151"
  description: string;
  enabled: boolean;
  matchedCount: number;
}
