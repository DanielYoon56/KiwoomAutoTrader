import { Router, Request, Response } from 'express';
import { SessionManager, isEntryTimeAllowed, sessionConfigSchema } from '../services/sessionManager.js';
import { StrategyEngine, strategyConfigSchema } from '../services/strategyEngine.js';
import { PaperBroker } from '../services/paperBroker.js';
import { MarketFeedManager } from '../services/marketFeed.js';
import { KIWOOM_API_SPECS, RealOrderAdapter } from '../services/kiwoomService.js';
import { getDb, resetTradingToGroundZero } from '../db/database.js';
import { RealQuoteService } from '../services/realQuoteService.js';

export const apiRouter = Router();

// 1. System Status
apiRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const sessionConfig = await SessionManager.getConfig();
    const strategyConfig = await StrategyEngine.getConfig();
    const sessionCheck = await SessionManager.checkEntryAllowed();
    const account = await PaperBroker.getAccountSummary();
    const riskStatus = await StrategyEngine.getRiskStatusDetails();

    res.json({
      success: true,
      data: {
        serverType: 'KIWOOM_MOCK_REST_API', // 모의투자 전용
        isMockMode: true,
        realOrderAllowed: false,
        autoTradingEnabled: strategyConfig.autoTradingEnabled,
        session: {
          config: sessionConfig,
          check: sessionCheck,
        },
        account,
        riskStatus,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/risk/reset-circuit-breaker', async (_req: Request, res: Response) => {
  try {
    await PaperBroker.resetCircuitBreaker();
    const riskStatus = await StrategyEngine.getRiskStatusDetails();
    res.json({ success: true, message: '서킷브레이커가 해제되었습니다.', riskStatus });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Trading Session Configuration
apiRouter.get('/session', async (_req: Request, res: Response) => {
  try {
    const config = await SessionManager.getConfig();
    const check = await SessionManager.checkEntryAllowed();
    res.json({ success: true, config, check });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.put('/session', async (req: Request, res: Response) => {
  try {
    const updated = await SessionManager.updateConfig(req.body);
    const check = await SessionManager.checkEntryAllowed();
    res.json({ success: true, config: updated, check });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.errors ? error.errors.map((e: any) => e.message).join(', ') : error.message,
    });
  }
});

// 3. Strategy Configuration
apiRouter.get('/strategy', async (_req: Request, res: Response) => {
  try {
    const config = await StrategyEngine.getConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.put('/strategy', async (req: Request, res: Response) => {
  try {
    const updated = await StrategyEngine.updateConfig(req.body);
    res.json({ success: true, config: updated });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.errors ? error.errors.map((e: any) => e.message).join(', ') : error.message,
    });
  }
});

apiRouter.post('/strategy/toggle', async (req: Request, res: Response) => {
  try {
    const current = await StrategyEngine.getConfig();
    const nextState = req.body.enabled !== undefined ? Boolean(req.body.enabled) : !current.autoTradingEnabled;
    const updated = await StrategyEngine.updateConfig({ autoTradingEnabled: nextState });
    
    await SessionManager.logAudit('RISK', nextState ? 'AUTO_TRADING_RESUMED' : 'AUTO_TRADING_PAUSED', undefined,
      `자동매매 상태 변경: ${nextState ? '실행중 (ON)' : '일시정지 (OFF)'}`);

    res.json({ success: true, autoTradingEnabled: updated.autoTradingEnabled });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Monitored Stocks & Condition Evaluations
apiRouter.get('/stocks', async (_req: Request, res: Response) => {
  try {
    const stocks = MarketFeedManager.getMonitoredStocks();
    const evaluations = MarketFeedManager.getEvaluationResults();
    const evalMap = new Map(evaluations.map((e) => [e.stockCode, e]));

    const combined = stocks.map((s) => ({
      ...s,
      evaluation: evalMap.get(s.code) || null,
    }));

    res.json({
      success: true,
      stocks: combined,
      lastSyncTime: MarketFeedManager.getLastRealQuoteSyncTime(),
      formulas: MarketFeedManager.getConditionFormulas(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/conditions', (_req: Request, res: Response) => {
  try {
    const formulas = MarketFeedManager.getConditionFormulas();
    const mode = MarketFeedManager.getCombinationMode();
    res.json({ success: true, formulas, mode });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/conditions/mode', async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;
    if (mode !== 'OR' && mode !== 'AND') {
      return res.status(400).json({ success: false, error: 'mode must be OR or AND' });
    }
    const updatedMode = await MarketFeedManager.setCombinationMode(mode);
    res.json({ success: true, mode: updatedMode });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/conditions/formula-toggle', async (req: Request, res: Response) => {
  try {
    const { formulaId, enabled } = req.body;
    if (!formulaId) {
      return res.status(400).json({ success: false, error: 'formulaId required' });
    }
    const formulas = await MarketFeedManager.toggleFormulaEnabled(formulaId, Boolean(enabled));
    res.json({ success: true, formulas });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/conditions/stock-formula-toggle', async (req: Request, res: Response) => {
  try {
    const { stockCode, formulaId, inCatch } = req.body;
    if (!stockCode || !formulaId) {
      return res.status(400).json({ success: false, error: 'stockCode and formulaId required' });
    }
    const updated = await MarketFeedManager.toggleStockFormulaCatch(stockCode, formulaId, Boolean(inCatch));
    res.json({ success: true, stock: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/conditions/toggle', async (req: Request, res: Response) => {
  try {
    const { code, inSearch } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: '종목코드가 필요합니다.' });
    }
    const updated = await MarketFeedManager.toggleConditionSearch(code, Boolean(inSearch));
    res.json({ success: true, stock: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/quotes/sync', async (_req: Request, res: Response) => {
  try {
    await MarketFeedManager.syncRealMarketQuotes();
    res.json({
      success: true,
      message: '실제 국내 시장 실주가 동기화 완료',
      lastSyncTime: MarketFeedManager.getLastRealQuoteSyncTime(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/stocks/inject', async (req: Request, res: Response) => {
  try {
    const { code, overrides } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: '종목코드가 필요합니다.' });
    }
    const result = await MarketFeedManager.injectStockScenario(code, overrides);
    res.json({ success: true, stock: result.stock, evaluation: result.evaluation });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/stocks/clear-lock', (req: Request, res: Response) => {
  const { code } = req.body;
  if (code) {
    MarketFeedManager.clearScenarioLock(code);
  }
  res.json({ success: true });
});

apiRouter.get('/stocks/search', (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '');
    const results = RealQuoteService.searchStocks(q);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/stocks/add', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: '종목코드가 필요합니다.' });
    }
    const stock = await MarketFeedManager.addStockToWatchlist(code);
    if (!stock) {
      return res.status(404).json({ success: false, error: `종목코드 ${code}의 실시간 시세를 찾을 수 없습니다.` });
    }
    res.json({ success: true, stock });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.delete('/stocks/:code', (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const removed = MarketFeedManager.removeStockFromWatchlist(code);
    res.json({ success: removed });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Positions & Account
apiRouter.get('/positions', async (_req: Request, res: Response) => {
  try {
    const positions = await PaperBroker.getPositions();
    res.json({ success: true, positions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/positions/close', async (req: Request, res: Response) => {
  try {
    const { stockCode, currentPrice, reason } = req.body;
    const result = await PaperBroker.executePaperSellOrder({
      stockCode,
      currentPrice: Number(currentPrice) || 1,
      reason: reason || '사용자 수동 청산',
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/orders', async (_req: Request, res: Response) => {
  try {
    const orders = await PaperBroker.getOrders();
    res.json({ success: true, orders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.get('/account', async (_req: Request, res: Response) => {
  try {
    const account = await PaperBroker.getAccountSummary();
    res.json({ success: true, account });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/account/reset', async (req: Request, res: Response) => {
  try {
    const initialCash = req.body.initialCash ? Number(req.body.initialCash) : 50000000;
    await PaperBroker.resetAccount(initialCash);
    res.json({ success: true, message: '모의투자 계좌가 성공적으로 초기화되었습니다.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/account/ground-zero-reset', async (_req: Request, res: Response) => {
  try {
    await resetTradingToGroundZero();
    StrategyEngine.clearCache();
    const account = await PaperBroker.getAccountSummary();
    const stratConfig = await StrategyEngine.getConfig();
    res.json({
      success: true,
      message: '매매 실적 데이타가 원점으로 리셋되었습니다. (기초자본금 5,000만원, 종목당 20% 한도, 총자산 손실한도 2%, 단일종목 손절 10%)',
      account,
      strategyConfig: stratConfig,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Audit Logs
apiRouter.get('/logs', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const category = req.query.category as string | undefined;
    const query = category
      ? `SELECT id, timestamp, category, action, stockCode, details FROM audit_logs WHERE category = ? ORDER BY id DESC LIMIT 200`
      : `SELECT id, timestamp, category, action, stockCode, details FROM audit_logs ORDER BY id DESC LIMIT 200`;
    const params = category ? [category] : [];

    const rows = db.exec(query, params);
    const logs = rows.length > 0
      ? rows[0].values.map((v) => ({
          id: Number(v[0]),
          timestamp: String(v[1]),
          category: String(v[2]),
          action: String(v[3]),
          stockCode: v[4] ? String(v[4]) : undefined,
          details: String(v[5]),
        }))
      : [];

    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Kiwoom API Specs & Safety Barrier
apiRouter.get('/kiwoom/specs', async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      specs: KIWOOM_API_SPECS,
      realOrderSafetyBarrier: {
        active: true,
        message: '실계좌 주문 호출은 시스템 차원에서 물리적으로 원천 차단되어 있습니다.',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Arbitrary KST Time Verification Test Endpoint
apiRouter.post('/test/check-time', async (req: Request, res: Response) => {
  try {
    const { timeString, dateString } = req.body;
    const sessionConfig = await SessionManager.getConfig();

    let targetDate = new Date();
    if (timeString) {
      const [h, m, s = '00'] = timeString.split(':');
      // Set time on targetDate in KST
      const baseDate = dateString ? new Date(dateString) : new Date();
      // Calculate offset to produce exact KST time
      // KST is UTC+9
      const utcDate = new Date(Date.UTC(
        baseDate.getUTCFullYear(),
        baseDate.getUTCMonth(),
        baseDate.getUTCDate(),
        parseInt(h, 10) - 9,
        parseInt(m, 10),
        parseInt(s, 10)
      ));
      targetDate = utcDate;
    }

    const result = isEntryTimeAllowed(sessionConfig, targetDate);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 9. Trigger Real Order Attempt (to demonstrate that it is blocked)
apiRouter.post('/test/real-order-barrier', (_req: Request, res: Response) => {
  try {
    RealOrderAdapter.executeRealOrder();
    res.status(500).json({ success: false, error: 'SAFETY_BREACH: Real order was not blocked!' });
  } catch (err: any) {
    res.json({
      success: true,
      blocked: true,
      message: '실계좌 주문 차단 안전장치가 정상 작동하였습니다.',
      barrierError: err.message,
    });
  }
});
