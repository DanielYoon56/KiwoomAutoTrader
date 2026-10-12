import React from 'react';
import { ShieldCheck, TrendingUp, TrendingDown, DollarSign, Briefcase, Activity, AlertCircle, AlertTriangle, RotateCcw, ShieldAlert, CheckCircle2, Lock, Unlock, HelpCircle } from 'lucide-react';
import { BrokerAccountSummary, Position, StrategyConfig, EntryTimeCheckResult } from '../types/trader';

interface DashboardViewProps {
  account: BrokerAccountSummary | null;
  positions: Position[];
  strategyConfig: StrategyConfig | null;
  sessionCheck: EntryTimeCheckResult | null;
  autoTradingEnabled: boolean;
  onClosePosition: (stockCode: string, currentPrice: number) => void;
  onResetAccount: () => void;
  onResetCircuitBreaker?: () => void;
  onNavigateToWatchlist: () => void;
  onNavigateToSettings: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  account,
  positions,
  strategyConfig,
  sessionCheck,
  autoTradingEnabled,
  onClosePosition,
  onResetAccount,
  onResetCircuitBreaker,
  onNavigateToWatchlist,
  onNavigateToSettings,
}) => {
  const formatKRW = (num: number) => {
    return Math.round(num).toLocaleString('ko-KR') + '원';
  };

  const totalAsset = account?.totalAssetValue ?? 50000000;
  const currentCash = account?.currentCash ?? 50000000;
  const totalLoss = (account?.totalRealizedPnL ?? 0) + (account?.totalUnrealizedPnL ?? 0);
  const lossRate = totalAsset > 0 ? (totalLoss / totalAsset) * 100 : 0;

  const warningLossAllowed = Math.round(totalAsset * 0.01); // 1% = 500,000 KRW
  const maxPortfolioLossAllowed = Math.round(totalAsset * 0.02); // 2% = 1,000,000 KRW
  const isCircuitBreakerTriggered = Boolean(strategyConfig?.circuitBreakerTriggered || totalLoss <= -maxPortfolioLossAllowed);
  const isWarningStage = !isCircuitBreakerTriggered && totalLoss <= -warningLossAllowed;

  // Single stock max 20% limit of operating capital
  const maxStockInvestment20Percent = Math.round(totalAsset * 0.20); // 10,000,000 KRW at 50M
  const effectiveAllocation = isWarningStage
    ? Math.round(maxStockInvestment20Percent * 0.5)
    : isCircuitBreakerTriggered
    ? 0
    : maxStockInvestment20Percent;

  const isProfit = (account?.totalUnrealizedPnL ?? 0) >= 0;
  const isRealizedProfit = (account?.totalRealizedPnL ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Circuit Breaker Emergency Alert */}
      {isCircuitBreakerTriggered && (
        <div className="p-4 bg-rose-950/90 border border-rose-600 rounded text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-pulse">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <span>[모델 C 서킷브레이커 발동] 총자산 손실률 -2% 한도 도달!</span>
                <span className="px-1.5 py-0.5 bg-rose-800 text-rose-100 text-[10px] rounded font-mono">LOCKED</span>
              </div>
              <div>
                누적 손실({totalLoss.toLocaleString()}원, {lossRate.toFixed(2)}%)이 총자산 2%(-{maxPortfolioLossAllowed.toLocaleString()}원)에 도달하여 모델 C 안전장치에 의해 신규 매수가 원천 차단되고 손실 종목 선별 손절이 집행되었습니다.
              </div>
            </div>
          </div>
          {onResetCircuitBreaker && (
            <button
              onClick={onResetCircuitBreaker}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white rounded text-xs font-semibold shrink-0 transition-colors shadow"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>서킷브레이커 해제</span>
            </button>
          )}
        </div>
      )}

      {/* Warning Stage Step-down Alert */}
      {isWarningStage && (
        <div className="p-4 bg-amber-950/80 border border-amber-600 rounded text-amber-200 flex items-start gap-3 shadow">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-sm text-white">
              [모델 C 1단계 예비 경보 발동] 총자산 손실률 -1.0% 초과 구간
            </div>
            <div>
              누적 손실({totalLoss.toLocaleString()}원, {lossRate.toFixed(2)}%) 감지로 신규 매수 1회 배정 비중이 기존 20%(1,000만원)에서 10%({(effectiveAllocation / 1e4).toLocaleString()}만원)로 50% 스텝다운 축소되었습니다.
            </div>
          </div>
        </div>
      )}

      {/* 4 Core User Trading Principles Header Card */}
      <div className="p-5 bg-neutral-900 border border-neutral-800 rounded">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <h1 className="text-sm font-bold text-white">KiwoomAutoTrader 실주가 기반 모의매매 원점 운영</h1>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              국내 주식 실시간 실주가 연동 · 하드코딩 완전 제거 · 4대 핵심 위험관리 원칙 준수
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onResetAccount}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/40 hover:bg-rose-900/70 text-rose-200 border border-rose-700/60 rounded text-xs font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>원점 리셋 (5,000만원 초기화)</span>
            </button>
          </div>
        </div>

        {/* 4 Rules Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3 text-xs">
          <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
            <div className="text-neutral-400 text-[11px]">1. 기초자본금</div>
            <div className="text-white font-mono font-bold text-sm mt-0.5">50,000,000원</div>
            <div className="text-neutral-500 text-[10px] mt-0.5">모의계좌 시작 자본금 (원점 기준)</div>
          </div>

          <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
            <div className="text-neutral-400 text-[11px]">2. 종목당 한도 (운용자산 20%)</div>
            <div className="text-emerald-400 font-mono font-bold text-sm mt-0.5">
              {maxStockInvestment20Percent.toLocaleString()}원
            </div>
            <div className="text-neutral-500 text-[10px] mt-0.5">단일 종목 총자산 20% 초과 배정 불가</div>
          </div>

          <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
            <div className="text-neutral-400 text-[11px] flex items-center justify-between">
              <span>3. 총자산 손실한도 (2%)</span>
              <span className="text-blue-400 font-semibold">[모델 C]</span>
            </div>
            <div className="text-rose-400 font-mono font-bold text-sm mt-0.5">
              -{maxPortfolioLossAllowed.toLocaleString()}원
            </div>
            <div className="text-neutral-500 text-[10px] mt-0.5">다단계 동적 방어 & 선별 손절 체계</div>
          </div>

          <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
            <div className="text-neutral-400 text-[11px]">4. 단일종목 손절률 (10%)</div>
            <div className="text-blue-400 font-mono font-bold text-sm mt-0.5">-10.0%</div>
            <div className="text-neutral-500 text-[10px] mt-0.5">매입가 대비 -10% 도달 시 즉시 자동 매도</div>
          </div>
        </div>
      </div>

      {/* Model C Multi-Tier Dynamic Risk Guard Card */}
      <div className="p-5 bg-gradient-to-r from-neutral-900 via-neutral-900 to-blue-950/30 border border-blue-900/40 rounded space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">총자산 2% 손실제한 운용 체계: [모델 C] 다단계 동적 방어 & 선별 손절</span>
                <span className="px-2 py-0.5 text-[10px] bg-blue-900/60 text-blue-300 border border-blue-700/60 rounded font-semibold">
                  ACTIVE
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                월스트리트 퀀트형 리스크 버퍼: 손실 진폭에 따라 4단계로 자금을 차등 방어하며 수익 포지션은 보존합니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-400">현재 방어 단계:</span>
            {isCircuitBreakerTriggered ? (
              <span className="px-2.5 py-1 bg-rose-900/80 text-rose-200 border border-rose-700 rounded font-bold flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-rose-300" />
                <span>2단계 서킷브레이커 (잠김)</span>
              </span>
            ) : isWarningStage ? (
              <span className="px-2.5 py-1 bg-amber-900/80 text-amber-200 border border-amber-700 rounded font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                <span>1단계 예비경고 (비중 50% 축소)</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-emerald-900/60 text-emerald-300 border border-emerald-700 rounded font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>정상 가동 (100% 한도 허용)</span>
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Loss Gauge Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-neutral-400">
              현재 총 손익: <span className={totalLoss >= 0 ? 'text-rose-400' : 'text-blue-400'}>{totalLoss >= 0 ? '+' : ''}{totalLoss.toLocaleString()}원 ({lossRate.toFixed(2)}%)</span>
            </span>
            <div className="flex items-center gap-4 text-[11px] text-neutral-400">
              <span className="text-amber-400">1단계 경고: -1.0% (-{warningLossAllowed.toLocaleString()}원)</span>
              <span className="text-rose-400">2단계 차단: -2.0% (-{maxPortfolioLossAllowed.toLocaleString()}원)</span>
            </div>
          </div>
          <div className="w-full bg-neutral-950 h-3 rounded-full overflow-hidden flex border border-neutral-800 relative">
            {/* Visual zones: 0 to -1% (Green safe zone 50%), -1% to -2% (Yellow warning zone 50%) */}
            <div className="w-1/2 h-full border-r border-dashed border-amber-500/40 bg-emerald-950/20"></div>
            <div className="w-1/2 h-full bg-amber-950/20"></div>
            {/* Loss indicator cursor */}
            <div
              className={`absolute top-0 bottom-0 transition-all duration-500 ${
                isCircuitBreakerTriggered ? 'bg-rose-500' : isWarningStage ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{
                left: 0,
                width: `${Math.min(100, Math.max(2, Math.abs(Math.min(0, lossRate)) / 2 * 100))}%`,
              }}
            ></div>
          </div>
        </div>

        {/* 4 Steps Breakdown of Model C */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 pt-1 text-[11px]">
          <div className={`p-2.5 rounded border transition-colors ${!isWarningStage && !isCircuitBreakerTriggered ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200' : 'bg-neutral-950/60 border-neutral-800 text-neutral-400'}`}>
            <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>1단계: 정상 가동</span>
            </div>
            <div>총자산 손실 0% ~ -1.0% 구간. 1종목당 운용자산 20%(1,000만원) 한도 내 정상 매수.</div>
          </div>

          <div className={`p-2.5 rounded border transition-colors ${isWarningStage ? 'bg-amber-950/60 border-amber-600 text-amber-200' : 'bg-neutral-950/60 border-neutral-800 text-neutral-400'}`}>
            <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>2단계: 비중 스텝다운</span>
            </div>
            <div>총자산 손실 -1.0%(-50만원) 도달 시 신규 매수 배정 비중을 10%(500만원)로 50% 축소.</div>
          </div>

          <div className={`p-2.5 rounded border transition-colors ${isCircuitBreakerTriggered ? 'bg-rose-950/60 border-rose-600 text-rose-200' : 'bg-neutral-950/60 border-neutral-800 text-neutral-400'}`}>
            <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              <span>3단계: 서킷브레이커</span>
            </div>
            <div>총자산 손실 -2.0%(-100만원) 도달 즉시 신규 매수 100% 차단 & 미체결 주문 전량 취소.</div>
          </div>

          <div className={`p-2.5 rounded border transition-colors ${isCircuitBreakerTriggered ? 'bg-rose-950/60 border-rose-600 text-rose-200' : 'bg-neutral-950/60 border-neutral-800 text-neutral-400'}`}>
            <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              <span>4단계: 선별 손절</span>
            </div>
            <div>마이너스 손실 종목만 즉시 시장가 청산하고, 이익권(+% 수익) 종목은 유지하여 회복력 보존.</div>
          </div>
        </div>
      </div>

      {/* Top System Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Connection & Mode */}
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
            <span>연결 상태 및 서버 종류</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-sm font-semibold text-white">키움 모의투자 (VTS)</div>
          <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1.5">
            <span className="text-emerald-400">실시간 실주가 연동</span>
            <span>·</span>
            <span className="text-rose-400">실계좌 주문 차단됨</span>
          </div>
        </div>

        {/* KPI 2: Total Asset & Cash */}
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
            <span>총 평가자산 / 예수금</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-white font-mono tabular-nums">
            {formatKRW(totalAsset)}
          </div>
          <div className="text-xs text-neutral-400 mt-1 font-mono tabular-nums">
            예수금: {formatKRW(currentCash)}
          </div>
        </div>

        {/* KPI 3: PnL Performance */}
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
            <span>손익 현황 (미실현 / 실현)</span>
            {isProfit ? <TrendingUp className="w-4 h-4 text-rose-400" /> : <TrendingDown className="w-4 h-4 text-blue-400" />}
          </div>
          <div className={`text-lg font-bold font-mono tabular-nums ${isProfit ? 'text-rose-400' : 'text-blue-400'}`}>
            {isProfit ? '+' : ''}{formatKRW(account?.totalUnrealizedPnL ?? 0)}
            <span className="text-xs ml-1 font-normal">
              ({((account?.unrealizedReturnRate ?? 0) * 100).toFixed(2)}%)
            </span>
          </div>
          <div className={`text-xs mt-1 font-mono tabular-nums ${isRealizedProfit ? 'text-rose-300' : 'text-blue-300'}`}>
            당일 실현손익: {isRealizedProfit ? '+' : ''}{formatKRW(account?.totalRealizedPnL ?? 0)}
          </div>
        </div>

        {/* KPI 4: Active Positions & Auto Trader */}
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
            <span>보유 종목 / 배정 비중</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white font-mono tabular-nums">
            {positions.length} / {strategyConfig?.maxHoldingsCount ?? 5} 종목
          </div>
          <div className="text-xs mt-1 flex items-center gap-1.5">
            <span className="text-emerald-400 font-semibold font-mono">
              종목당: {(effectiveAllocation / 1e4).toLocaleString()}만원 ({isWarningStage ? '10%' : isCircuitBreakerTriggered ? '0%' : '20%'})
            </span>
          </div>
        </div>
      </div>

      {/* Active Positions Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">현재 보유 포지션 ({positions.length}개)</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              단일종목 손실률 10% 도달 시 즉시 자동 손절매 처리되며, 세션 종료 후에도 위험관리는 지속 가동됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNavigateToWatchlist}
              className="text-xs px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
            >
              종목 감시 바로가기
            </button>
            <button
              onClick={onNavigateToSettings}
              className="text-xs px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
            >
              매매 설정 확인
            </button>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 text-xs">
            <Briefcase className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
            <div>현재 보유 중인 포지션이 없습니다. (원점 상태)</div>
            <div className="text-neutral-500 mt-1">
              [종목 감시] 화면에서 조건 A(키움 조건검색식), 조건 B(체결강도), 조건 C(프로그램 순매수)를 충족하면 자동 매수됩니다.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">종목</th>
                  <th className="py-2.5 px-3 font-medium">보유수량</th>
                  <th className="py-2.5 px-3 font-medium">매입가</th>
                  <th className="py-2.5 px-3 font-medium">현재가</th>
                  <th className="py-2.5 px-3 font-medium">평가금액</th>
                  <th className="py-2.5 px-3 font-medium">평가손익 (수익률)</th>
                  <th className="py-2.5 px-3 font-medium">손절가 (-10%)</th>
                  <th className="py-2.5 px-3 font-medium">익절가 (+5%)</th>
                  <th className="py-2.5 px-4 font-medium text-right">수동청산</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {positions.map((pos) => {
                  const isPosProfit = pos.unrealizedPnL >= 0;
                  return (
                    <tr key={pos.stockCode} className="hover:bg-neutral-850">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{pos.stockName}</div>
                        <div className="text-[11px] font-mono text-neutral-400">{pos.stockCode}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-neutral-300">
                        {pos.quantity.toLocaleString()}주
                      </td>
                      <td className="py-3 px-3 font-mono text-neutral-300">
                        {formatKRW(pos.avgBuyPrice)}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-white">
                        {formatKRW(pos.currentPrice)}
                      </td>
                      <td className="py-3 px-3 font-mono text-neutral-300">
                        {formatKRW(pos.evaluatedAmount)}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <div className={`font-semibold ${isPosProfit ? 'text-rose-400' : 'text-blue-400'}`}>
                          {isPosProfit ? '+' : ''}{formatKRW(pos.unrealizedPnL)}
                        </div>
                        <div className={`text-[11px] ${isPosProfit ? 'text-rose-300' : 'text-blue-300'}`}>
                          ({isPosProfit ? '+' : ''}{(pos.returnRate * 100).toFixed(2)}%)
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-blue-400 text-[11px]">
                        {formatKRW(pos.stopLossPrice)}
                      </td>
                      <td className="py-3 px-3 font-mono text-rose-400 text-[11px]">
                        {formatKRW(pos.takeProfitPrice)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onClosePosition(pos.stockCode, pos.currentPrice)}
                          className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded border border-neutral-700 text-[11px] transition-colors"
                        >
                          청산
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
