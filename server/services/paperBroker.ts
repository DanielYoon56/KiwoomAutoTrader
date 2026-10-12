import { getDb, saveDb, Position, Order, StrategyConfig } from '../db/database.js';
import { SessionManager } from './sessionManager.js';

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

export class PaperBroker {
  private static slippageRate = 0.0005; // 0.05%
  private static feeRate = 0.00015;     // 0.015%
  private static taxRate = 0.0018;      // 0.18%

  public static async getAccountSummary(): Promise<BrokerAccountSummary> {
    const db = await getDb();
    const acctRows = db.exec('SELECT initialCash, currentCash, realizedPnL, feeRate, taxRate, slippageRate FROM broker_account WHERE id = 1');
    let currentCash = 50000000;
    let initialCash = 50000000;
    let realizedPnL = 0;

    if (acctRows.length > 0 && acctRows[0].values.length > 0) {
      const v = acctRows[0].values[0];
      initialCash = Number(v[0]);
      currentCash = Number(v[1]);
      realizedPnL = Number(v[2]);
    }

    const positions = await this.getPositions();
    let totalStockValue = 0;
    let totalUnrealizedPnL = 0;

    for (const pos of positions) {
      totalStockValue += pos.currentPrice * pos.quantity;
      totalUnrealizedPnL += (pos.currentPrice - pos.avgBuyPrice) * pos.quantity;
    }

    const totalAssetValue = currentCash + totalStockValue;
    const unrealizedReturnRate = totalStockValue > 0 ? (totalUnrealizedPnL / (totalStockValue - totalUnrealizedPnL)) : 0;

    return {
      initialCash,
      currentCash,
      totalStockValue,
      totalAssetValue,
      totalUnrealizedPnL,
      totalRealizedPnL: realizedPnL,
      unrealizedReturnRate,
      holdingsCount: positions.length,
      feeRate: this.feeRate,
      taxRate: this.taxRate,
      slippageRate: this.slippageRate,
    };
  }

  public static async getPositions(): Promise<Position[]> {
    const db = await getDb();
    const rows = db.exec(`SELECT stockCode, stockName, quantity, avgBuyPrice, currentPrice, boughtAt, stopLossPrice, takeProfitPrice, entryReason FROM positions`);
    if (rows.length === 0) return [];

    return rows[0].values.map((v) => {
      const quantity = Number(v[2]);
      const avgBuyPrice = Number(v[3]);
      const currentPrice = Number(v[4]);
      const evaluatedAmount = currentPrice * quantity;
      const unrealizedPnL = (currentPrice - avgBuyPrice) * quantity;
      const returnRate = avgBuyPrice > 0 ? (currentPrice - avgBuyPrice) / avgBuyPrice : 0;

      return {
        stockCode: String(v[0]),
        stockName: String(v[1]),
        quantity,
        avgBuyPrice,
        currentPrice,
        evaluatedAmount,
        unrealizedPnL,
        returnRate,
        boughtAt: String(v[5]),
        stopLossPrice: Number(v[6]),
        takeProfitPrice: Number(v[7]),
        entryReason: String(v[8]),
      };
    });
  }

  public static async getOrders(): Promise<Order[]> {
    const db = await getDb();
    const rows = db.exec(`SELECT id, stockCode, stockName, orderType, price, quantity, status, reason, createdAt, updatedAt, filledAt, filledPrice FROM orders ORDER BY createdAt DESC LIMIT 100`);
    if (rows.length === 0) return [];

    return rows[0].values.map((v) => ({
      id: String(v[0]),
      stockCode: String(v[1]),
      stockName: String(v[2]),
      orderType: v[3] as 'BUY' | 'SELL',
      price: Number(v[4]),
      quantity: Number(v[5]),
      status: v[6] as 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED',
      reason: String(v[7]),
      createdAt: String(v[8]),
      updatedAt: String(v[9]),
      filledAt: v[10] ? String(v[10]) : undefined,
      filledPrice: v[11] ? Number(v[11]) : undefined,
    }));
  }

  /**
   * Executes a simulated BUY order for Paper Trading.
   */
  public static async executePaperBuyOrder(params: {
    stockCode: string;
    stockName: string;
    price: number;
    investmentAmountKRW: number;
    stopLossRate: number;
    takeProfitRate: number;
    reason: string;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    const db = await getDb();
    const summary = await this.getAccountSummary();

    if (params.price <= 0) {
      return { success: false, error: '유효하지 않은 주문 가격입니다.' };
    }

    // Check if position already held
    const existing = db.exec(`SELECT stockCode FROM positions WHERE stockCode = ?`, [params.stockCode]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return { success: false, error: '동일 종목을 이미 보유 중입니다.' };
    }

    // Check if pending buy order exists
    const pending = db.exec(`SELECT id FROM orders WHERE stockCode = ? AND orderType = 'BUY' AND status = 'PENDING'`, [params.stockCode]);
    if (pending.length > 0 && pending[0].values.length > 0) {
      return { success: false, error: '동일 종목의 활성 미체결 매수 주문이 이미 존재합니다.' };
    }

    // Enforce portfolio loss limit: 2% of total asset value
    const totalLoss = summary.totalRealizedPnL + summary.totalUnrealizedPnL;
    const maxPortfolioLossAllowed = Math.round(summary.totalAssetValue * 0.02); // 2%
    if (totalLoss < -maxPortfolioLossAllowed) {
      return {
        success: false,
        error: `총자산 손실률 한도(총자산의 2%: -${maxPortfolioLossAllowed.toLocaleString()}원) 초과로 신규 매수 전면 차단 (현재 누적 손실: ${totalLoss.toLocaleString()}원)`,
      };
    }

    // Enforce single stock limit: strictly 20% of total operating assets
    const maxSingleStockAmount = Math.round(summary.totalAssetValue * 0.20);
    const effectiveInvestmentKRW = Math.min(params.investmentAmountKRW, maxSingleStockAmount);

    const calculatedQty = Math.floor(effectiveInvestmentKRW / params.price);
    if (calculatedQty <= 0) {
      return { success: false, error: `주문 가능 수량이 0주입니다. (주가: ${params.price.toLocaleString()}원 > 배정금액: ${effectiveInvestmentKRW.toLocaleString()}원)` };
    }

    // Apply slippage model (buyer pays slightly higher price)
    const executionPrice = Math.round(params.price * (1 + this.slippageRate));
    const grossTotal = executionPrice * calculatedQty;
    const fees = Math.round(grossTotal * this.feeRate);
    const requiredCash = grossTotal + fees;

    if (summary.currentCash < requiredCash) {
      return { success: false, error: `예수금 부족 (필요: ${requiredCash.toLocaleString()}원, 보유: ${summary.currentCash.toLocaleString()}원)` };
    }

    const orderId = `PB-BUY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    const stopLossPrice = Math.round(executionPrice * (1 + params.stopLossRate)); // -10% stop loss
    const takeProfitPrice = Math.round(executionPrice * (1 + params.takeProfitRate));

    // Save order as FILLED (PaperBroker immediate or fast simulation)
    db.run(
      `INSERT INTO orders (id, stockCode, stockName, orderType, price, quantity, status, reason, createdAt, updatedAt, filledAt, filledPrice)
       VALUES (?, ?, ?, 'BUY', ?, ?, 'FILLED', ?, ?, ?, ?, ?)`,
      [orderId, params.stockCode, params.stockName, executionPrice, calculatedQty, params.reason, now, now, now, executionPrice]
    );

    // Create position
    db.run(
      `INSERT INTO positions (stockCode, stockName, quantity, avgBuyPrice, currentPrice, boughtAt, stopLossPrice, takeProfitPrice, entryReason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [params.stockCode, params.stockName, calculatedQty, executionPrice, executionPrice, now, stopLossPrice, takeProfitPrice, params.reason]
    );

    // Deduct cash from broker account
    const remainingCash = summary.currentCash - requiredCash;
    db.run(`UPDATE broker_account SET currentCash = ?, updatedAt = ? WHERE id = 1`, [remainingCash, now]);

    saveDb(db);

    await SessionManager.logAudit('ORDER', 'PAPER_BUY_FILLED', params.stockCode, 
      `[모의매수체결] ${params.stockName}(${params.stockCode}) ${calculatedQty}주 @ ${executionPrice.toLocaleString()}원 (슬리피지: ${(this.slippageRate * 100).toFixed(2)}%, 수수료: ${fees.toLocaleString()}원)`);

    return { success: true, orderId };
  }

  /**
   * Executes a simulated SELL order (Stop Loss, Take Profit, or manual exit).
   */
  public static async executePaperSellOrder(params: {
    stockCode: string;
    currentPrice: number;
    reason: string;
  }): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    const posRows = db.exec(`SELECT stockCode, stockName, quantity, avgBuyPrice FROM positions WHERE stockCode = ?`, [params.stockCode]);
    if (posRows.length === 0 || posRows[0].values.length === 0) {
      return { success: false, error: '보유하지 않은 종목입니다.' };
    }

    const [stockCode, stockName, qtyNum, avgBuyNum] = posRows[0].values[0];
    const quantity = Number(qtyNum);
    const avgBuyPrice = Number(avgBuyNum);

    // Apply sell slippage (seller gets slightly lower price)
    const executionPrice = Math.round(params.currentPrice * (1 - this.slippageRate));
    const grossTotal = executionPrice * quantity;
    const fees = Math.round(grossTotal * this.feeRate);
    const taxes = Math.round(grossTotal * this.taxRate);
    const netProceeds = grossTotal - fees - taxes;

    const investedCost = avgBuyPrice * quantity;
    const realizedPnL = netProceeds - investedCost;
    const returnRate = (realizedPnL / investedCost) * 100;

    const orderId = `PB-SELL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    // Insert SELL order
    db.run(
      `INSERT INTO orders (id, stockCode, stockName, orderType, price, quantity, status, reason, createdAt, updatedAt, filledAt, filledPrice)
       VALUES (?, ?, ?, 'SELL', ?, ?, 'FILLED', ?, ?, ?, ?, ?)`,
      [orderId, String(stockCode), String(stockName), executionPrice, quantity, params.reason, now, now, now, executionPrice]
    );

    // Remove position
    db.run(`DELETE FROM positions WHERE stockCode = ?`, [stockCode]);

    // Update broker account cash and realized PnL
    const summary = await this.getAccountSummary();
    const updatedCash = summary.currentCash + netProceeds;
    const updatedRealizedPnL = summary.totalRealizedPnL + realizedPnL;

    db.run(
      `UPDATE broker_account SET currentCash = ?, realizedPnL = ?, updatedAt = ? WHERE id = 1`,
      [updatedCash, updatedRealizedPnL, now]
    );

    saveDb(db);

    await SessionManager.logAudit('EXIT', 'PAPER_SELL_FILLED', String(stockCode), 
      `[모의매도체결] ${stockName} ${quantity}주 @ ${executionPrice.toLocaleString()}원 | 실현손익: ${realizedPnL >= 0 ? '+' : ''}${realizedPnL.toLocaleString()}원 (${returnRate.toFixed(2)}%) | 사유: ${params.reason}`);

    return { success: true };
  }

  /**
   * Updates current prices of held positions and checks SL/TP rules.
   * Runs even when trading session entry window has closed!
   */
  public static async monitorPositionsRisk(latestPrices: Record<string, number>): Promise<void> {
    const db = await getDb();
    const positions = await this.getPositions();
    if (positions.length === 0) return;

    for (const pos of positions) {
      const newPrice = latestPrices[pos.stockCode];
      if (!newPrice) continue;

      // Update current price in DB
      db.run(`UPDATE positions SET currentPrice = ? WHERE stockCode = ?`, [newPrice, pos.stockCode]);

      // Check Stop Loss (-10%)
      if (newPrice <= pos.stopLossPrice) {
        await this.executePaperSellOrder({
          stockCode: pos.stockCode,
          currentPrice: newPrice,
          reason: `단일종목 손절가 도달 (${newPrice.toLocaleString()}원 <= 손절 기준 ${pos.stopLossPrice.toLocaleString()}원, 손절률 10%)`,
        });
        continue;
      }

      // Check Take Profit (+5%)
      if (newPrice >= pos.takeProfitPrice) {
        await this.executePaperSellOrder({
          stockCode: pos.stockCode,
          currentPrice: newPrice,
          reason: `익절가 도달 (${newPrice.toLocaleString()}원 >= 익절 기준 ${pos.takeProfitPrice.toLocaleString()}원)`,
        });
        continue;
      }
    }

    saveDb(db);

    // Check portfolio loss for Model C Circuit Breaker
    const summary = await this.getAccountSummary();
    const totalLoss = summary.totalRealizedPnL + summary.totalUnrealizedPnL;
    const maxPortfolioLossAllowed = Math.round(summary.totalAssetValue * 0.02);

    if (totalLoss <= -maxPortfolioLossAllowed) {
      const stratRows = db.exec(`SELECT portfolioRiskModel, circuitBreakerTriggered FROM strategy_config WHERE id = 1`);
      if (stratRows.length > 0 && stratRows[0].values.length > 0) {
        const model = String(stratRows[0].values[0][0]);
        const alreadyTriggered = Boolean(stratRows[0].values[0][1]);
        if (model === 'MODEL_C' && !alreadyTriggered) {
          await this.triggerModelCCircuitBreaker(`총자산 손실률 -2% 한도 도달 (누적손실: ${totalLoss.toLocaleString()}원 / 한도 -${maxPortfolioLossAllowed.toLocaleString()}원)`);
        }
      }
    }
  }

  /**
   * Model C Circuit Breaker:
   * 1. Cancels all pending BUY orders immediately
   * 2. Selectively liquidates only loss-making positions (unrealizedPnL < 0)
   * 3. Retains profit-making positions to let profits run with TP/SL
   * 4. Locks new buys until reset
   */
  public static async triggerModelCCircuitBreaker(reason: string = '총자산 손실률 2% 한도 도달'): Promise<{
    cancelledOrdersCount: number;
    liquidatedPositions: string[];
    retainedPositions: string[];
  }> {
    const db = await getDb();
    const now = new Date().toISOString();

    // 1. Cancel all pending BUY orders
    const pendingBuys = db.exec(`SELECT id, stockCode, stockName FROM orders WHERE orderType = 'BUY' AND status = 'PENDING'`);
    let cancelledOrdersCount = 0;
    if (pendingBuys.length > 0 && pendingBuys[0].values.length > 0) {
      for (const row of pendingBuys[0].values) {
        const orderId = String(row[0]);
        db.run(`UPDATE orders SET status = 'CANCELLED', reason = ?, updatedAt = ? WHERE id = ?`,
          [`[모델C 서킷브레이커] ${reason}`, now, orderId]
        );
        cancelledOrdersCount++;
      }
    }

    // 2. Selectively exit loss-making positions
    const positions = await this.getPositions();
    const liquidatedPositions: string[] = [];
    const retainedPositions: string[] = [];

    for (const pos of positions) {
      if (pos.unrealizedPnL < 0) {
        await this.executePaperSellOrder({
          stockCode: pos.stockCode,
          currentPrice: pos.currentPrice,
          reason: `[모델C 긴급방어] 손실 종목 선별 청산 (${reason}, 손익률: ${(pos.returnRate * 100).toFixed(2)}%)`,
        });
        liquidatedPositions.push(`${pos.stockName}(${pos.stockCode})`);
      } else {
        retainedPositions.push(`${pos.stockName}(${pos.stockCode})`);
      }
    }

    // 3. Mark circuitBreakerTriggered in strategy_config
    db.run(`UPDATE strategy_config SET circuitBreakerTriggered = 1, updatedAt = ? WHERE id = 1`, [now]);
    saveDb(db);

    await SessionManager.logAudit(
      'RISK',
      'MODEL_C_CIRCUIT_BREAKER_TRIGGERED',
      undefined,
      `[모델 C 서킷브레이커 발동] ${reason} | 미체결 취소: ${cancelledOrdersCount}건 | 선별 손절: ${liquidatedPositions.length}종목 [${liquidatedPositions.join(', ') || '없음'}] | 수익 유지: ${retainedPositions.length}종목 [${retainedPositions.join(', ') || '없음'}]`
    );

    return {
      cancelledOrdersCount,
      liquidatedPositions,
      retainedPositions,
    };
  }

  public static async resetCircuitBreaker(): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    db.run(`UPDATE strategy_config SET circuitBreakerTriggered = 0, updatedAt = ? WHERE id = 1`, [now]);
    saveDb(db);
    await SessionManager.logAudit('RISK', 'RESET_CIRCUIT_BREAKER', undefined, '서킷브레이커 잠금 해제: 신규 매수 재허용');
  }

  public static async resetAccount(initialCash: number = 50000000): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    db.run(`DELETE FROM positions`);
    db.run(`DELETE FROM orders`);
    db.run(
      `UPDATE broker_account SET initialCash = ?, currentCash = ?, realizedPnL = 0, updatedAt = ? WHERE id = 1`,
      [initialCash, initialCash, now]
    );
    saveDb(db);

    await SessionManager.logAudit('RISK', 'RESET_SIMULATOR', undefined, `모의계좌 초기화 (초기 예수금: ${initialCash.toLocaleString()}원)`);
  }
}
