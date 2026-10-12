import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

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

export type PortfolioRiskModel = 'MODEL_A' | 'MODEL_B' | 'MODEL_C';

export interface StrategyConfig {
  id: number;
  minExecutionStrength: number; // X (e.g. 100.0)
  minProgramNetBuyKRW: number;  // Y in integer KRW (e.g. 500,000,000)
  investmentPerStockKRW: number;
  maxHoldingsCount: number;
  maxTotalInvestmentKRW: number;
  dailyLossLimitKRW: number;
  stopLossRate: number;         // e.g. -0.10 (-10.0%)
  takeProfitRate: number;       // e.g. 0.050 (+5.0%)
  pendingOrderTimeoutSec: number;
  autoTradingEnabled: boolean;
  portfolioRiskModel: PortfolioRiskModel;
  warningLossRate: number;      // e.g. -0.01 (-1.0%)
  maxPortfolioLossRate: number; // e.g. -0.02 (-2.0%)
  circuitBreakerTriggered: boolean;
  updatedAt: string;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  category: 'SESSION' | 'ENTRY' | 'EXIT' | 'ORDER' | 'RISK' | 'CONFIG' | 'SYSTEM';
  action: string;
  stockCode?: string;
  details: string;
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

let dbInstance: SqlJsDatabase | null = null;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'kiwoom_trader.sqlite');

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      dbInstance = new SQL.Database(fileBuffer);
    } catch {
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  initSchema(dbInstance);
  saveDb(dbInstance);
  return dbInstance;
}

export function saveDb(db: SqlJsDatabase = dbInstance!): void {
  if (!db) return;
  const binaryArray = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(binaryArray));
}

function initSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS session_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      startTime TEXT NOT NULL DEFAULT '09:00',
      endTime TEXT NOT NULL DEFAULT '15:20',
      timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
      cancelPendingEntryOrdersAtEnd INTEGER NOT NULL DEFAULT 1,
      blockNewEntryOutside INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strategy_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      minExecutionStrength REAL NOT NULL DEFAULT 105.0,
      minProgramNetBuyKRW INTEGER NOT NULL DEFAULT 500000000,
      investmentPerStockKRW INTEGER NOT NULL DEFAULT 10000000,
      maxHoldingsCount INTEGER NOT NULL DEFAULT 5,
      maxTotalInvestmentKRW INTEGER NOT NULL DEFAULT 50000000,
      dailyLossLimitKRW INTEGER NOT NULL DEFAULT 1000000,
      stopLossRate REAL NOT NULL DEFAULT -0.10,
      takeProfitRate REAL NOT NULL DEFAULT 0.050,
      pendingOrderTimeoutSec INTEGER NOT NULL DEFAULT 30,
      autoTradingEnabled INTEGER NOT NULL DEFAULT 1,
      portfolioRiskModel TEXT NOT NULL DEFAULT 'MODEL_C',
      warningLossRate REAL NOT NULL DEFAULT -0.01,
      maxPortfolioLossRate REAL NOT NULL DEFAULT -0.02,
      circuitBreakerTriggered INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      stockCode TEXT,
      details TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      stockCode TEXT PRIMARY KEY,
      stockName TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      avgBuyPrice REAL NOT NULL,
      currentPrice REAL NOT NULL,
      boughtAt TEXT NOT NULL,
      stopLossPrice REAL NOT NULL,
      takeProfitPrice REAL NOT NULL,
      entryReason TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      stockCode TEXT NOT NULL,
      stockName TEXT NOT NULL,
      orderType TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      filledAt TEXT,
      filledPrice REAL
    );

    CREATE TABLE IF NOT EXISTS broker_account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      initialCash INTEGER NOT NULL DEFAULT 50000000,
      currentCash INTEGER NOT NULL DEFAULT 50000000,
      realizedPnL INTEGER NOT NULL DEFAULT 0,
      feeRate REAL NOT NULL DEFAULT 0.00015,
      taxRate REAL NOT NULL DEFAULT 0.0018,
      slippageRate REAL NOT NULL DEFAULT 0.0005,
      updatedAt TEXT NOT NULL
    );
  `);

  // Migrate any existing strategy_config table to include Model C columns
  try { db.run("ALTER TABLE strategy_config ADD COLUMN portfolioRiskModel TEXT NOT NULL DEFAULT 'MODEL_C'"); } catch {}
  try { db.run("ALTER TABLE strategy_config ADD COLUMN warningLossRate REAL NOT NULL DEFAULT -0.01"); } catch {}
  try { db.run("ALTER TABLE strategy_config ADD COLUMN maxPortfolioLossRate REAL NOT NULL DEFAULT -0.02"); } catch {}
  try { db.run("ALTER TABLE strategy_config ADD COLUMN circuitBreakerTriggered INTEGER NOT NULL DEFAULT 0"); } catch {}

  // Seed default session config if empty
  const sessionRes = db.exec('SELECT COUNT(*) as count FROM session_config');
  if (sessionRes.length === 0 || Number(sessionRes[0].values[0][0]) === 0) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO session_config (id, enabled, startTime, endTime, timezone, cancelPendingEntryOrdersAtEnd, blockNewEntryOutside, updatedAt)
       VALUES (1, 1, '09:00', '15:20', 'Asia/Seoul', 1, 1, ?)`,
      [now]
    );
  }

  // Seed default strategy config if empty
  const stratRes = db.exec('SELECT COUNT(*) as count FROM strategy_config');
  if (stratRes.length === 0 || Number(stratRes[0].values[0][0]) === 0) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO strategy_config (id, minExecutionStrength, minProgramNetBuyKRW, investmentPerStockKRW, maxHoldingsCount, maxTotalInvestmentKRW, dailyLossLimitKRW, stopLossRate, takeProfitRate, pendingOrderTimeoutSec, autoTradingEnabled, portfolioRiskModel, warningLossRate, maxPortfolioLossRate, circuitBreakerTriggered, updatedAt)
       VALUES (1, 105.0, 500000000, 10000000, 5, 50000000, 1000000, -0.10, 0.050, 30, 1, 'MODEL_C', -0.01, -0.02, 0, ?)`,
      [now]
    );
  }

  // Seed default broker account if empty
  const accountRes = db.exec('SELECT COUNT(*) as count FROM broker_account');
  if (accountRes.length === 0 || Number(accountRes[0].values[0][0]) === 0) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO broker_account (id, initialCash, currentCash, realizedPnL, feeRate, taxRate, slippageRate, updatedAt)
       VALUES (1, 50000000, 50000000, 0, 0.00015, 0.0018, 0.0005, ?)`,
      [now]
    );
  }
}

export async function resetTradingToGroundZero(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.run('DELETE FROM positions');
  db.run('DELETE FROM orders');
  db.run('DELETE FROM audit_logs');

  db.run(
    `UPDATE broker_account 
     SET initialCash = 50000000, currentCash = 50000000, realizedPnL = 0, updatedAt = ? 
     WHERE id = 1`,
    [now]
  );

  db.run(
    `UPDATE strategy_config 
     SET investmentPerStockKRW = 10000000, 
         maxHoldingsCount = 5, 
         maxTotalInvestmentKRW = 50000000, 
         dailyLossLimitKRW = 1000000, 
         stopLossRate = -0.10, 
         takeProfitRate = 0.050, 
         autoTradingEnabled = 1,
         portfolioRiskModel = 'MODEL_C',
         warningLossRate = -0.01,
         maxPortfolioLossRate = -0.02,
         circuitBreakerTriggered = 0,
         updatedAt = ? 
     WHERE id = 1`,
    [now]
  );

  db.run(
    `INSERT INTO audit_logs (timestamp, category, action, details)
     VALUES (?, 'SYSTEM', 'GROUND_ZERO_RESET', '매매 실적 및 모의계좌 원점 리셋 완료 (기초자본금 5,000만원, 종목당 20%, 총자산 손실한도 2% [모델 C 다단계 동적 방어], 단일종목 손절 10%)')`,
    [now]
  );

  saveDb(db);
}
