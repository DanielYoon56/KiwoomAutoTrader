import { describe, it, expect, beforeEach } from 'vitest';
import { isEntryTimeAllowed, sessionConfigSchema, SessionManager, TradingSessionConfig } from '../server/services/sessionManager.js';
import { StrategyEngine } from '../server/services/strategyEngine.js';
import { RealOrderAdapter, MonitoredStock } from '../server/services/kiwoomService.js';
import { PaperBroker } from '../server/services/paperBroker.js';
import { getDb } from '../server/db/database.js';

describe('PHASE 1.1 — User-Defined Trading Session & Strategy Engine Tests', () => {
  const baseConfig: TradingSessionConfig = {
    id: 1,
    enabled: true,
    startTime: '09:00',
    endTime: '15:20',
    timezone: 'Asia/Seoul',
    cancelPendingEntryOrdersAtEnd: true,
    blockNewEntryOutside: true,
    updatedAt: new Date().toISOString(),
  };

  // Helper to construct a Wednesday (non-weekend) in KST at a specific hour:minute:second
  function createKstWednesday(hour: number, minute: number, second: number): Date {
    // 2026-10-14 is a Wednesday
    // UTC time = KST time - 9 hours
    return new Date(Date.UTC(2026, 9, 14, hour - 9, minute, second));
  }

  // Helper to construct a Saturday (weekend)
  function createKstSaturday(hour: number, minute: number, second: number): Date {
    // 2026-10-17 is a Saturday
    return new Date(Date.UTC(2026, 9, 17, hour - 9, minute, second));
  }

  it('1. 08:59:59 KST - Rejects new entry buy orders before session start time', () => {
    const timeBeforeStart = createKstWednesday(8, 59, 59);
    const result = isEntryTimeAllowed(baseConfig, timeBeforeStart);

    expect(result.allowed).toBe(false);
    expect(result.sessionState).toBe('PRE_SESSION');
    expect(result.kstTimeString).toBe('08:59:59');
    expect(result.reason).toContain('거래 시작 시각(09:00:00) 이전에는 신규 매수가 금지됩니다');
  });

  it('2. 09:00:00 KST - Allows new entry buy orders exactly at session start time', () => {
    const timeAtStart = createKstWednesday(9, 0, 0);
    const result = isEntryTimeAllowed(baseConfig, timeAtStart);

    expect(result.allowed).toBe(true);
    expect(result.sessionState).toBe('OPEN_SESSION');
    expect(result.kstTimeString).toBe('09:00:00');
    expect(result.reason).toContain('신규 매수 허용');
  });

  it('3. 15:19:59 KST - Allows new entry buy orders right before session end time', () => {
    const timeJustBeforeEnd = createKstWednesday(15, 19, 59);
    const result = isEntryTimeAllowed(baseConfig, timeJustBeforeEnd);

    expect(result.allowed).toBe(true);
    expect(result.sessionState).toBe('OPEN_SESSION');
    expect(result.kstTimeString).toBe('15:19:59');
  });

  it('4. 15:20:00 KST - Rejects new entry buy orders at and after session end time', () => {
    const timeAtEnd = createKstWednesday(15, 20, 0);
    const result = isEntryTimeAllowed(baseConfig, timeAtEnd);

    expect(result.allowed).toBe(false);
    expect(result.sessionState).toBe('POST_SESSION');
    expect(result.kstTimeString).toBe('15:20:00');
    expect(result.reason).toContain('거래 종료 시각(15:20:00) 이후에는 신규 매수가 차단됩니다');
  });

  it('5. Disabled session restrictions (enabled: false) still enforces exchange market operating hours (09:00~15:30)', () => {
    const disabledConfig: TradingSessionConfig = {
      ...baseConfig,
      enabled: false,
    };

    // Before market open (08:30:00 KST) -> REJECTED
    const preMarket = createKstWednesday(8, 30, 0);
    const preResult = isEntryTimeAllowed(disabledConfig, preMarket);
    expect(preResult.allowed).toBe(false);
    expect(preResult.reason).toContain('한국거래소 정규장 운영시간(09:00~15:30) 외에는 신규 매수가 불가합니다');

    // During market hours (10:00:00 KST) -> ALLOWED
    const duringMarket = createKstWednesday(10, 0, 0);
    const duringResult = isEntryTimeAllowed(disabledConfig, duringMarket);
    expect(duringResult.allowed).toBe(true);
    expect(duringResult.sessionState).toBe('OPEN_SESSION');

    // After market close (15:35:00 KST) -> REJECTED
    const postMarket = createKstWednesday(15, 35, 0);
    const postResult = isEntryTimeAllowed(disabledConfig, postMarket);
    expect(postResult.allowed).toBe(false);
  });

  it('6. Rejects weekend market hours (Saturday/Sunday)', () => {
    const weekendTime = createKstSaturday(10, 30, 0);
    const result = isEntryTimeAllowed(baseConfig, weekendTime);
    expect(result.allowed).toBe(false);
    expect(result.sessionState).toBe('RESTRICTED');
    expect(result.reason).toContain('거래소 휴장일(주말: 토요일)');
  });

  it('7. Rejects invalid times and identical start/end times via Zod schema', () => {
    // Identical start & end
    const invalidSame = {
      enabled: true,
      startTime: '09:30',
      endTime: '09:30',
      timezone: 'Asia/Seoul' as const,
      cancelPendingEntryOrdersAtEnd: true,
      blockNewEntryOutside: true,
    };
    expect(() => sessionConfigSchema.parse(invalidSame)).toThrow('종료 시각은 시작 시각보다 늦어야 합니다');

    // Inverted time (e.g. 15:00 to 09:00)
    const invalidInverted = {
      ...invalidSame,
      startTime: '15:00',
      endTime: '09:00',
    };
    expect(() => sessionConfigSchema.parse(invalidInverted)).toThrow('종료 시각은 시작 시각보다 늦어야 합니다');

    // Malformed format
    const malformed = {
      ...invalidSame,
      startTime: '9:0',
      endTime: '15:20',
    };
    expect(() => sessionConfigSchema.parse(malformed)).toThrow('시작 시각은 HH:mm 형식이어야 합니다');
  });

  it('8. Persistence check in SQLite: updates survive and are retrieved accurately', async () => {
    const db = await getDb();
    expect(db).toBeDefined();

    const updated = await SessionManager.updateConfig({
      startTime: '09:15',
      endTime: '15:10',
      cancelPendingEntryOrdersAtEnd: true,
    });

    expect(updated.startTime).toBe('09:15');
    expect(updated.endTime).toBe('15:10');

    // Fetch fresh
    const fresh = await SessionManager.getConfig();
    expect(fresh.startTime).toBe('09:15');
    expect(fresh.endTime).toBe('15:10');

    // Restore back to default
    await SessionManager.updateConfig({
      startTime: '09:00',
      endTime: '15:20',
    });
  });

  it('9. Session end auto-cancels pending BUY orders when cancelPendingEntryOrdersAtEnd is enabled', async () => {
    const db = await getDb();
    const orderId = `TEST-BUY-PENDING-${Date.now()}`;
    const now = new Date().toISOString();

    // Insert simulated pending buy order
    db.run(
      `INSERT INTO orders (id, stockCode, stockName, orderType, price, quantity, status, reason, createdAt, updatedAt)
       VALUES (?, '005930', '삼성전자', 'BUY', 70000, 10, 'PENDING', '테스트 미체결 주문', ?, ?)`,
      [orderId, now, now]
    );

    const cancelledCount = await SessionManager.cancelAllPendingEntryOrders('세션 종료 테스트 취소');
    expect(cancelledCount).toBeGreaterThanOrEqual(1);

    // Verify order status is CANCELLED in DB
    const rows = db.exec(`SELECT status, reason FROM orders WHERE id = ?`, [orderId]);
    expect(rows[0].values[0][0]).toBe('CANCELLED');
    expect(rows[0].values[0][1]).toBe('세션 종료 테스트 취소');
  });

  it('10. Existing held positions risk management (SL / TP) remains active after session end', async () => {
    await PaperBroker.resetAccount(50000000);

    // Buy a stock in PaperBroker
    const buyRes = await PaperBroker.executePaperBuyOrder({
      stockCode: '005930',
      stockName: '삼성전자',
      price: 70000,
      investmentAmountKRW: 2000000,
      stopLossRate: -0.025, // Stop Loss at 68,250
      takeProfitRate: 0.040, // Take Profit at 72,800
      reason: '포지션 위험관리 테스트 매수',
    });
    expect(buyRes.success).toBe(true);

    const positions = await PaperBroker.getPositions();
    expect(positions.length).toBe(1);
    expect(positions[0].stockCode).toBe('005930');

    // Simulate price falling below stop-loss price (68,000 <= 68,250)
    // Even if trading session is post-session, stop loss MUST execute!
    await PaperBroker.monitorPositionsRisk({ '005930': 68000 });

    const positionsAfter = await PaperBroker.getPositions();
    expect(positionsAfter.length).toBe(0); // Position safely closed!

    const orders = await PaperBroker.getOrders();
    const sellOrder = orders.find((o) => o.stockCode === '005930' && o.orderType === 'SELL');
    expect(sellOrder).toBeDefined();
    expect(sellOrder?.reason).toContain('손절가 도달');
  });

  it('11. Strategy conditions test: rejects low execution strength, program sell, and stale data', () => {
    const stratConfig = {
      id: 1,
      minExecutionStrength: 105.0,
      minProgramNetBuyKRW: 500_000_000,
      investmentPerStockKRW: 2_000_000,
      maxHoldingsCount: 5,
      maxTotalInvestmentKRW: 10_000_000,
      dailyLossLimitKRW: 500_000,
      stopLossRate: -0.025,
      takeProfitRate: 0.040,
      pendingOrderTimeoutSec: 30,
      autoTradingEnabled: true,
      portfolioRiskModel: 'MODEL_C' as const,
      warningLossRate: -0.01,
      maxPortfolioLossRate: -0.02,
      circuitBreakerTriggered: false,
      updatedAt: new Date().toISOString(),
    };

    const sessionCheck = {
      allowed: true,
      reason: '세션 내',
      sessionState: 'OPEN_SESSION' as const,
      kstTimeString: '10:00:00',
      kstDateString: '2026-10-14',
      dayOfWeek: 3,
    };

    // Test A: Execution strength < 105%
    const lowChegangStock: MonitoredStock = {
      code: '005930',
      name: '삼성전자',
      currentPrice: 70000,
      changeRate: 0.5,
      executionStrength: 98.2, // Below 105
      programNetBuyRaw: 600,
      programNetBuyUnit: '백만원',
      programNetBuyKRW: 600_000_000,
      inConditionSearch: true,
      conditionFormulaName: '수급주',
      updatedAt: new Date().toISOString(),
      isFresh: true,
      freshnessSeconds: 5,
    };
    const resA = StrategyEngine.evaluateStockBuyConditions(lowChegangStock, stratConfig, sessionCheck, 0, 0, false);
    expect(resA.matched).toBe(false);
    expect(resA.rejectedReasons.some((r) => r.includes('체결강도 미달'))).toBe(true);

    // Test B: Negative program net buy (Institutional selling)
    const progSellStock: MonitoredStock = {
      ...lowChegangStock,
      executionStrength: 110.0,
      programNetBuyRaw: -250, // Negative!
      programNetBuyKRW: -250_000_000,
    };
    const resB = StrategyEngine.evaluateStockBuyConditions(progSellStock, stratConfig, sessionCheck, 0, 0, false);
    expect(resB.matched).toBe(false);
    expect(resB.rejectedReasons.some((r) => r.includes('프로그램 순매수 미달'))).toBe(true);

    // Test C: Stale data (> 60s)
    const staleStock: MonitoredStock = {
      ...lowChegangStock,
      executionStrength: 112.0,
      programNetBuyKRW: 700_000_000,
      isFresh: false,
      freshnessSeconds: 95,
    };
    const resC = StrategyEngine.evaluateStockBuyConditions(staleStock, stratConfig, sessionCheck, 0, 0, false);
    expect(resC.matched).toBe(false);
    expect(resC.rejectedReasons.some((r) => r.includes('시세 데이터 지연'))).toBe(true);
  });

  it('12. Guaranteed Real Order Safety Barrier: Real order API execution throws error and cannot be called', () => {
    expect(() => {
      RealOrderAdapter.executeRealOrder();
    }).toThrow('FATAL_SECURITY_LOCK: Real account order execution is strictly disabled');
  });

  it('13. Enforce 20% Single Stock Limit: Order amount is strictly capped at 20% of total operating assets', async () => {
    const { resetTradingToGroundZero } = await import('../server/db/database.js');
    await resetTradingToGroundZero();

    const summary = await PaperBroker.getAccountSummary();
    const maxStock20Percent = Math.round(summary.totalAssetValue * 0.20);
    expect(maxStock20Percent).toBe(10_000_000); // 20% of 50M = 10,000,000 KRW

    const buyRes = await PaperBroker.executePaperBuyOrder({
      stockCode: '005380',
      stockName: '현대차',
      price: 250000,
      investmentAmountKRW: 20_000_000, // Requested 20M, but must be capped at 10M
      stopLossRate: -0.10, // -10% stop loss
      takeProfitRate: 0.05,
      reason: '20% 한도 테스트',
    });

    expect(buyRes.success).toBe(true);
    const positions = await PaperBroker.getPositions();
    const hyundai = positions.find((p) => p.stockCode === '005380');
    expect(hyundai).toBeDefined();
    // 10,000,000 / 250,000 = 40 shares max!
    expect(hyundai!.quantity).toBeLessThanOrEqual(40);
  });

  it('14. Enforce 2% Portfolio Loss Limit: All new buys are blocked if total loss reaches 2% of assets', async () => {
    const db = await getDb();
    // Artificially simulate 1.5M loss (> 2% of 50M = 1.0M)
    db.run('UPDATE broker_account SET realizedPnL = -1500000 WHERE id = 1');

    const summary = await PaperBroker.getAccountSummary();
    const totalLoss = summary.totalRealizedPnL + summary.totalUnrealizedPnL;
    expect(totalLoss).toBeLessThan(-1_000_000);

    const buyAttempt = await PaperBroker.executePaperBuyOrder({
      stockCode: '035420',
      stockName: 'NAVER',
      price: 180000,
      investmentAmountKRW: 5_000_000,
      stopLossRate: -0.10,
      takeProfitRate: 0.05,
      reason: '손실한도 초과 테스트',
    });

    expect(buyAttempt.success).toBe(false);
    expect(buyAttempt.error).toContain('총자산 손실률 한도');
  });

  it('15. Ground Zero Reset: Successfully resets trading state to clean 50,000,000 KRW capital', async () => {
    const { resetTradingToGroundZero } = await import('../server/db/database.js');
    await resetTradingToGroundZero();

    const summary = await PaperBroker.getAccountSummary();
    expect(summary.initialCash).toBe(50_000_000);
    expect(summary.currentCash).toBe(50_000_000);
    expect(summary.totalRealizedPnL).toBe(0);
    expect(summary.holdingsCount).toBe(0);

    const positions = await PaperBroker.getPositions();
    expect(positions.length).toBe(0);

    const orders = await PaperBroker.getOrders();
    expect(orders.length).toBe(0);
  });

  it('16. Model C Stage 1 Step-down: Allocation cuts from 20% to 10% when loss reaches warning level (-1.0% to -2.0%)', async () => {
    const { resetTradingToGroundZero } = await import('../server/db/database.js');
    await resetTradingToGroundZero();
    const db = await getDb();

    // Set realized PnL to -600,000 KRW (-1.2% of 50M, between warning -1% and hard -2%)
    db.run('UPDATE broker_account SET realizedPnL = -600000 WHERE id = 1');

    const riskDetails = await StrategyEngine.getRiskStatusDetails();
    expect(riskDetails.stage).toBe('WARNING_STEPDOWN');
    expect(riskDetails.effectiveAllocationRatio).toBe(0.5);

    // Prepare a mock stock that satisfies conditions
    const testStock = {
      code: '005930',
      name: '삼성전자',
      currentPrice: 70000,
      changeRate: 1.5,
      executionStrength: 125,
      programNetBuyKRW: 800_000_000,
      isFresh: true,
      freshnessSeconds: 5,
      inConditionSearch: true,
      conditionFormulaName: '조건식 A',
      exchangeName: 'KOSPI',
    };

    const sessionAllowed = new Date('2026-10-12T10:00:00+09:00');
    StrategyEngine.clearCache();
    const evalRes = await StrategyEngine.processStockSignal(testStock as any, sessionAllowed);

    expect(evalRes.matched).toBe(true);
    expect(evalRes.passedConditions.some((p) => p.includes('모델C 1단계 예비경고'))).toBe(true);

    // Verify bought quantity is calculated using 5,000,000 KRW (10% allocation) instead of 10,000,000 KRW (20%)
    const positions = await PaperBroker.getPositions();
    const samsung = positions.find((p) => p.stockCode === '005930');
    expect(samsung).toBeDefined();
    // 5,000,000 / 70,000 = ~71 shares (definitely less than 100 shares)
    expect(samsung!.quantity).toBeLessThanOrEqual(72);
  });

  it('17. Model C Stage 2 Circuit Breaker & Selective Exit: Liquidates losing positions and protects profitable positions', async () => {
    const db = await getDb();
    // Add a profitable position (+50,000 KRW)
    db.run(
      `INSERT INTO positions (stockCode, stockName, quantity, avgBuyPrice, currentPrice, boughtAt, stopLossPrice, takeProfitPrice, entryReason)
       VALUES ('000660', 'SK하이닉스', 10, 100000, 110000, datetime('now'), 90000, 120000, '수익 포지션')`
    );
    // Add a losing position (-50,000 KRW)
    db.run(
      `INSERT INTO positions (stockCode, stockName, quantity, avgBuyPrice, currentPrice, boughtAt, stopLossPrice, takeProfitPrice, entryReason)
       VALUES ('035420', 'NAVER', 10, 200000, 190000, datetime('now'), 180000, 220000, '손실 포지션')`
    );

    const positionsBefore = await PaperBroker.getPositions();
    expect(positionsBefore.some((p) => p.stockCode === '000660')).toBe(true);
    expect(positionsBefore.some((p) => p.stockCode === '035420')).toBe(true);

    // Trigger Model C Circuit Breaker
    const cbResult = await PaperBroker.triggerModelCCircuitBreaker('테스트 -2% 서킷브레이커');
    expect(cbResult.liquidatedPositions.some((p) => p.includes('NAVER'))).toBe(true);
    expect(cbResult.retainedPositions.some((p) => p.includes('SK하이닉스'))).toBe(true);

    const positionsAfter = await PaperBroker.getPositions();
    // NAVER (losing) should be liquidated
    expect(positionsAfter.some((p) => p.stockCode === '035420')).toBe(false);
    // SK하이닉스 (profitable) should remain retained!
    expect(positionsAfter.some((p) => p.stockCode === '000660')).toBe(true);
  });
});
