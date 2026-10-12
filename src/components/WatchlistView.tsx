import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Zap,
  HelpCircle,
  X,
  Sliders,
  AlertTriangle,
  Layers,
  Globe,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { MonitoredStockItem, StrategyConfig, ConditionEvaluationResult, ConditionFormula } from '../types/trader';
import { safeFetchJson } from '../utils/apiClient';

interface WatchlistViewProps {
  stocks: MonitoredStockItem[];
  strategyConfig: StrategyConfig | null;
  formulas: ConditionFormula[];
  lastSyncTime?: string;
  combinationMode?: 'OR' | 'AND';
  onRefresh: () => void;
  onSyncRealQuotes: () => Promise<void>;
  onSetCombinationMode?: (mode: 'OR' | 'AND') => Promise<void>;
  onToggleFormulaEnabled?: (formulaId: string, enabled: boolean) => Promise<void>;
  onToggleStockFormula?: (stockCode: string, formulaId: string, inCatch: boolean) => Promise<void>;
  onToggleConditionSearch: (code: string, inSearch: boolean) => Promise<void>;
  onInjectScenario: (code: string, overrides: any) => Promise<{ stock?: any; evaluation?: ConditionEvaluationResult } | void>;
  onClearLock: (code: string) => void;
  onAddStock?: (code: string) => Promise<boolean>;
  onRemoveStock?: (code: string) => Promise<void>;
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  stocks,
  strategyConfig,
  formulas,
  lastSyncTime,
  combinationMode = 'OR',
  onRefresh,
  onSyncRealQuotes,
  onSetCombinationMode,
  onToggleFormulaEnabled,
  onToggleStockFormula,
  onToggleConditionSearch,
  onInjectScenario,
  onClearLock,
  onAddStock,
  onRemoveStock,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStockForModal, setSelectedStockForModal] = useState<MonitoredStockItem | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'warning' | 'info'; title: string; text: string; details?: string } | null>(null);
  const [isInjecting, setIsInjecting] = useState(false);
  const [isSyncingQuotes, setIsSyncingQuotes] = useState(false);
  const [showFormulaPanel, setShowFormulaPanel] = useState(true);
  const [showExplanationCard, setShowExplanationCard] = useState(true);

  // New stock search state
  const [newStockCode, setNewStockCode] = useState('');
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [searchResults, setSearchResults] = useState<{ code: string; name: string; market: string }[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Custom simulation inputs for modal
  const [customStrength, setCustomStrength] = useState<number>(120);
  const [customNetBuyBillion, setCustomNetBuyBillion] = useState<number>(8);
  const [customInSearch, setCustomInSearch] = useState<boolean>(true);

  const filteredStocks = stocks.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.includes(searchTerm)
  );

  const formatKRWInteger = (amount: number) => {
    const isPos = amount >= 0;
    const absVal = Math.abs(amount);
    if (absVal >= 100_000_000) {
      return `${isPos ? '+' : '-'}${(absVal / 100_000_000).toFixed(2)}억원`;
    }
    return `${isPos ? '+' : '-'}${absVal.toLocaleString()}원`;
  };

  const handleSyncQuotes = async () => {
    setIsSyncingQuotes(true);
    try {
      await onSyncRealQuotes();
      setToastMessage({
        type: 'success',
        title: '실제 국내 시장(KOSPI/KOSDAQ) 실주가 동기화 완료',
        text: '모든 종목의 현재가와 전일대비 등락률이 네이버증권/KRX 실시간 호가 데이터로 갱신되었습니다.',
        details: `동기화 시각: ${new Date().toLocaleTimeString('ko-KR')}`,
      });
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSyncingQuotes(false);
    }
  };

  const handleStockSearch = async (query: string) => {
    setNewStockCode(query);
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    try {
      const data = await safeFetchJson(`/api/stocks/search?q=${encodeURIComponent(query)}`);
      if (data?.success && data.results) {
        setSearchResults(data.results);
        setShowSearchDropdown(true);
      }
    } catch (err) {
      console.warn('Stock search error:', err);
    }
  };

  const handleAddNewStock = async (code: string) => {
    if (!code || !onAddStock) return;
    setIsAddingStock(true);
    setShowSearchDropdown(false);
    try {
      const ok = await onAddStock(code);
      if (ok) {
        setNewStockCode('');
        setToastMessage({
          type: 'success',
          title: '종목 감시 추가 완료',
          text: `종목코드 [${code}]의 실시간 실주가가 연동되어 감시 목록에 등록되었습니다.`,
        });
        setTimeout(() => setToastMessage(null), 5000);
      }
    } finally {
      setIsAddingStock(false);
    }
  };

  const handleToggleSearch = async (stock: MonitoredStockItem) => {
    const nextState = !stock.inConditionSearch;
    await onToggleConditionSearch(stock.code, nextState);
    setToastMessage({
      type: nextState ? 'success' : 'warning',
      title: `[${stock.name}] 조건 A 상태 변경`,
      text: nextState ? '키움 조건검색식 포착 (IN)으로 전환되었습니다.' : '조건검색식 이탈 (OUT)으로 전환되었습니다.',
      details: nextState
        ? '조건 A를 통과하여 체결강도 및 프로그램 순매수 충족 시 즉시 자동 매수됩니다.'
        : '조건 A 미포착 상태이므로 매수 조건에서 즉시 제외됩니다.',
    });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleApplyScenario = async (
    stock: MonitoredStockItem,
    scenarioName: string,
    overrides: any,
    expectedOutcome: string
  ) => {
    setIsInjecting(true);
    try {
      const result = await onInjectScenario(stock.code, {
        ...overrides,
        scenarioName,
        lockDurationSeconds: 40,
      });

      const evalData = result?.evaluation;
      if (evalData) {
        if (evalData.matched) {
          setToastMessage({
            type: 'success',
            title: `[${stock.name}] 수급테스트 성공! 조건 A~G 충족 & 자동 모의매수 체결`,
            text: `체결강도 ${overrides.executionStrength ?? stock.executionStrength}% 및 순매수 ${formatKRWInteger(overrides.programNetBuyRaw ? overrides.programNetBuyRaw * 1_000_000 : stock.programNetBuyKRW)} 충족!`,
            details: `운용자산 20% 한도 내에서 모의매수 주문이 생성되어 [대시보드] 및 [주문기록]에 즉시 등록되었습니다.`,
          });
        } else {
          setToastMessage({
            type: 'warning',
            title: `[${stock.name}] 수급테스트 결과: 매수 거부 (위험관리 가동)`,
            text: `거부 사유: ${evalData.rejectedReasons.join(' · ')}`,
            details: `조건 A(조건식), B(체결강도), C(순매수), D(신선도), E(20% 한도), F(중복보유), G(거래시간) 중 미달 항목이 정상 차단되었습니다.`,
          });
        }
      } else {
        setToastMessage({
          type: 'info',
          title: `[${stock.name}] 수급테스트 적용 완료`,
          text: scenarioName,
          details: expectedOutcome,
        });
      }

      setTimeout(() => setToastMessage(null), 8000);
      setSelectedStockForModal(null);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsInjecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification for Instant Feedback */}
      {toastMessage && (
        <div
          className={`p-4 rounded border text-xs flex items-start justify-between gap-3 shadow-xl transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-600 text-emerald-200'
              : toastMessage.type === 'warning'
              ? 'bg-amber-950/90 border-amber-600 text-amber-200'
              : 'bg-blue-950/90 border-blue-600 text-blue-200'
          }`}
        >
          <div className="space-y-1">
            <div className="font-bold text-sm text-white flex items-center gap-2">
              {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {toastMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
              {toastMessage.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
              <span>{toastMessage.title}</span>
            </div>
            <div className="text-neutral-200">{toastMessage.text}</div>
            {toastMessage.details && (
              <div className="text-[11px] opacity-80 pt-1 border-t border-current/20 font-mono">
                {toastMessage.details}
              </div>
            )}
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-neutral-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Explanatory Guide Box for User Questions 3, 4, 5 */}
      {showExplanationCard && (
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded text-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-white">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              <span>사용자 질의 핵심 가이드 (수급테스트 · 조건 A 확인법 · 영웅문 다중 조건검색)</span>
            </div>
            <button
              onClick={() => setShowExplanationCard(false)}
              className="text-neutral-400 hover:text-neutral-200 text-xs"
            >
              닫기
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-neutral-300">
            <div className="p-3 bg-neutral-950 rounded border border-neutral-800 space-y-1">
              <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Q3. 수급테스트란?</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                장중 또는 장외 모의 환경에서 종목에 체결강도 급등(125%)과 프로그램 순매수 유입(+8.5억원) 시나리오를 주입하여, 조건 A~G를 판정하고 <span className="text-white font-medium">자동 모의매수(20% 한도 배정)</span>가 정상 실행되는지 즉시 검증하는 도구입니다.
              </p>
            </div>

            <div className="p-3 bg-neutral-950 rounded border border-neutral-800 space-y-1">
              <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Q4. 조건 A 및 실주가 확인</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                아래 테이블의 <span className="text-emerald-300 font-medium">[조건 A (키움 조건식)]</span> 열에서 실시간 포착 여부를 확인하며, 버튼 클릭으로 즉시 편입/이탈을 토글할 수 있습니다. 주가는 <span className="text-white font-medium">네이버증권/KRX 실시간 호가</span>로 실주가 연동됩니다.
              </p>
            </div>

            <div className="p-3 bg-neutral-950 rounded border border-neutral-800 space-y-1">
              <div className="font-semibold text-blue-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Q5. 영웅문 조건검색창이 여러 개일 때</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                키움 영웅문(0150, 0151 등) 창이 여러 개일 경우, 상단의 <span className="text-blue-300 font-medium">다중 조건식 모드</span>에서 <span className="text-white">OR 모드(하나라도 포착 시 매수)</span> 또는 <span className="text-white">AND 모드(모두 포착 시 매수)</span>를 선택하여 자유롭게 운영할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Condition Search Formula Panel (영웅문 다중 조건검색창 연동) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="px-5 py-3.5 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">키움 영웅문 실시간 조건검색식 감시 설정 (다중 화면 연동)</h2>
            <span className="text-xs text-neutral-400">
              · 현재 {formulas.filter((f) => f.enabled).length}/{formulas.length}개 활성화
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Combination Mode Switcher (OR vs AND) */}
            <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded border border-neutral-800 text-xs">
              <span className="text-neutral-400 px-2 text-[11px]">결합 판정:</span>
              <button
                onClick={() => onSetCombinationMode && onSetCombinationMode('OR')}
                className={`px-2.5 py-1 rounded transition-colors font-medium text-xs ${
                  combinationMode === 'OR'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="등록된 조건식 중 어느 하나라도 포착되면 조건 A를 통과하여 매수 심사 진행"
              >
                OR 모드 (하나라도 포착 시 매수)
              </button>
              <button
                onClick={() => onSetCombinationMode && onSetCombinationMode('AND')}
                className={`px-2.5 py-1 rounded transition-colors font-medium text-xs ${
                  combinationMode === 'AND'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="활성화된 모든 조건식에 동시에 포착되어야만 조건 A를 통과"
              >
                AND 모드 (모두 동시 포착)
              </button>
            </div>

            <button
              onClick={() => setShowFormulaPanel(!showFormulaPanel)}
              className="text-xs px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700"
            >
              {showFormulaPanel ? '접기' : '상세보기'}
            </button>
          </div>
        </div>

        {showFormulaPanel && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-neutral-950/60 text-xs">
            {formulas.map((f) => (
              <div
                key={f.id}
                className={`p-3 rounded border transition-colors ${
                  f.enabled
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-200'
                    : 'bg-neutral-950 border-neutral-900 text-neutral-500 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <span className="font-mono text-[11px] px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-300">
                      화면 {f.screenNo}
                    </span>
                    <span className="truncate">{f.name.split(' ')[0]}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => onToggleFormulaEnabled && onToggleFormulaEnabled(f.id, e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-700 text-blue-600 focus:ring-0 bg-neutral-950 cursor-pointer"
                  />
                </div>
                <p className="text-[11px] text-neutral-400 line-clamp-2 h-8 leading-tight">
                  {f.description}
                </p>
                <div className="mt-2 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-neutral-400">포착 종목수:</span>
                  <span className="font-mono font-bold text-white">{f.matchedCount}개</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Control Strip & Add Stock Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Existing Watchlist */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="감시 목록 종목명 또는 종목코드 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Dynamic Add Stock by Code or Search */}
        <div className="relative flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="국내 주식 추가 (예: 카카오, 035720)"
              value={newStockCode}
              onChange={(e) => handleStockSearch(e.target.value)}
              onFocus={() => {
                if (newStockCode.trim()) setShowSearchDropdown(true);
              }}
              className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 w-56 font-sans"
            />

            {/* Autocomplete Dropdown */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-neutral-900 border border-neutral-700 rounded shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-neutral-800">
                {searchResults.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => handleAddNewStock(item.code)}
                    className="w-full px-3 py-2 text-left hover:bg-neutral-800 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-white">{item.name}</div>
                      <div className="text-[10px] text-neutral-400 font-mono">{item.code}</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">
                      {item.market}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => handleAddNewStock(newStockCode.trim())}
            disabled={isAddingStock || !newStockCode.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors shrink-0 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>종목 추가</span>
          </button>
        </div>

        {/* Sync & Refresh Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncQuotes}
            disabled={isSyncingQuotes}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/80 rounded text-xs font-medium transition-colors"
            title="네이버증권/KRX 실시간 호가 데이터를 즉시 새로고침합니다."
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>실주가 동기화</span>
            {isSyncingQuotes && <RefreshCw className="w-3 h-3 animate-spin ml-1" />}
          </button>

          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded text-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">감시 종목 리스트 ({filteredStocks.length}개)</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              네이버증권/KRX 실시간 실주가 연동
            </span>
          </div>
          {lastSyncTime && (
            <div className="text-[11px] text-neutral-400 font-mono">
              마지막 실주가 갱신: {new Date(lastSyncTime).toLocaleTimeString('ko-KR')}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800 font-medium">
              <tr>
                <th className="py-2.5 px-4">종목명 / 코드</th>
                <th className="py-2.5 px-4 text-right">실시간 현재가</th>
                <th className="py-2.5 px-4 text-right">체결강도 (X)</th>
                <th className="py-2.5 px-4 text-right">프로그램 순매수 (Y)</th>
                <th className="py-2.5 px-4 text-center">조건 A (조건검색식)</th>
                <th className="py-2.5 px-4 text-center">전체 조건 판정</th>
                <th className="py-2.5 px-4 text-center">수급테스트 / 관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 font-mono">
              {filteredStocks.map((stock) => {
                const evalData = stock.evaluation;
                const isMatched = evalData?.matched ?? false;
                const isChegangOk = (stock.executionStrength ?? 0) >= (strategyConfig?.minExecutionStrength ?? 105);
                const isProgOk = (stock.programNetBuyKRW ?? 0) >= (strategyConfig?.minProgramNetBuyKRW ?? 500_000_000);
                const isPriceUp = stock.changeRate >= 0;

                return (
                  <tr key={stock.code} className="hover:bg-neutral-800/40 transition-colors">
                    {/* Stock Name & Code */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white font-sans flex items-center gap-1.5">
                        <span>{stock.name}</span>
                        {stock.activeScenario && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-amber-950 text-amber-300 border border-amber-800 rounded font-normal">
                            수급테스트중
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400">{stock.code}</div>
                    </td>

                    {/* Live Real Price */}
                    <td className="py-3 px-4 text-right tabular-nums">
                      <div className="font-bold text-white text-sm">
                        {stock.currentPrice.toLocaleString()}원
                      </div>
                      <div className={`text-[11px] flex items-center justify-end gap-0.5 ${isPriceUp ? 'text-rose-400' : 'text-blue-400'}`}>
                        {isPriceUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{isPriceUp ? '+' : ''}{stock.changeRate.toFixed(2)}%</span>
                      </div>
                    </td>

                    {/* Condition B: Execution Strength */}
                    <td className="py-3 px-4 text-right tabular-nums">
                      <div className={`font-semibold ${isChegangOk ? 'text-emerald-400' : 'text-neutral-400'}`}>
                        {stock.executionStrength.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        기준 {strategyConfig?.minExecutionStrength ?? 105}%
                      </div>
                    </td>

                    {/* Condition C: Program Net Buy */}
                    <td className="py-3 px-4 text-right tabular-nums">
                      <div className={`font-semibold ${isProgOk ? 'text-emerald-400' : 'text-neutral-400'}`}>
                        {formatKRWInteger(stock.programNetBuyKRW)}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        기준 {formatKRWInteger(strategyConfig?.minProgramNetBuyKRW ?? 500_000_000)}
                      </div>
                    </td>

                    {/* Condition A: Formula Capture Status */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <button
                          onClick={() => handleToggleSearch(stock)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-sans font-medium transition-colors flex items-center gap-1 border ${
                            stock.inConditionSearch
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900/80'
                              : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'
                          }`}
                          title="클릭 시 조건검색식 실시간 편입/이탈 상태를 토글합니다."
                        >
                          {stock.inConditionSearch ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>{stock.conditionFormulaName}</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-neutral-500" />
                              <span>미포착 (클릭하여 편입)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Overall Condition Evaluation Result */}
                    <td className="py-3 px-4 text-center font-sans">
                      {isMatched ? (
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/70 border border-rose-700/60 text-rose-300 font-bold text-xs">
                          <Check className="w-3.5 h-3.5 text-rose-400" />
                          <span>매수 신호 충족</span>
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <span className="text-[11px] text-neutral-400 font-medium">
                            미충족
                          </span>
                          {evalData?.rejectedReasons && evalData.rejectedReasons.length > 0 && (
                            <span className="text-[10px] text-neutral-400 truncate max-w-[140px]" title={evalData.rejectedReasons.join(', ')}>
                              {evalData.rejectedReasons[0]}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Action: Supply & Demand Simulation Test Button */}
                    <td className="py-3 px-4 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedStockForModal(stock);
                            setCustomStrength(stock.executionStrength > 105 ? stock.executionStrength : 125);
                            setCustomNetBuyBillion(8);
                            setCustomInSearch(true);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60 rounded text-xs transition-colors font-medium"
                          title="수급테스트: 체결강도 급등 및 프로그램 순매수 유입 시나리오를 주입하여 매수 체결을 즉각 검증합니다."
                        >
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>수급테스트</span>
                        </button>

                        {onRemoveStock && (
                          <button
                            onClick={() => onRemoveStock(stock.code)}
                            className="p-1 text-neutral-500 hover:text-rose-400 rounded transition-colors"
                            title="감시 목록에서 제외"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 수급테스트 모달 (Interactive Supply & Demand Simulation Modal) */}
      {selectedStockForModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg max-w-lg w-full p-6 text-xs text-neutral-200 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  [{selectedStockForModal.name}] 수급테스트 시뮬레이션
                </h3>
              </div>
              <button
                onClick={() => setSelectedStockForModal(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Explanation of what 수급테스트 is */}
            <div className="p-3 bg-neutral-950 rounded border border-neutral-800 text-[11px] text-neutral-300 leading-relaxed">
              <div className="font-semibold text-amber-300 mb-1">수급테스트 기능이란?</div>
              실제 장이 종료되었거나 장중 특정 종목에 체결강도 및 프로그램 순매수가 급증했을 때의 매수 신호 발생과 <span className="text-white font-medium">자산 20% 한도 배정 및 모의매수 자동 실행</span> 여부를 검증하기 위한 가상 주입 도구입니다.
            </div>

            {/* Stock Current Real State Box */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-neutral-950/80 rounded border border-neutral-800 text-center font-mono">
              <div>
                <div className="text-[10px] text-neutral-400 font-sans">실주가 (현재가)</div>
                <div className="text-white font-bold mt-0.5">{selectedStockForModal.currentPrice.toLocaleString()}원</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 font-sans">현재 체결강도</div>
                <div className="text-white font-bold mt-0.5">{selectedStockForModal.executionStrength.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 font-sans">현재 프로그램 순매수</div>
                <div className="text-white font-bold mt-0.5">{formatKRWInteger(selectedStockForModal.programNetBuyKRW)}</div>
              </div>
            </div>

            {/* 1-Click Quick Scenario Presets */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-neutral-300">원클릭 시나리오 프리셋</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Preset 1: Full Pass Buy */}
                <button
                  onClick={() =>
                    handleApplyScenario(
                      selectedStockForModal,
                      '급등 매수 성공 시나리오',
                      { executionStrength: 125.0, programNetBuyRaw: 850, inConditionSearch: true },
                      '체결강도 125% 및 순매수 8.5억원 충족으로 즉시 모의매수가 체결됩니다.'
                    )
                  }
                  disabled={isInjecting}
                  className="p-2.5 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-700/80 rounded text-left transition-colors"
                >
                  <div className="font-bold text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>🚀 [매수 성공] 급등 주도주</span>
                  </div>
                  <div className="text-[10px] text-emerald-400/80 mt-1">
                    체결강도 125% · 순매수 +8.5억원 · 조건식 포착 → 자동 모의매수 즉시 실행
                  </div>
                </button>

                {/* Preset 2: Low Chegang Reject */}
                <button
                  onClick={() =>
                    handleApplyScenario(
                      selectedStockForModal,
                      '체결강도 미달 거부 시나리오',
                      { executionStrength: 82.5, programNetBuyRaw: 700, inConditionSearch: true },
                      '체결강도 82.5%로 기준치(105%) 미달하여 매수 주문이 거부됩니다.'
                    )
                  }
                  disabled={isInjecting}
                  className="p-2.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-700 rounded text-left transition-colors"
                >
                  <div className="font-bold text-neutral-300 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>🛑 [체결강도 미달] 매수 거부</span>
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-1">
                    체결강도 82.5% (기준 105% 미달) → 매수 거부 사유 정상 확인
                  </div>
                </button>

                {/* Preset 3: Program Net Sell Reject */}
                <button
                  onClick={() =>
                    handleApplyScenario(
                      selectedStockForModal,
                      '프로그램 순매도 거부 시나리오',
                      { executionStrength: 115.0, programNetBuyRaw: -450, inConditionSearch: true },
                      '프로그램 순매수가 -4.5억원으로 매도 우위이므로 매수가 거부됩니다.'
                    )
                  }
                  disabled={isInjecting}
                  className="p-2.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-700 rounded text-left transition-colors"
                >
                  <div className="font-bold text-neutral-300 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>🛑 [순매도 음수] 매수 거부</span>
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-1">
                    프로그램 순매수 -4.5억원 (외인/기관 이탈) → 매수 거부 확인
                  </div>
                </button>

                {/* Preset 4: Condition Search Not Caught Reject */}
                <button
                  onClick={() =>
                    handleApplyScenario(
                      selectedStockForModal,
                      '조건검색식 미포착 거부 시나리오',
                      { executionStrength: 130.0, programNetBuyRaw: 900, inConditionSearch: false },
                      '수급은 충분하나 조건검색식에 걸리지 않아 조건 A 미달로 매수 거부됩니다.'
                    )
                  }
                  disabled={isInjecting}
                  className="p-2.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-700 rounded text-left transition-colors"
                >
                  <div className="font-bold text-neutral-300 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>🛑 [조건 A 미포착] 매수 거부</span>
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-1">
                    조건검색식 미포착 → 조건 A 필터링으로 신규 매수 차단 확인
                  </div>
                </button>
              </div>
            </div>

            {/* Custom Values Slider Inputs */}
            <div className="pt-2 border-t border-neutral-800 space-y-3">
              <div className="text-[11px] font-semibold text-neutral-300">사용자 정의 수치 직접 주입</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-neutral-400 mb-1">체결강도 X (%)</label>
                  <input
                    type="number"
                    step="1"
                    value={customStrength}
                    onChange={(e) => setCustomStrength(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-neutral-400 mb-1">프로그램 순매수 Y (억원)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={customNetBuyBillion}
                    onChange={(e) => setCustomNetBuyBillion(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customInSearch}
                  onChange={(e) => setCustomInSearch(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-neutral-700 text-blue-600 bg-neutral-950"
                />
                <span className="text-[11px] text-neutral-300">조건 A (조건검색식 포착 상태로 설정)</span>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setSelectedStockForModal(null)}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors"
              >
                닫기
              </button>
              <button
                onClick={() =>
                  handleApplyScenario(
                    selectedStockForModal,
                    '사용자 직접 지정 수급',
                    {
                      executionStrength: customStrength,
                      programNetBuyRaw: customNetBuyBillion * 100, // 8억원 = 800백만원
                      inConditionSearch: customInSearch,
                    },
                    '직접 지정한 수급 조건으로 평가 및 매수 실행을 테스트합니다.'
                  )
                }
                disabled={isInjecting}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>시뮬레이션 주입 및 실행</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
