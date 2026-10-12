import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Clock, AlertTriangle, CheckCircle2, ShieldCheck, Sliders, DollarSign, Percent, ShieldAlert } from 'lucide-react';
import { TradingSessionConfig, StrategyConfig, BrokerAccountSummary, PortfolioRiskModel } from '../types/trader';

interface TradingSettingsViewProps {
  sessionConfig: TradingSessionConfig | null;
  strategyConfig: StrategyConfig | null;
  account?: BrokerAccountSummary | null;
  onSaveSession: (config: Partial<TradingSessionConfig>) => Promise<{ success: boolean; error?: string } | boolean>;
  onSaveStrategy: (config: Partial<StrategyConfig>) => Promise<{ success: boolean; error?: string } | boolean>;
  onGroundZeroReset?: () => Promise<void>;
}

export const TradingSettingsView: React.FC<TradingSettingsViewProps> = ({
  sessionConfig,
  strategyConfig,
  account,
  onSaveSession,
  onSaveStrategy,
  onGroundZeroReset,
}) => {
  // Session State
  const [sessionEnabled, setSessionEnabled] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('15:20');
  const [cancelPendingAtEnd, setCancelPendingAtEnd] = useState(true);
  const [blockOutside, setBlockOutside] = useState(true);

  // Strategy State
  const [minExecutionStrength, setMinExecutionStrength] = useState(105);
  const [minProgramNetBuyBillion, setMinProgramNetBuyBillion] = useState(5); // 5억원 = 500,000,000원
  const [investmentPerStockTenThousand, setInvestmentPerStockTenThousand] = useState(1000); // 1,000만원 = 20% of 50M
  const [maxHoldings, setMaxHoldings] = useState(5);
  const [maxTotalInvestmentTenThousand, setMaxTotalInvestmentTenThousand] = useState(5000); // 5,000만원
  const [dailyLossLimitTenThousand, setDailyLossLimitTenThousand] = useState(100); // 100만원 = 2% of 50M
  const [stopLossPercent, setStopLossPercent] = useState(10.0); // 10.0% -> -0.10
  const [takeProfitPercent, setTakeProfitPercent] = useState(5.0); // 5.0% -> 0.050
  const [pendingTimeout, setPendingTimeout] = useState(30);

  // Model C Risk Management State
  const [portfolioRiskModel, setPortfolioRiskModel] = useState<PortfolioRiskModel>('MODEL_C');
  const [warningLossRatePercent, setWarningLossRatePercent] = useState(1.0); // 1.0%
  const [maxPortfolioLossRatePercent, setMaxPortfolioLossRatePercent] = useState(2.0); // 2.0%

  // Status & Feedback
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionSuccess, setSessionSuccess] = useState<string | null>(null);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [strategySuccess, setStrategySuccess] = useState<string | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isSavingStrategy, setIsSavingStrategy] = useState(false);

  const totalAsset = account?.totalAssetValue ?? 50000000;
  const maxStockAllowed20Percent = Math.round(totalAsset * 0.20); // 20% of total assets
  const maxPortfolioLoss2Percent = Math.round(totalAsset * 0.02); // 2% of total assets

  useEffect(() => {
    if (sessionConfig) {
      setSessionEnabled(sessionConfig.enabled);
      setStartTime(sessionConfig.startTime);
      setEndTime(sessionConfig.endTime);
      setCancelPendingAtEnd(sessionConfig.cancelPendingEntryOrdersAtEnd);
      setBlockOutside(sessionConfig.blockNewEntryOutside);
    }
  }, [sessionConfig]);

  useEffect(() => {
    if (strategyConfig) {
      setMinExecutionStrength(strategyConfig.minExecutionStrength);
      setMinProgramNetBuyBillion(strategyConfig.minProgramNetBuyKRW / 100_000_000);
      setInvestmentPerStockTenThousand(strategyConfig.investmentPerStockKRW / 10_000);
      setMaxHoldings(strategyConfig.maxHoldingsCount);
      setMaxTotalInvestmentTenThousand(strategyConfig.maxTotalInvestmentKRW / 10_000);
      setDailyLossLimitTenThousand(strategyConfig.dailyLossLimitKRW / 10_000);
      setStopLossPercent(Math.abs(strategyConfig.stopLossRate * 100));
      setTakeProfitPercent(strategyConfig.takeProfitRate * 100);
      setPendingTimeout(strategyConfig.pendingOrderTimeoutSec);
      setPortfolioRiskModel(strategyConfig.portfolioRiskModel || 'MODEL_C');
      setWarningLossRatePercent(Math.abs((strategyConfig.warningLossRate || -0.01) * 100));
      setMaxPortfolioLossRatePercent(Math.abs((strategyConfig.maxPortfolioLossRate || -0.02) * 100));
    }
  }, [strategyConfig]);

  const handleSaveSession = async () => {
    setSessionError(null);
    setSessionSuccess(null);

    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;

    if (startMins >= endMins) {
      setSessionError('종료 시각은 시작 시각보다 늦어야 합니다. (동일 시각 및 자정 통과 미지원)');
      return;
    }

    setIsSavingSession(true);
    const result = await onSaveSession({
      enabled: sessionEnabled,
      startTime,
      endTime,
      timezone: 'Asia/Seoul',
      cancelPendingEntryOrdersAtEnd: cancelPendingAtEnd,
      blockNewEntryOutside: blockOutside,
    });
    setIsSavingSession(false);

    const isSuccess = typeof result === 'boolean' ? result : result.success;
    const errorMsg = typeof result === 'object' && result.error ? result.error : '세션 설정 저장에 실패하였습니다.';

    if (isSuccess) {
      setSessionSuccess('거래 세션 설정이 SQLite에 성공적으로 저장되었습니다.');
      setTimeout(() => setSessionSuccess(null), 4000);
    } else {
      setSessionError(errorMsg);
    }
  };

  const handleSaveStrategy = async () => {
    setStrategyError(null);
    setStrategySuccess(null);

    if (minExecutionStrength < 50 || minExecutionStrength > 500) {
      setStrategyError('체결강도 기준은 50% ~ 500% 사이여야 합니다.');
      return;
    }

    setIsSavingStrategy(true);
    const result = await onSaveStrategy({
      minExecutionStrength,
      minProgramNetBuyKRW: Math.round(minProgramNetBuyBillion * 100_000_000),
      investmentPerStockKRW: Math.round(investmentPerStockTenThousand * 10_000),
      maxHoldingsCount: maxHoldings,
      maxTotalInvestmentKRW: Math.round(maxTotalInvestmentTenThousand * 10_000),
      dailyLossLimitKRW: Math.round(dailyLossLimitTenThousand * 10_000),
      stopLossRate: -Math.abs(stopLossPercent / 100),
      takeProfitRate: Math.abs(takeProfitPercent / 100),
      pendingOrderTimeoutSec: pendingTimeout,
      portfolioRiskModel,
      warningLossRate: -Math.abs(warningLossRatePercent / 100),
      maxPortfolioLossRate: -Math.abs(maxPortfolioLossRatePercent / 100),
      autoTradingEnabled: strategyConfig?.autoTradingEnabled ?? true,
    });
    setIsSavingStrategy(false);

    const isSuccess = typeof result === 'boolean' ? result : result.success;
    const errorMsg = typeof result === 'object' && result.error ? result.error : '전략 설정 저장에 실패하였습니다.';

    if (isSuccess) {
      setStrategySuccess(`매매 전략 및 [${portfolioRiskModel}] 위험관리 파라미터가 성공적으로 저장되었습니다.`);
      setTimeout(() => setStrategySuccess(null), 4000);
    } else {
      setStrategyError(errorMsg);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* User 4 Core Rules Summary Banner */}
      <div className="p-4 bg-neutral-900 border border-neutral-800 rounded text-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>원점 원칙: 5,000만원 자본 · 20% 단일종목 한도 · 2% 총자산 손실한도 [모델 C] · 10% 손절률</span>
          </div>
          {onGroundZeroReset && (
            <button
              onClick={onGroundZeroReset}
              className="flex items-center gap-1 px-3 py-1 bg-rose-900/40 hover:bg-rose-900/70 text-rose-300 border border-rose-800/60 rounded text-xs transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>원점 리셋 실행</span>
            </button>
          )}
        </div>
        <p className="text-neutral-400 text-[11px]">
          모든 주문과 시뮬레이션은 서버의 검증 로직에 의해 단일 종목에 총 운용자산의 20%({maxStockAllowed20Percent.toLocaleString()}원)를 초과하여 배정되지 않으며, [모델 C] 규칙에 따라 -1% 도달 시 비중 50% 축소, -2% 도달 시 신규 매수 차단 및 손실 종목 선별 손절이 집행됩니다.
        </p>
      </div>

      {/* 1. PORTFOLIO RISK MODEL SELECTION (모델 C 다단계 동적 방어) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-blue-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">총자산 손실률(2%) 운용 모델 선택</h2>
              <p className="text-xs text-neutral-400">
                총자산 손실률 한도 도달 시 시스템이 어떻게 반응하고 포트폴리오를 방어할지 결정합니다.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Model A */}
            <div
              onClick={() => setPortfolioRiskModel('MODEL_A')}
              className={`p-4 rounded border cursor-pointer transition-all ${
                portfolioRiskModel === 'MODEL_A'
                  ? 'bg-neutral-800 border-blue-500 ring-1 ring-blue-500'
                  : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-xs">모델 A: 소극적 진입 차단형</span>
                <input
                  type="radio"
                  name="portfolioRiskModel"
                  checked={portfolioRiskModel === 'MODEL_A'}
                  onChange={() => setPortfolioRiskModel('MODEL_A')}
                  className="text-blue-600 focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                당일 총자산 손실 -2% 도달 시 <strong className="text-neutral-200">신규 매수만 전면 차단</strong>하고, 기존 보유 종목은 개별 손절(-10%) 도달 시까지 유지합니다. 반등 기대 시 유리하나 추가 손실 확대 위험이 있습니다.
              </p>
            </div>

            {/* Model B */}
            <div
              onClick={() => setPortfolioRiskModel('MODEL_B')}
              className={`p-4 rounded border cursor-pointer transition-all ${
                portfolioRiskModel === 'MODEL_B'
                  ? 'bg-neutral-800 border-blue-500 ring-1 ring-blue-500'
                  : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-xs">모델 B: 강제 올스톱 비상탈출형</span>
                <input
                  type="radio"
                  name="portfolioRiskModel"
                  checked={portfolioRiskModel === 'MODEL_B'}
                  onChange={() => setPortfolioRiskModel('MODEL_B')}
                  className="text-blue-600 focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                총자산 손실 -2% 터치 즉시 <strong className="text-neutral-200">모든 보유 종목을 전량 시장가 일괄 청산</strong>하고 당일 매매를 완전 셧다운합니다. 손실은 2%로 완벽 차단되나 일시적 휩소에도 털릴 수 있습니다.
              </p>
            </div>

            {/* Model C - Recommended */}
            <div
              onClick={() => setPortfolioRiskModel('MODEL_C')}
              className={`p-4 rounded border cursor-pointer transition-all relative ${
                portfolioRiskModel === 'MODEL_C'
                  ? 'bg-blue-950/40 border-blue-400 ring-2 ring-blue-500'
                  : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="absolute top-2 right-2">
                <span className="px-1.5 py-0.5 text-[9px] bg-blue-600 text-white rounded font-bold">
                  선택됨 · 권장
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-xs">모델 C: 다단계 동적 방어형</span>
                <input
                  type="radio"
                  name="portfolioRiskModel"
                  checked={portfolioRiskModel === 'MODEL_C'}
                  onChange={() => setPortfolioRiskModel('MODEL_C')}
                  className="text-blue-600 focus:ring-0"
                />
              </div>
              <p className="text-[11px] text-blue-200 leading-relaxed">
                <strong>-1.0% 도달 시 신규 매수 배정 비중 50% 축소(10% 배정)</strong> → <strong>-2.0% 도달 시 서킷브레이커 신규 매수 전면 차단</strong> + <strong>마이너스 손실 종목만 선별 시장가 손절</strong> (수익권 종목은 보존).
              </p>
            </div>
          </div>

          {/* Model C Parameters Details */}
          {portfolioRiskModel === 'MODEL_C' && (
            <div className="p-4 bg-neutral-950 rounded border border-blue-900/50 space-y-4">
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span>[모델 C] 다단계 임계값 세부 설정</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-300">
                    1단계 예비 경고선 (비중 50% 스텝다운 발동)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="5.0"
                      value={warningLossRatePercent}
                      onChange={(e) => setWarningLossRatePercent(Number(e.target.value))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-neutral-400 text-xs font-mono shrink-0">-%</span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    기본값: -1.0% (5,000만원 자본 기준 -500,000원 도달 시 매수 비중을 10%로 축소)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-300">
                    2단계 서킷브레이커선 (신규 매수 차단 + 선별 손절)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="10.0"
                      value={maxPortfolioLossRatePercent}
                      onChange={(e) => setMaxPortfolioLossRatePercent(Number(e.target.value))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-neutral-400 text-xs font-mono shrink-0">-%</span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    원점 원칙: -2.0% (5,000만원 자본 기준 -1,000,000원 도달 시 차단)
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. USER-DEFINED TRADING SESSION SETTINGS */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-blue-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">사용자 지정 거래 시간 설정 (PHASE 1.1)</h2>
              <p className="text-xs text-neutral-400">
                서버의 단일 판정 함수 isEntryTimeAllowed()에 의해 신규 매수 주문을 시간대별로 엄격히 제어합니다.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                매매 시작 시각 (startTime)
              </label>
              <input
                type="time"
                step="1"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-neutral-500">
                기본값 09:00:00 KST (정규장 개장과 동시에 신규 매수 허용)
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                매매 종료 시각 (endTime)
              </label>
              <input
                type="time"
                step="1"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-neutral-500">
                기본값 15:20:00 KST (동시호가 진입 10분 전 신규 매수 진입 마감)
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-neutral-800">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sessionEnabled}
                onChange={(e) => setSessionEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-700 text-blue-600 focus:ring-0 bg-neutral-950"
              />
              <div>
                <div className="text-xs font-medium text-neutral-200">
                  거래 시간 제한 기능 활성화 (enabled)
                </div>
                <div className="text-[11px] text-neutral-500">
                  체크 해제 시 24시간 가상 매수가 허용됩니다. (모의 테스트 전용)
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cancelPendingAtEnd}
                onChange={(e) => setCancelPendingAtEnd(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-700 text-blue-600 focus:ring-0 bg-neutral-950"
              />
              <div>
                <div className="text-xs font-medium text-neutral-200">
                  세션 종료 시 미체결 신규 매수 주문 자동 취소 (cancelPendingEntryOrdersAtEnd)
                </div>
                <div className="text-[11px] text-neutral-500">
                  매매 종료 시점에 체결되지 않은 모든 가상 매수 주문을 안전하게 취소 처리합니다.
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={blockOutside}
                onChange={(e) => setBlockOutside(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-700 text-blue-600 focus:ring-0 bg-neutral-950"
              />
              <div>
                <div className="text-xs font-medium text-neutral-200">
                  거래 시간 외 신규 매수 절대 금지 (blockNewEntryOutside)
                </div>
                <div className="text-[11px] text-neutral-500">
                  장전/장후 및 주말(토/일) 시세 수신 시 신규 주문 진입을 원천 차단합니다.
                </div>
              </div>
            </label>
          </div>

          {sessionError && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/40 border border-rose-800/60 rounded text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{sessionError}</span>
            </div>
          )}

          {sessionSuccess && (
            <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{sessionSuccess}</span>
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-neutral-800">
            <button
              onClick={handleSaveSession}
              disabled={isSavingSession}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>세션 설정 저장</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. STRATEGY & RISK PARAMETERS */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">매매 전략 파라미터 (원점 4대 규칙 반영)</h2>
              <p className="text-xs text-neutral-400">
                체결강도, 프로그램 순매수, 20% 한도 및 10% 개별 손절률 설정
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Condition B: Execution Strength */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                최소 체결강도 기준 (%) - [조건 B]
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min="50"
                  max="500"
                  value={minExecutionStrength}
                  onChange={(e) => setMinExecutionStrength(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-neutral-400 text-xs font-mono shrink-0">% 이상</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                기본값: 105% (매수세가 매도세를 능가하는 종목만 포착)
              </p>
            </div>

            {/* Condition C: Program Net Buy */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                최소 프로그램 순매수 기준 (억원) - [조건 C]
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  value={minProgramNetBuyBillion}
                  onChange={(e) => setMinProgramNetBuyBillion(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-neutral-400 text-xs font-mono shrink-0">억원 이상</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                정규화 금액: {(minProgramNetBuyBillion * 100_000_000).toLocaleString()}원 (음수 매도 우위 철저 차단)
              </p>
            </div>

            {/* Investment per stock - User Rule: 20% limit */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                종목당 매수 배정 금액 (만원) - [운용자산 20% 한도]
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="50"
                  value={investmentPerStockTenThousand}
                  onChange={(e) => setInvestmentPerStockTenThousand(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-neutral-400 text-xs font-mono shrink-0">만원</span>
              </div>
              <p className="text-[11px] text-emerald-400">
                현재 운용자산 20% 상한: {maxStockAllowed20Percent.toLocaleString()}원 (20% 초과 배정 원천 차단)
              </p>
            </div>

            {/* Max Holdings */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                최대 보유 종목 수
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={maxHoldings}
                  onChange={(e) => setMaxHoldings(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-neutral-400 text-xs font-mono shrink-0">종목</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                기본값: 5종목 (5종목 * 20% = 총자산 100% 분할 투자)
              </p>
            </div>

            {/* Single Stock Stop Loss - User Rule: 10% */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                단일종목 손절률 (Stop Loss %) - [원점 원칙 10%]
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={stopLossPercent}
                  onChange={(e) => setStopLossPercent(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-neutral-400 text-xs font-mono shrink-0">-% 하락 시</span>
              </div>
              <p className="text-[11px] text-blue-400">
                평균 매입가 대비 -{stopLossPercent}% 도달 시 즉시 시장가 매도 손절
              </p>
            </div>

            {/* Portfolio Total Loss Limit - User Rule: 2% */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300">
                총자산 손실한도 (만원) - [원점 원칙 총자산 2%]
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="10"
                  value={dailyLossLimitTenThousand}
                  onChange={(e) => setDailyLossLimitTenThousand(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <span className="text-neutral-400 text-xs font-mono shrink-0">만원</span>
              </div>
              <p className="text-[11px] text-rose-400">
                누적 손실 -{(dailyLossLimitTenThousand * 10_000).toLocaleString()}원(총자산 2%) 도달 시 모델 C 서킷브레이커 발동
              </p>
            </div>
          </div>

          {strategyError && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/40 border border-rose-800/60 rounded text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{strategyError}</span>
            </div>
          )}

          {strategySuccess && (
            <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{strategySuccess}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              onClick={() => {
                setMinExecutionStrength(105);
                setMinProgramNetBuyBillion(5);
                setInvestmentPerStockTenThousand(1000);
                setMaxHoldings(5);
                setMaxTotalInvestmentTenThousand(5000);
                setDailyLossLimitTenThousand(100);
                setStopLossPercent(10.0);
                setTakeProfitPercent(5.0);
                setPortfolioRiskModel('MODEL_C');
                setWarningLossRatePercent(1.0);
                setMaxPortfolioLossRatePercent(2.0);
              }}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors"
            >
              원점 기본값 복원 (5000만/20%/2%[모델C]/10%)
            </button>
            <button
              onClick={handleSaveStrategy}
              disabled={isSavingStrategy}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>전략 파라미터 저장</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
