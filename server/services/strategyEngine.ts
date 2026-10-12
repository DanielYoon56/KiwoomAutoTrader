import { z } from 'zod';
import { getDb, saveDb, StrategyConfig } from '../db/database.js';
import { MonitoredStock } from './kiwoomService.js';
import { SessionManager, isEntryTimeAllowed, EntryTimeCheckResult } from './sessionManager.js';
import { PaperBroker } from './paperBroker.js';

export const strategyConfigSchema = z.object({
  minExecutionStrength: z.number().min(50, '최소 체결강도는 50% 이상이어야 합니다.').max(500, '체결강도는 500% 이하로 설정해주세요.'),
  minProgramNetBuyKRW: z.number().min(-100_000_000_000).max(100_000_000_000),
  investmentPerStockKRW: z.number().min(100_000, '종목당 투자금은 최소 10만원 이상이어야 합니다.').max(1_000_000_000),
  maxHoldingsCount: z.number().int().min(1, '최대 보유 종목 수는 최소 1개 이상이어야 합니다.').max(50),
  maxTotalInvestmentKRW: z.number().min(100_000).max(10_000_000_000),
  dailyLossLimitKRW: z.number().min(0),
  stopLossRate: z.number().min(-0.30).max(-0.005, '손절률은 음수(-0.5% ~ -30%)여야 합니다.'),
  takeProfitRate: z.number().min(0.005, '익절률은 양수(+0.5% ~ +100%)여야 합니다.').max(1.0),
  pendingOrderTimeoutSec: z.number().int().min(5).max(300),
  autoTradingEnabled: z.boolean(),
  portfolioRiskModel: z.enum(['MODEL_A', 'MODEL_B', 'MODEL_C']).default('MODEL_C'),
  warningLossRate: z.number().min(-0.10).max(0).default(-0.01),
  maxPortfolioLossRate: z.number().min(-0.20).max(0).default(-0.02),
  circuitBreakerTriggered: z.boolean().default(false),
});

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

export interface RiskStatusDetails {
  currentLossKRW: number;
  currentLossRate: number;
  model: 'MODEL_A' | 'MODEL_B' | 'MODEL_C';
  stage: 'NORMAL' | 'WARNING_STEPDOWN' | 'CIRCUIT_BREAKER_LOCKED';
  stageDescription: string;
  effectiveAllocationRatio: number;
  circuitBreakerActive: boolean;
}

export class StrategyEngine {
  private static cachedConfig: StrategyConfig | null = null;

  public static clearCache(): void {
    this.cachedConfig = null;
  }

  public static async getConfig(): Promise<StrategyConfig> {
    if (this.cachedConfig) return this.cachedConfig;
    const db = await getDb();
    const rows = db.exec('SELECT id, minExecutionStrength, minProgramNetBuyKRW, investmentPerStockKRW, maxHoldingsCount, maxTotalInvestmentKRW, dailyLossLimitKRW, stopLossRate, takeProfitRate, pendingOrderTimeoutSec, autoTradingEnabled, portfolioRiskModel, warningLossRate, maxPortfolioLossRate, circuitBreakerTriggered, updatedAt FROM strategy_config WHERE id = 1');
    if (rows.length > 0 && rows[0].values.length > 0) {
      const v = rows[0].values[0];
      this.cachedConfig = {
        id: Number(v[0]),
        minExecutionStrength: Number(v[1]),
        minProgramNetBuyKRW: Number(v[2]),
        investmentPerStockKRW: Number(v[3]),
        maxHoldingsCount: Number(v[4]),
        maxTotalInvestmentKRW: Number(v[5]),
        dailyLossLimitKRW: Number(v[6]),
        stopLossRate: Number(v[7]),
        takeProfitRate: Number(v[8]),
        pendingOrderTimeoutSec: Number(v[9]),
        autoTradingEnabled: Boolean(v[10]),
        portfolioRiskModel: (v[11] ? String(v[11]) : 'MODEL_C') as 'MODEL_A' | 'MODEL_B' | 'MODEL_C',
        warningLossRate: v[12] !== undefined && v[12] !== null ? Number(v[12]) : -0.01,
        maxPortfolioLossRate: v[13] !== undefined && v[13] !== null ? Number(v[13]) : -0.02,
        circuitBreakerTriggered: Boolean(v[14]),
        updatedAt: String(v[15]),
      };
      return this.cachedConfig;
    }
    throw new Error('Strategy configuration not found');
  }

  public static async updateConfig(partial: Partial<StrategyConfig>): Promise<StrategyConfig> {
    const current = await this.getConfig();
    const merged = { ...current, ...partial, updatedAt: new Date().toISOString() };
    const validated = strategyConfigSchema.parse(merged);

    const db = await getDb();
    db.run(
      `UPDATE strategy_config
       SET minExecutionStrength = ?, minProgramNetBuyKRW = ?, investmentPerStockKRW = ?, maxHoldingsCount = ?, maxTotalInvestmentKRW = ?, dailyLossLimitKRW = ?, stopLossRate = ?, takeProfitRate = ?, pendingOrderTimeoutSec = ?, autoTradingEnabled = ?, portfolioRiskModel = ?, warningLossRate = ?, maxPortfolioLossRate = ?, circuitBreakerTriggered = ?, updatedAt = ?
       WHERE id = 1`,
      [
        validated.minExecutionStrength,
        validated.minProgramNetBuyKRW,
        validated.investmentPerStockKRW,
        validated.maxHoldingsCount,
        validated.maxTotalInvestmentKRW,
        validated.dailyLossLimitKRW,
        validated.stopLossRate,
        validated.takeProfitRate,
        validated.pendingOrderTimeoutSec,
        validated.autoTradingEnabled ? 1 : 0,
        validated.portfolioRiskModel,
        validated.warningLossRate,
        validated.maxPortfolioLossRate,
        validated.circuitBreakerTriggered ? 1 : 0,
        merged.updatedAt,
      ]
    );
    saveDb(db);

    this.cachedConfig = { ...merged, ...validated };

    await SessionManager.logAudit('CONFIG', 'UPDATE_STRATEGY_CONFIG', undefined,
      `매매 전략 설정 갱신: 리스크모드=${validated.portfolioRiskModel}, 체결강도>=${validated.minExecutionStrength}%, 순매수>=${(validated.minProgramNetBuyKRW / 1e8).toFixed(1)}억원, 종목당=${(validated.investmentPerStockKRW / 1e4).toLocaleString()}만원, 익절=+${(validated.takeProfitRate * 100).toFixed(1)}%, 손절=${(validated.stopLossRate * 100).toFixed(1)}%`);

    return this.cachedConfig;
  }

  public static async getRiskStatusDetails(): Promise<RiskStatusDetails> {
    const stratConfig = await this.getConfig();
    const summary = await PaperBroker.getAccountSummary();
    const currentLossKRW = summary.totalRealizedPnL + summary.totalUnrealizedPnL;
    const currentLossRate = summary.totalAssetValue > 0 ? (currentLossKRW / summary.totalAssetValue) : 0;

    let stage: 'NORMAL' | 'WARNING_STEPDOWN' | 'CIRCUIT_BREAKER_LOCKED' = 'NORMAL';
    let stageDescription = '정상 운영 (단일 종목 최대 20% 배정, 개별 손절 10%)';
    let effectiveAllocationRatio = 1.0;

    const warningLimit = stratConfig.warningLossRate || -0.01;
    const hardLimit = stratConfig.maxPortfolioLossRate || -0.02;

    if (stratConfig.circuitBreakerTriggered || currentLossRate <= hardLimit) {
      stage = 'CIRCUIT_BREAKER_LOCKED';
      stageDescription = '서킷브레이커 발동 (신규 매수 잠금 & 손실 종목 선별 손절)';
      effectiveAllocationRatio = 0.0;
    } else if (currentLossRate <= warningLimit) {
      stage = 'WARNING_STEPDOWN';
      stageDescription = '1단계 예비경고 (신규 매수 50% 축소 스텝다운 적용 중)';
      effectiveAllocationRatio = 0.5;
    }

    return {
      currentLossKRW,
      currentLossRate,
      model: stratConfig.portfolioRiskModel || 'MODEL_C',
      stage,
      stageDescription,
      effectiveAllocationRatio,
      circuitBreakerActive: Boolean(stratConfig.circuitBreakerTriggered || currentLossRate <= hardLimit),
    };
  }

  /**
   * Pure evaluation function of buy conditions for a single stock against strategy & session settings.
   */
  public static evaluateStockBuyConditions(
    stock: MonitoredStock,
    stratConfig: StrategyConfig,
    sessionResult: EntryTimeCheckResult,
    currentHoldingsCount: number,
    currentTotalInvestedKRW: number,
    alreadyHeldOrPending: boolean
  ): ConditionEvaluationResult {
    const passed: string[] = [];
    const rejected: string[] = [];

    // Condition A: Kiwoom Condition Formula Caught
    const condA = Boolean(stock.inConditionSearch);
    if (condA) {
      passed.push(`조건검색 실시간 포착 (${stock.conditionFormulaName || '조건식 A'})`);
    } else {
      rejected.push(`조건검색 미포착 (${stock.conditionFormulaName || '조건식 A'} 미충족)`);
    }

    // Condition B: Execution Strength >= X
    const condB = stock.executionStrength >= stratConfig.minExecutionStrength;
    if (condB) {
      passed.push(`체결강도 충족 (${stock.executionStrength.toFixed(1)}% >= 기준 ${stratConfig.minExecutionStrength}%)`);
    } else {
      rejected.push(`체결강도 미달 (${stock.executionStrength.toFixed(1)}% < 기준 ${stratConfig.minExecutionStrength}%)`);
    }

    // Condition C: Program Net Buy >= Y (preserving signed integer KRW)
    const condC = stock.programNetBuyKRW >= stratConfig.minProgramNetBuyKRW;
    const netBuyDesc = `${stock.programNetBuyKRW >= 0 ? '+' : ''}${(stock.programNetBuyKRW / 1e8).toFixed(2)}억원`;
    const thresholdDesc = `${stratConfig.minProgramNetBuyKRW >= 0 ? '+' : ''}${(stratConfig.minProgramNetBuyKRW / 1e8).toFixed(2)}억원`;
    if (condC) {
      passed.push(`프로그램 순매수 충족 (${netBuyDesc} >= 기준 ${thresholdDesc})`);
    } else {
      rejected.push(`프로그램 순매수 미달 (${netBuyDesc} < 기준 ${thresholdDesc})`);
    }

    // Condition D: Market data validity and freshness (max 60 seconds)
    const condD = stock.isFresh && stock.freshnessSeconds <= 60 && !isNaN(stock.currentPrice) && stock.currentPrice > 0;
    if (condD) {
      passed.push(`데이터 신선도 양호 (${stock.freshnessSeconds}초 전 갱신)`);
    } else {
      if (!stock.isFresh || stock.freshnessSeconds > 60) {
        rejected.push(`시세 데이터 지연/오래됨 (${stock.freshnessSeconds}초 경과, 허용 60초)`);
      } else {
        rejected.push('비정상 시세 데이터 (가격 누락)');
      }
    }

    // Condition E: Risk management limits (Single stock max 20% of operating capital, Portfolio loss limit 2%)
    const exceedsHoldings = currentHoldingsCount >= stratConfig.maxHoldingsCount;
    const exceedsCapital = (currentTotalInvestedKRW + stratConfig.investmentPerStockKRW) > stratConfig.maxTotalInvestmentKRW;
    const condE = !exceedsHoldings && !exceedsCapital;
    if (condE) {
      passed.push(`위험관리 한도 통과 (보유 ${currentHoldingsCount}/${stratConfig.maxHoldingsCount}종목, 종목당 20% 배정)`);
    } else {
      if (exceedsHoldings) rejected.push(`최대 보유 종목 수 한도 초과 (${currentHoldingsCount}/${stratConfig.maxHoldingsCount}개)`);
      if (exceedsCapital) rejected.push(`총투자금 한도 초과 (예정 ${(currentTotalInvestedKRW + stratConfig.investmentPerStockKRW).toLocaleString()}원 > 한도 ${stratConfig.maxTotalInvestmentKRW.toLocaleString()}원)`);
    }

    // Condition F: No duplicate active position or pending order
    const condF = !alreadyHeldOrPending;
    if (condF) {
      passed.push('중복 포지션/주문 없음');
    } else {
      rejected.push('동일 종목 이미 보유 중이거나 미체결 매수 주문 존재');
    }

    // Condition G: User-defined Trading session allowed
    const condG = sessionResult.allowed;
    if (condG) {
      passed.push(`거래 세션 허용 (${sessionResult.reason})`);
    } else {
      rejected.push(`거래 시간 제한 거부 (${sessionResult.reason})`);
    }

    const matched = condA && condB && condC && condD && condE && condF && condG;

    return {
      stockCode: stock.code,
      stockName: stock.name,
      matched,
      passedConditions: passed,
      rejectedReasons: rejected,
      checks: {
        conditionA_search: condA,
        conditionB_executionStrength: condB,
        conditionC_programNetBuy: condC,
        conditionD_dataFreshness: condD,
        conditionE_riskLimits: condE,
        conditionF_noDuplicate: condF,
        conditionG_sessionTime: condG,
      },
      details: {
        executionStrengthVal: stock.executionStrength,
        executionStrengthThreshold: stratConfig.minExecutionStrength,
        programNetBuyKRWVal: stock.programNetBuyKRW,
        programNetBuyThresholdKRW: stratConfig.minProgramNetBuyKRW,
        freshnessSeconds: stock.freshnessSeconds,
        sessionReason: sessionResult.reason,
      },
    };
  }

  /**
   * Process a single stock: evaluates conditions and executes simulated buy if fully matched.
   */
  public static async processStockSignal(
    stock: MonitoredStock,
    checkDate: Date = new Date()
  ): Promise<ConditionEvaluationResult> {
    const stratConfig = await this.getConfig();
    const sessionConfig = await SessionManager.getConfig();
    const sessionResult = isEntryTimeAllowed(sessionConfig, checkDate);

    const summary = await PaperBroker.getAccountSummary();
    const positions = await PaperBroker.getPositions();
    const db = await getDb();
    const pendingOrders = db.exec(`SELECT id FROM orders WHERE stockCode = ? AND orderType = 'BUY' AND status = 'PENDING'`, [stock.code]);
    const alreadyHeld = positions.some((p) => p.stockCode === stock.code);
    const hasPendingBuy = pendingOrders.length > 0 && pendingOrders[0].values.length > 0;
    const alreadyHeldOrPending = alreadyHeld || hasPendingBuy;

    const currentTotalInvestedKRW = positions.reduce((acc, p) => acc + (p.avgBuyPrice * p.quantity), 0);

    const evalResult = this.evaluateStockBuyConditions(
      stock,
      stratConfig,
      sessionResult,
      positions.length,
      currentTotalInvestedKRW,
      alreadyHeldOrPending
    );

    // Enforce Portfolio Loss Limit check with Model C support
    const totalLoss = summary.totalRealizedPnL + summary.totalUnrealizedPnL;
    const lossRate = summary.totalAssetValue > 0 ? (totalLoss / summary.totalAssetValue) : 0;
    const maxPortfolioLossAllowed = Math.round(summary.totalAssetValue * Math.abs(stratConfig.maxPortfolioLossRate || 0.02)); // 2% of total assets
    const warningLossAllowed = Math.round(summary.totalAssetValue * Math.abs(stratConfig.warningLossRate || 0.01)); // 1% of total assets

    // Check if Circuit Breaker is active
    if (stratConfig.circuitBreakerTriggered) {
      evalResult.matched = false;
      evalResult.checks.conditionE_riskLimits = false;
      evalResult.rejectedReasons.push(
        `[모델C 서킷브레이커 락] 당일 총자산 손실률 2% 한도 도달로 신규 매수가 원천 잠겨 있습니다. (익일 개장 시 자동 해제 또는 수동 재개 필요)`
      );
    } else if (totalLoss <= -maxPortfolioLossAllowed) {
      evalResult.matched = false;
      evalResult.checks.conditionE_riskLimits = false;
      evalResult.rejectedReasons.push(
        `총자산 손실률 한도(총자산의 2%: -${maxPortfolioLossAllowed.toLocaleString()}원) 초과로 신규 매수 전면 차단 (현재 누적 손실: ${totalLoss.toLocaleString()}원)`
      );

      // Trigger Model C Circuit Breaker (cancel pending buys + selectively liquidate negative positions)
      if (stratConfig.portfolioRiskModel === 'MODEL_C') {
        await PaperBroker.triggerModelCCircuitBreaker(
          `총자산 손실률 -2% 한도 도달 (현재 손실: ${totalLoss.toLocaleString()}원 / ${(lossRate * 100).toFixed(2)}%)`
        );
      }
    }

    // Dynamic single stock 20% limit calculation
    const baseStockInvestment20Percent = Math.round(summary.totalAssetValue * 0.20);
    let targetAllocation = Math.min(stratConfig.investmentPerStockKRW, baseStockInvestment20Percent);

    // Model C Stage 1 (Warning & Step-down): if loss is between -1% and -2%, scale order amount by 50%
    let stepDownApplied = false;
    if (stratConfig.portfolioRiskModel === 'MODEL_C' && totalLoss <= -warningLossAllowed && totalLoss > -maxPortfolioLossAllowed) {
      targetAllocation = Math.round(targetAllocation * 0.5); // cut in half (10% of total assets)
      stepDownApplied = true;
      evalResult.passedConditions.push(
        `[모델C 1단계 예비경고] 손실률 ${(lossRate * 100).toFixed(2)}% 도달로 신규 배정금액 50% 축소 (${(targetAllocation / 1e4).toLocaleString()}만원, 총자산의 10%)`
      );
    }

    // If matched and auto trading is enabled, execute paper buy order
    if (evalResult.matched && stratConfig.autoTradingEnabled) {
      await PaperBroker.executePaperBuyOrder({
        stockCode: stock.code,
        stockName: stock.name,
        price: stock.currentPrice,
        investmentAmountKRW: targetAllocation,
        stopLossRate: stratConfig.stopLossRate, // -10.0% (-0.10)
        takeProfitRate: stratConfig.takeProfitRate,
        reason: `[자동매수신호] ${stepDownApplied ? '모델C 1단계 50% 감축 배정' : '운용자산 20% 배정'} (${(targetAllocation / 1e4).toLocaleString()}만원), 체결강도 ${stock.executionStrength.toFixed(1)}%, 순매수 +${(stock.programNetBuyKRW / 1e8).toFixed(1)}억원`,
      });
    }

    return evalResult;
  }
}
