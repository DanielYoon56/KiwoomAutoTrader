import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SessionStatusBanner } from './components/SessionStatusBanner';
import { DashboardView } from './components/DashboardView';
import { WatchlistView } from './components/WatchlistView';
import { TradingSettingsView } from './components/TradingSettingsView';
import { OrdersAndTradesView } from './components/OrdersAndTradesView';
import { KiwoomApiView } from './components/KiwoomApiView';
import { safeFetchJson } from './utils/apiClient';
import { RotateCcw, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import {
  TradingSessionConfig,
  EntryTimeCheckResult,
  StrategyConfig,
  Position,
  Order,
  BrokerAccountSummary,
  AuditLog,
  MonitoredStockItem,
} from './types/trader';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'watchlist' | 'settings' | 'orders' | 'api'>('dashboard');
  const [sessionConfig, setSessionConfig] = useState<TradingSessionConfig | null>(null);
  const [sessionCheck, setSessionCheck] = useState<EntryTimeCheckResult | null>(null);
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig | null>(null);
  const [stocks, setStocks] = useState<MonitoredStockItem[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [account, setAccount] = useState<BrokerAccountSummary | null>(null);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [combinationMode, setCombinationMode] = useState<'OR' | 'AND'>('OR');
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(true);
  const [isTogglingAutoTrading, setIsTogglingAutoTrading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [systemBannerMessage, setSystemBannerMessage] = useState<string | null>(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Fetch all core system data safely
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, stratRes, stocksRes, posRes, ordersRes, logsRes] = await Promise.all([
        safeFetchJson('/api/status'),
        safeFetchJson('/api/strategy'),
        safeFetchJson('/api/stocks'),
        safeFetchJson('/api/positions'),
        safeFetchJson('/api/orders'),
        safeFetchJson('/api/logs'),
      ]);

      if (statusRes?.success && statusRes.data) {
        setSessionConfig(statusRes.data.session.config);
        setSessionCheck(statusRes.data.session.check);
        setAccount(statusRes.data.account);
        setAutoTradingEnabled(statusRes.data.autoTradingEnabled);
      }

      if (stratRes?.success && stratRes.config) {
        setStrategyConfig(stratRes.config);
      }

      if (stocksRes?.success && stocksRes.stocks) {
        setStocks(stocksRes.stocks);
        if (stocksRes.formulas) setFormulas(stocksRes.formulas);
        if (stocksRes.lastSyncTime) setLastSyncTime(stocksRes.lastSyncTime);
        if (stocksRes.mode) setCombinationMode(stocksRes.mode);
      }

      if (posRes?.success && posRes.positions) {
        setPositions(posRes.positions);
      }

      if (ordersRes?.success && ordersRes.orders) {
        setOrders(ordersRes.orders);
      }

      if (logsRes?.success && logsRes.logs) {
        setLogs(logsRes.logs);
      }
    } catch (err) {
      console.warn('Failed to fetch data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Toggle Auto Trading Killswitch
  const handleToggleAutoTrading = async () => {
    setIsTogglingAutoTrading(true);
    try {
      const res = await safeFetchJson('/api/strategy/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !autoTradingEnabled }),
      });
      if (res.success) {
        setAutoTradingEnabled(res.autoTradingEnabled);
        fetchData();
      }
    } catch (err) {
      console.warn('Failed to toggle auto trading:', err);
    } finally {
      setIsTogglingAutoTrading(false);
    }
  };

  // Save Session Config
  const handleSaveSession = async (updated: Partial<TradingSessionConfig>): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await safeFetchJson('/api/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res && res.success) {
        setSessionConfig(res.config);
        setSessionCheck(res.check);
        fetchData();
        return { success: true };
      }
      return { success: false, error: res?.error || '세션 설정 저장에 실패하였습니다.' };
    } catch (err: any) {
      console.warn('Save session error:', err);
      return { success: false, error: err?.message || '네트워크 오류가 발생하였습니다.' };
    }
  };

  // Save Strategy Config
  const handleSaveStrategy = async (updated: Partial<StrategyConfig>): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await safeFetchJson('/api/strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res && res.success) {
        setStrategyConfig(res.config);
        fetchData();
        return { success: true };
      }
      return { success: false, error: res?.error || '전략 설정 저장에 실패하였습니다.' };
    } catch (err: any) {
      console.warn('Save strategy error:', err);
      return { success: false, error: err?.message || '네트워크 오류가 발생하였습니다.' };
    }
  };

  // Ground Zero Reset: Open Confirmation Modal
  const handleGroundZeroReset = async (): Promise<void> => {
    setShowResetConfirmModal(true);
  };

  // Execute Ground Zero Reset
  const executeGroundZeroReset = async () => {
    setIsResetting(true);
    try {
      const res = await safeFetchJson('/api/account/ground-zero-reset', { method: 'POST' });
      if (res.success) {
        setSystemBannerMessage('매매 실적 데이타가 원점으로 리셋되었습니다. (기초자본금 5,000만원, 종목당 20% 한도, 총자산 손실한도 2%, 단일종목 손절 10%)');
        setShowResetConfirmModal(false);
        setTimeout(() => setSystemBannerMessage(null), 6000);
        await fetchData();
      } else {
        setSystemBannerMessage(res.error || '원점 리셋에 실패했습니다.');
        setTimeout(() => setSystemBannerMessage(null), 5000);
      }
    } catch (err) {
      console.warn('Ground zero reset error:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Inject Scenario to Stock
  const handleInjectScenario = async (code: string, overrides: any) => {
    try {
      const res = await safeFetchJson('/api/stocks/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, overrides }),
      });
      await fetchData();
      if (res.success) {
        return { stock: res.stock, evaluation: res.evaluation };
      }
    } catch (err) {
      console.warn('Inject scenario error:', err);
    }
  };

  // Clear Scenario Lock
  const handleClearLock = async (code: string) => {
    try {
      await safeFetchJson('/api/stocks/clear-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      fetchData();
    } catch (err) {
      console.warn('Clear lock error:', err);
    }
  };

  // Sync Real Market Quotes
  const handleSyncRealQuotes = async () => {
    try {
      const res = await safeFetchJson('/api/quotes/sync', { method: 'POST' });
      if (res.success) {
        setLastSyncTime(res.lastSyncTime);
        await fetchData();
      }
    } catch (err) {
      console.warn('Sync quotes error:', err);
    }
  };

  // Add Stock to Watchlist
  const handleAddStock = async (code: string): Promise<boolean> => {
    try {
      const res = await safeFetchJson('/api/stocks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.success) {
        await fetchData();
        setSystemBannerMessage(`[종목 추가 완료] ${res.stock?.name || code} 종목이 감시 리스트에 등록되었습니다.`);
        setTimeout(() => setSystemBannerMessage(null), 4000);
        return true;
      } else {
        setSystemBannerMessage(res.error || '종목 추가에 실패했습니다.');
        setTimeout(() => setSystemBannerMessage(null), 5000);
        return false;
      }
    } catch (err) {
      console.warn('Add stock error:', err);
      return false;
    }
  };

  // Remove Stock from Watchlist
  const handleRemoveStock = async (code: string) => {
    try {
      await safeFetchJson(`/api/stocks/${code}`, { method: 'DELETE' });
      await fetchData();
    } catch (err) {
      console.warn('Remove stock error:', err);
    }
  };

  // Reset Circuit Breaker (Model C)
  const handleResetCircuitBreaker = async () => {
    try {
      const res = await safeFetchJson('/api/risk/reset-circuit-breaker', { method: 'POST' });
      if (res.success) {
        setSystemBannerMessage('서킷브레이커가 정상 해제되었습니다. 신규 매수 주문이 다시 허용됩니다.');
        setTimeout(() => setSystemBannerMessage(null), 5000);
        await fetchData();
      } else {
        setSystemBannerMessage(res.error || '서킷브레이커 해제 요청을 처리하지 못했습니다.');
        setTimeout(() => setSystemBannerMessage(null), 5000);
      }
    } catch (err) {
      console.warn('Reset circuit breaker error:', err);
    }
  };

  // Toggle Condition Search Catch
  const handleToggleConditionSearch = async (code: string, inSearch: boolean) => {
    try {
      await safeFetchJson('/api/conditions/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, inSearch }),
      });
      await fetchData();
    } catch (err) {
      console.warn('Toggle condition error:', err);
    }
  };

  // Set Combination Mode (OR vs AND)
  const handleSetCombinationMode = async (mode: 'OR' | 'AND') => {
    try {
      const res = await safeFetchJson('/api/conditions/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (res.success) {
        setCombinationMode(res.mode);
        await fetchData();
      }
    } catch (err) {
      console.warn('Set combination mode error:', err);
    }
  };

  // Toggle Formula Enabled
  const handleToggleFormulaEnabled = async (formulaId: string, enabled: boolean) => {
    try {
      const res = await safeFetchJson('/api/conditions/formula-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulaId, enabled }),
      });
      if (res.success) {
        setFormulas(res.formulas);
        await fetchData();
      }
    } catch (err) {
      console.warn('Toggle formula error:', err);
    }
  };

  // Toggle Stock in Specific Formula
  const handleToggleStockFormula = async (stockCode: string, formulaId: string, inCatch: boolean) => {
    try {
      await safeFetchJson('/api/conditions/stock-formula-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockCode, formulaId, inCatch }),
      });
      await fetchData();
    } catch (err) {
      console.warn('Toggle stock formula error:', err);
    }
  };

  // Close Position Manually
  const handleClosePosition = async (stockCode: string, currentPrice: number) => {
    try {
      await safeFetchJson('/api/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockCode, currentPrice, reason: '사용자 수동 청산' }),
      });
      fetchData();
    } catch (err) {
      console.warn('Close position error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans antialiased">
      {/* 3-Zone Top Bar Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        autoTradingEnabled={autoTradingEnabled}
        onToggleAutoTrading={handleToggleAutoTrading}
        isToggling={isTogglingAutoTrading}
      />

      {/* Ground Zero Notification Banner */}
      {systemBannerMessage && (
        <div className="bg-emerald-950/90 border-b border-emerald-800 text-emerald-200 px-6 py-2.5 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{systemBannerMessage}</span>
          </div>
          <button
            onClick={() => setSystemBannerMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs px-2 py-0.5 cursor-pointer"
          >
            닫기
          </button>
        </div>
      )}

      {/* PHASE 1.1 Trading Session Status Banner */}
      <SessionStatusBanner
        config={sessionConfig}
        check={sessionCheck}
        onRefresh={fetchData}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-neutral-500 text-xs">
            시스템 상태 및 SQLite 데이터 로드 중...
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                account={account}
                positions={positions}
                strategyConfig={strategyConfig}
                sessionCheck={sessionCheck}
                autoTradingEnabled={autoTradingEnabled}
                onClosePosition={handleClosePosition}
                onResetAccount={handleGroundZeroReset}
                onResetCircuitBreaker={handleResetCircuitBreaker}
                onNavigateToWatchlist={() => setActiveTab('watchlist')}
                onNavigateToSettings={() => setActiveTab('settings')}
              />
            )}

            {activeTab === 'watchlist' && (
              <WatchlistView
                stocks={stocks}
                strategyConfig={strategyConfig}
                formulas={formulas}
                lastSyncTime={lastSyncTime}
                combinationMode={combinationMode}
                onRefresh={fetchData}
                onSyncRealQuotes={handleSyncRealQuotes}
                onSetCombinationMode={handleSetCombinationMode}
                onToggleFormulaEnabled={handleToggleFormulaEnabled}
                onToggleStockFormula={handleToggleStockFormula}
                onToggleConditionSearch={handleToggleConditionSearch}
                onInjectScenario={handleInjectScenario}
                onClearLock={handleClearLock}
                onAddStock={handleAddStock}
                onRemoveStock={handleRemoveStock}
              />
            )}

            {activeTab === 'settings' && (
              <TradingSettingsView
                sessionConfig={sessionConfig}
                strategyConfig={strategyConfig}
                account={account}
                onSaveSession={handleSaveSession}
                onSaveStrategy={handleSaveStrategy}
                onGroundZeroReset={handleGroundZeroReset}
              />
            )}

            {activeTab === 'orders' && (
              <OrdersAndTradesView
                orders={orders}
                logs={logs}
                onRefresh={fetchData}
              />
            )}

            {activeTab === 'api' && <KiwoomApiView />}
          </>
        )}
      </main>

      {/* Ground Zero Reset Confirmation Modal (Iframe Safe - No window.confirm) */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-base">
                <AlertTriangle className="w-5 h-5" />
                <span>매매 실적 데이타 원점 리셋</span>
              </div>
              <button
                onClick={() => setShowResetConfirmModal(false)}
                className="text-neutral-400 hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-neutral-300 space-y-3 leading-relaxed">
              <p className="text-neutral-200 font-medium">
                모든 과거 체결 내역, 보유 포지션, 미체결 주문을 삭제하고 사용자 지정 원점 규칙으로 시스템을 재설정합니다:
              </p>
              <div className="bg-neutral-950 p-3.5 rounded border border-neutral-800 space-y-1.5 font-mono text-[11px] text-neutral-300">
                <div className="flex justify-between">
                  <span className="text-neutral-400">• 기초자본금:</span>
                  <span className="text-emerald-400 font-bold">50,000,000원 (5,000만원)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">• 한 종목 한도:</span>
                  <span className="text-amber-400">총 운용자산의 20% (1,000만원)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">• 총자산 손실한도:</span>
                  <span className="text-rose-400">2% (100만원) [모델 C 다단계 방어]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">• 단일종목 손절률:</span>
                  <span className="text-rose-400">-10.0% 강제 손절</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">• 데이터 기반:</span>
                  <span className="text-sky-400">국내 실시간 실주가 기반</span>
                </div>
              </div>
              <p className="text-neutral-400 text-[11px]">
                이 작업은 즉시 데이터베이스를 초기화하며 되돌릴 수 없습니다. 진행하시겠습니까?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded text-xs text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={executeGroundZeroReset}
                disabled={isResetting}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition shadow-lg cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{isResetting ? '초기화 처리 중...' : '원점에서 다시 시작'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-4 px-6 text-xs text-neutral-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>KiwoomAutoTrader v1.0 · 국내 주식 독립형 자동매매 시스템 (모의매매 전용)</div>
          <div className="text-neutral-400">
            기초자본금 5,000만원 · 종목당 20% 한도 · 총자산 손실한도 2% · 단일종목 손절 10%
          </div>
        </div>
      </footer>
    </div>
  );
}
