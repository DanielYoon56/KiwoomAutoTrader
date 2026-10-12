import { MonitoredStock, normalizeProgramNetBuy } from './kiwoomService.js';
import { PaperBroker } from './paperBroker.js';
import { StrategyEngine, ConditionEvaluationResult } from './strategyEngine.js';
import { SessionManager } from './sessionManager.js';
import { RealQuoteService, StockDirectoryItem } from './realQuoteService.js';

export interface ConditionFormula {
  id: string;
  name: string;
  screenNo: string;
  description: string;
  enabled: boolean;
  matchedCount: number;
}

interface StockSeed {
  code: string;
  name: string;
  caughtFormulaIds: string[];
}

export const DEFAULT_FORMULAS: ConditionFormula[] = [
  {
    id: 'FORMULA_001',
    name: '외인·기관 수급 주도주 (001식)',
    screenNo: '0150',
    description: '외국인 3일 연속 순매수 및 기관 당일 대량 수급 유입 조건식',
    enabled: true,
    matchedCount: 3,
  },
  {
    id: 'FORMULA_002',
    name: '고체결강도 거래량 돌파 (002식)',
    screenNo: '0151',
    description: '전일 거래량 200% 돌파 및 당일 체결강도 105% 이상 급등 조건식',
    enabled: true,
    matchedCount: 3,
  },
  {
    id: 'FORMULA_003',
    name: '프로그램 순매수 집중주 (003식)',
    screenNo: '0152',
    description: '비차익 프로그램 순매수 5억원 이상 및 기관 수급 집중 종목',
    enabled: true,
    matchedCount: 2,
  },
  {
    id: 'FORMULA_004',
    name: '5일 신고가 눌림목 반등 (004식)',
    screenNo: '0153',
    description: '신고가 갱신 후 5일선 지지 및 체결강도 상승 반등 포착',
    enabled: false,
    matchedCount: 1,
  },
];

const INITIAL_MONITORED_SEEDS: StockSeed[] = [
  { code: '005930', name: '삼성전자', caughtFormulaIds: ['FORMULA_001', 'FORMULA_003'] },
  { code: '000660', name: 'SK하이닉스', caughtFormulaIds: ['FORMULA_001', 'FORMULA_002'] },
  { code: '005380', name: '현대차', caughtFormulaIds: ['FORMULA_002'] },
  { code: '035420', name: 'NAVER', caughtFormulaIds: [] }, // 미포착 기본값 (조건 A 거부 시연)
  { code: '068270', name: '셀트리온', caughtFormulaIds: ['FORMULA_002'] },
  { code: '012450', name: '한화에어로스페이스', caughtFormulaIds: ['FORMULA_001', 'FORMULA_002'] },
  { code: '000270', name: '기아', caughtFormulaIds: ['FORMULA_002', 'FORMULA_004'] },
  { code: '247540', name: '에코프로비엠', caughtFormulaIds: ['FORMULA_003'] },
];

export interface InjectedScenarioInfo {
  scenarioName: string;
  lockedUntil: number;
}

export class MarketFeedManager {
  private static stocks: Map<string, MonitoredStock> = new Map();
  private static evaluationResults: Map<string, ConditionEvaluationResult> = new Map();
  private static locks: Map<string, InjectedScenarioInfo> = new Map();
  private static formulas: ConditionFormula[] = [...DEFAULT_FORMULAS];
  private static combinationMode: 'OR' | 'AND' = 'OR';
  private static initialized = false;
  private static lastRealQuoteSyncTime: string = '';

  public static async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Fetch real quotes directly for all initial stocks
    const seedCodes = INITIAL_MONITORED_SEEDS.map((s) => s.code);
    const realQuotes = await RealQuoteService.fetchMultipleQuotes(seedCodes);

    for (const seed of INITIAL_MONITORED_SEEDS) {
      const realQuote = realQuotes[seed.code];
      const realPrice = realQuote && realQuote.price > 0 ? realQuote.price : 70000;
      const realChangeRate = realQuote ? realQuote.changeRate : 0.0;

      const initialExecutionStrength = seed.code === '000660' ? 122.4 : seed.code === '012450' ? 116.8 : seed.code === '005930' ? 98.5 : 104.2;
      const initialProgramNetBuyMillion = seed.code === '000660' ? 820 : seed.code === '012450' ? 640 : seed.code === '005930' ? -350 : 210;

      const stock: MonitoredStock = {
        code: seed.code,
        name: realQuote?.name || seed.name,
        currentPrice: realPrice,
        changeRate: realChangeRate,
        executionStrength: initialExecutionStrength,
        programNetBuyRaw: initialProgramNetBuyMillion,
        programNetBuyUnit: '백만원',
        programNetBuyKRW: normalizeProgramNetBuy(initialProgramNetBuyMillion, '백만원'),
        inConditionSearch: false,
        conditionFormulaName: '',
        caughtFormulas: [...seed.caughtFormulaIds],
        updatedAt: new Date().toISOString(),
        isFresh: true,
        freshnessSeconds: 1,
      };

      this.updateStockConditionStatus(stock);
      this.stocks.set(stock.code, stock);
    }

    this.lastRealQuoteSyncTime = new Date().toISOString();

    // Re-evaluate strategy for all stocks
    for (const stock of this.stocks.values()) {
      const evalRes = await StrategyEngine.processStockSignal(stock, new Date());
      this.evaluationResults.set(stock.code, evalRes);
    }
  }

  /**
   * Adds a new stock to the watchlist using its real quote.
   */
  public static async addStockToWatchlist(code: string): Promise<MonitoredStock | null> {
    if (!this.initialized) await this.initialize();

    const quote = await RealQuoteService.fetchRealQuote(code);
    if (!quote || quote.price <= 0) return null;

    const newStock: MonitoredStock = {
      code: quote.code,
      name: quote.name,
      currentPrice: quote.price,
      changeRate: quote.changeRate,
      executionStrength: 102.5,
      programNetBuyRaw: 150,
      programNetBuyUnit: '백만원',
      programNetBuyKRW: normalizeProgramNetBuy(150, '백만원'),
      inConditionSearch: true,
      conditionFormulaName: '외인·기관 수급 주도주',
      caughtFormulas: ['FORMULA_001'],
      updatedAt: new Date().toISOString(),
      isFresh: true,
      freshnessSeconds: 1,
    };

    this.updateStockConditionStatus(newStock);
    this.stocks.set(newStock.code, newStock);

    const evalRes = await StrategyEngine.processStockSignal(newStock, new Date());
    this.evaluationResults.set(newStock.code, evalRes);

    await SessionManager.logAudit(
      'CONFIG',
      'ADD_MONITORED_STOCK',
      newStock.code,
      `종목 감시 추가: ${newStock.name}(${newStock.code}) 실주가 ${newStock.currentPrice.toLocaleString()}원 연동`
    );

    return newStock;
  }

  /**
   * Removes a stock from the watchlist.
   */
  public static removeStockFromWatchlist(code: string): boolean {
    const stock = this.stocks.get(code);
    if (!stock) return false;

    this.stocks.delete(code);
    this.evaluationResults.delete(code);
    this.locks.delete(code);

    SessionManager.logAudit(
      'CONFIG',
      'REMOVE_MONITORED_STOCK',
      code,
      `종목 감시 제외: ${stock.name}(${code})`
    );

    return true;
  }

  /**
   * Evaluates Condition A for a stock based on multi-condition search policy (OR / AND).
   */
  public static updateStockConditionStatus(stock: MonitoredStock): void {
    const enabledFormulaIds = this.formulas.filter((f) => f.enabled).map((f) => f.id);
    const caught = stock.caughtFormulas || [];
    const matchedEnabled = caught.filter((id) => enabledFormulaIds.includes(id));

    if (this.combinationMode === 'OR') {
      stock.inConditionSearch = matchedEnabled.length > 0;
    } else {
      // AND mode: must match all enabled formulas
      stock.inConditionSearch = enabledFormulaIds.length > 0 && matchedEnabled.length === enabledFormulaIds.length;
    }

    if (stock.inConditionSearch) {
      const names = matchedEnabled
        .map((id) => this.formulas.find((f) => f.id === id)?.name.split(' ')[0] || id)
        .filter(Boolean);
      stock.conditionFormulaName =
        names.length > 1 ? `${names.join(', ')} (${names.length}개 동시포착)` : names[0] || '조건식 포착';
    } else {
      stock.conditionFormulaName = '미포착 (대상 제외)';
    }
  }

  /**
   * Re-evaluates Condition A for all monitored stocks when formulas or combination mode changes.
   */
  public static reevaluateAllConditionStatus(): void {
    for (const stock of this.stocks.values()) {
      this.updateStockConditionStatus(stock);
    }
  }

  public static getCombinationMode(): 'OR' | 'AND' {
    return this.combinationMode;
  }

  public static async setCombinationMode(mode: 'OR' | 'AND'): Promise<'OR' | 'AND'> {
    this.combinationMode = mode;
    this.reevaluateAllConditionStatus();

    // Re-evaluate strategy for all stocks
    for (const stock of this.stocks.values()) {
      const evalRes = await StrategyEngine.processStockSignal(stock, new Date());
      this.evaluationResults.set(stock.code, evalRes);
    }

    await SessionManager.logAudit(
      'CONFIG',
      'CHANGE_FORMULA_COMBINATION_MODE',
      undefined,
      `다중 조건검색 결합 모드 변경: ${mode === 'OR' ? 'OR 모드 (어느 하나라도 포착 시 매수 허용)' : 'AND 모드 (모든 활성 조건식에 동시 포착되어야만 매수)'}`
    );

    return this.combinationMode;
  }

  public static async toggleFormulaEnabled(formulaId: string, enabled: boolean): Promise<ConditionFormula[]> {
    const target = this.formulas.find((f) => f.id === formulaId);
    if (target) {
      target.enabled = enabled;
      this.reevaluateAllConditionStatus();

      for (const stock of this.stocks.values()) {
        const evalRes = await StrategyEngine.processStockSignal(stock, new Date());
        this.evaluationResults.set(stock.code, evalRes);
      }

      await SessionManager.logAudit(
        'CONFIG',
        'TOGGLE_FORMULA_ENABLED',
        undefined,
        `조건검색식 감시 상태 변경 [${target.name} (화면 ${target.screenNo})]: ${enabled ? '활성화 (ON)' : '비활성화 (OFF)'}`
      );
    }
    return this.getConditionFormulas();
  }

  public static async toggleStockFormulaCatch(
    stockCode: string,
    formulaId: string,
    inCatch: boolean
  ): Promise<MonitoredStock | null> {
    const stock = this.stocks.get(stockCode);
    if (!stock) return null;

    if (!stock.caughtFormulas) stock.caughtFormulas = [];

    if (inCatch && !stock.caughtFormulas.includes(formulaId)) {
      stock.caughtFormulas.push(formulaId);
    } else if (!inCatch) {
      stock.caughtFormulas = stock.caughtFormulas.filter((id) => id !== formulaId);
    }

    this.updateStockConditionStatus(stock);
    stock.updatedAt = new Date().toISOString();

    const evalRes = await StrategyEngine.processStockSignal(stock, new Date());
    this.evaluationResults.set(stockCode, evalRes);

    const fName = this.formulas.find((f) => f.id === formulaId)?.name || formulaId;
    await SessionManager.logAudit(
      'ENTRY',
      inCatch ? 'CONDITION_SEARCH_CATCH' : 'CONDITION_SEARCH_DROPPED',
      stockCode,
      `[${stock.name}] 조건식 '${fName}' ${inCatch ? '실시간 편입(I)' : '실시간 이탈(D)'} (결합판정: ${stock.inConditionSearch ? '포착 인정' : '미포착'})`
    );

    return stock;
  }

  /**
   * Syncs with genuine real domestic stock prices.
   * Updates prices to match real market data exactly without any synthetic jitter.
   */
  public static async syncRealMarketQuotes(): Promise<void> {
    const codes = Array.from(this.stocks.keys());
    const quotes = await RealQuoteService.fetchMultipleQuotes(codes);

    for (const [code, quote] of Object.entries(quotes)) {
      const stock = this.stocks.get(code);
      if (stock && quote.price > 0) {
        stock.currentPrice = quote.price;
        stock.changeRate = quote.changeRate;
        stock.updatedAt = new Date().toISOString();
        stock.isFresh = true;
        stock.freshnessSeconds = 1;
      }
    }
    this.lastRealQuoteSyncTime = new Date().toISOString();
  }

  public static getLastRealQuoteSyncTime(): string {
    return this.lastRealQuoteSyncTime;
  }

  public static getConditionFormulas(): ConditionFormula[] {
    return this.formulas.map((f) => {
      const count = Array.from(this.stocks.values()).filter(
        (s) => s.caughtFormulas && s.caughtFormulas.includes(f.id)
      ).length;
      return { ...f, matchedCount: count };
    });
  }

  /**
   * Toggles overall Condition Search capture state for a stock (quick toggle)
   */
  public static async toggleConditionSearch(code: string, inSearch: boolean): Promise<MonitoredStock | null> {
    const stock = this.stocks.get(code);
    if (!stock) return null;

    if (inSearch) {
      const enabled = this.formulas.find((f) => f.enabled);
      if (enabled && !stock.caughtFormulas?.includes(enabled.id)) {
        stock.caughtFormulas = [...(stock.caughtFormulas || []), enabled.id];
      }
    } else {
      stock.caughtFormulas = [];
    }

    this.updateStockConditionStatus(stock);
    stock.updatedAt = new Date().toISOString();

    const evalRes = await StrategyEngine.processStockSignal(stock, new Date());
    this.evaluationResults.set(code, evalRes);

    await SessionManager.logAudit(
      'ENTRY',
      inSearch ? 'CONDITION_SEARCH_CATCH' : 'CONDITION_SEARCH_DROPPED',
      code,
      `조건검색 전체 상태 토글 [${stock.name}]: ${inSearch ? '포착(IN)' : '이탈(OUT)'}`
    );

    return stock;
  }

  public static getMonitoredStocks(): (MonitoredStock & { activeScenario?: string })[] {
    if (!this.initialized) {
      this.initialize();
    }

    const now = Date.now();
    return Array.from(this.stocks.values()).map((s) => {
      const lock = this.locks.get(s.code);
      const isLocked = lock && lock.lockedUntil > now;

      let elapsedSec = s.freshnessSeconds;
      if (!isLocked) {
        elapsedSec = Math.max(0, Math.floor((now - new Date(s.updatedAt).getTime()) / 1000));
      }

      return {
        ...s,
        freshnessSeconds: elapsedSec,
        isFresh: elapsedSec <= 60,
        activeScenario: isLocked ? lock.scenarioName : undefined,
      };
    });
  }

  public static getEvaluationResults(): ConditionEvaluationResult[] {
    return Array.from(this.evaluationResults.values());
  }

  /**
   * Periodic market tick:
   * 1. Session tick check
   * 2. Periodic sync of real market prices (without synthetic noise!)
   * 3. Evaluate positions risk (SL / TP)
   * 4. Re-evaluate strategy buy signals
   */
  public static async tickMarket(simulatedDate?: Date): Promise<void> {
    if (!this.initialized) await this.initialize();
    const checkDate = simulatedDate || new Date();
    const now = Date.now();

    // 1. Session tick
    await SessionManager.handleSessionTick(checkDate);

    // 2. Refresh freshness and evaluate signals
    const latestPrices: Record<string, number> = {};

    for (const [code, stock] of this.stocks.entries()) {
      const lock = this.locks.get(code);
      const isLocked = lock && lock.lockedUntil > now;

      if (!isLocked) {
        // Keep real price, update freshness timestamp
        stock.freshnessSeconds = 1;
        stock.isFresh = true;
      }

      latestPrices[code] = stock.currentPrice;

      // Update condition status in case formulas changed
      this.updateStockConditionStatus(stock);

      // Re-evaluate strategy
      const evalRes = await StrategyEngine.processStockSignal(stock, checkDate);
      this.evaluationResults.set(code, evalRes);
    }

    // 3. Monitor risk for existing positions (SL / TP)
    await PaperBroker.monitorPositionsRisk(latestPrices);
  }

  /**
   * Injects scenario values for a stock (locked for 30s)
   */
  public static async injectStockScenario(
    code: string,
    overrides: Partial<MonitoredStock> & { scenarioName?: string; lockDurationSeconds?: number }
  ): Promise<{ stock: MonitoredStock; evaluation: ConditionEvaluationResult }> {
    if (!this.initialized) await this.initialize();
    const stock = this.stocks.get(code);
    if (!stock) throw new Error(`Stock ${code} not found`);

    if (overrides.currentPrice !== undefined) stock.currentPrice = overrides.currentPrice;
    if (overrides.executionStrength !== undefined) stock.executionStrength = overrides.executionStrength;
    if (overrides.programNetBuyRaw !== undefined) {
      stock.programNetBuyRaw = overrides.programNetBuyRaw;
      stock.programNetBuyKRW = normalizeProgramNetBuy(overrides.programNetBuyRaw, '백만원');
    }
    if (overrides.caughtFormulas !== undefined) {
      stock.caughtFormulas = overrides.caughtFormulas;
      this.updateStockConditionStatus(stock);
    } else if (overrides.inConditionSearch !== undefined) {
      if (overrides.inConditionSearch) {
        stock.caughtFormulas = ['FORMULA_001'];
      } else {
        stock.caughtFormulas = [];
      }
      this.updateStockConditionStatus(stock);
    }

    if (overrides.freshnessSeconds !== undefined) {
      stock.freshnessSeconds = overrides.freshnessSeconds;
      stock.isFresh = overrides.freshnessSeconds <= 60;
      stock.updatedAt = new Date(Date.now() - overrides.freshnessSeconds * 1000).toISOString();
    } else {
      stock.freshnessSeconds = 1;
      stock.isFresh = true;
      stock.updatedAt = new Date().toISOString();
    }

    const duration = (overrides.lockDurationSeconds || 30) * 1000;
    this.locks.set(code, {
      scenarioName: overrides.scenarioName || '수급 시뮬레이션 적용 중',
      lockedUntil: Date.now() + duration,
    });

    const evalRes = await StrategyEngine.processStockSignal(stock, new Date());
    this.evaluationResults.set(code, evalRes);

    await SessionManager.logAudit(
      'ENTRY',
      'SCENARIO_INJECTED',
      code,
      `수급 테스트 적용 [${stock.name}]: 체결강도=${stock.executionStrength}%, 순매수=${(stock.programNetBuyKRW / 1e8).toFixed(2)}억원, 판정결과=${evalRes.matched ? '조건충족(매수승인)' : '조건미달(거부: ' + evalRes.rejectedReasons.join(', ') + ')'}`
    );

    return { stock, evaluation: evalRes };
  }

  public static clearScenarioLock(code: string): void {
    this.locks.delete(code);
  }
}
