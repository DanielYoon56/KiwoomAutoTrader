import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { TradingSessionConfig, EntryTimeCheckResult } from '../types/trader';
import { safeFetchJson } from '../utils/apiClient';

interface SessionStatusBannerProps {
  config: TradingSessionConfig | null;
  check: EntryTimeCheckResult | null;
  onRefresh: () => void;
}

export const SessionStatusBanner: React.FC<SessionStatusBannerProps> = ({ config, check, onRefresh }) => {
  const [kstClock, setKstClock] = useState<string>('');
  const [testTimeInput, setTestTimeInput] = useState<string>('09:00:00');
  const [testResult, setTestResult] = useState<EntryTimeCheckResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setKstClock(formatter.format(now));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const runTimeTest = async (testTime: string) => {
    setIsTesting(true);
    try {
      const data = await safeFetchJson('/api/test/check-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeString: testTime }),
      });
      if (data?.success) {
        setTestResult(data.result);
      }
    } catch (err) {
      console.warn('Time test error:', err);
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusBadge = () => {
    if (!check) return null;
    switch (check.sessionState) {
      case 'OPEN_SESSION':
        return (
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
            <CheckCircle2 className="w-4 h-4" />
            <span>거래 세션 정상 진행 중 (신규 매수 허용)</span>
          </div>
        );
      case 'PRE_SESSION':
        return (
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
            <Clock className="w-4 h-4" />
            <span>장 개시 전 대기 중 (09:00 이전 신규 매수 차단)</span>
          </div>
        );
      case 'POST_SESSION':
        return (
          <div className="flex items-center gap-1.5 text-rose-400 font-semibold text-xs">
            <XCircle className="w-4 h-4" />
            <span>거래 세션 종료 (신규 매수 차단 / 보유 포지션 손익 감시는 지속 유지)</span>
          </div>
        );
      case 'RESTRICTED':
        return (
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>거래소 휴장 또는 제한 상태 (신규 매수 불가)</span>
          </div>
        );
      case 'DISABLED':
        return (
          <div className="flex items-center gap-1.5 text-neutral-400 font-semibold text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>사용자 세션 제한 미사용 (KRX 정규장 09:00~15:30 기준)</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-neutral-900 border-b border-neutral-800 text-neutral-200 text-xs px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Left: Clock and Window */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 font-mono">
            <span className="text-neutral-400">KST (한국 표준시):</span>
            <span className="text-white font-semibold tabular-nums text-sm bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
              {kstClock || '00:00:00'}
            </span>
          </div>

          <div className="h-3.5 w-px bg-neutral-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-neutral-400">설정된 매매 세션:</span>
            <span className="font-mono text-neutral-200 font-medium">
              {config ? `${config.startTime} ~ ${config.endTime}` : '09:00 ~ 15:20'}
            </span>
            <span className="text-neutral-500">·</span>
            <span className="text-neutral-400">
              {config?.enabled ? '시간 제한 가동중' : '제한 비활성화'}
            </span>
            <span className="text-neutral-500">·</span>
            <span className="text-neutral-400">
              종료시 미체결 취소: {config?.cancelPendingEntryOrdersAtEnd ? '활성화' : '유지'}
            </span>
          </div>
        </div>

        {/* Right: Current State & Interactive Verification Tool */}
        <div className="flex items-center gap-4 flex-wrap">
          {getStatusBadge()}

          <button
            onClick={() => setShowTestPanel(!showTestPanel)}
            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 transition-colors"
          >
            {showTestPanel ? '시간 검증 닫기' : '세션 시간 판정 검증기'}
          </button>
        </div>
      </div>

      {/* Expandable Interactive Verification Panel for Testing 08:59:59, 09:00:00, 15:19:59, 15:20:00 */}
      {showTestPanel && (
        <div className="mt-3 pt-3 border-t border-neutral-800 bg-neutral-950/60 p-3 rounded max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-semibold text-neutral-200">
              서버 isEntryTimeAllowed() 단일 함수 실시간 판정 테스트
            </span>
            <span className="text-neutral-400 text-[11px]">
              설정된 세션({config?.startTime} ~ {config?.endTime}) 기준으로 서버 측 판정 결과를 즉시 검증합니다.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-neutral-400">원클릭 테스트 시각:</span>
            <button
              onClick={() => {
                setTestTimeInput('08:59:59');
                runTimeTest('08:59:59');
              }}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-amber-300 font-mono text-[11px]"
            >
              08:59:59 (시작 직전)
            </button>
            <button
              onClick={() => {
                setTestTimeInput('09:00:00');
                runTimeTest('09:00:00');
              }}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-emerald-300 font-mono text-[11px]"
            >
              09:00:00 (시작 정각)
            </button>
            <button
              onClick={() => {
                setTestTimeInput('15:19:59');
                runTimeTest('15:19:59');
              }}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-emerald-300 font-mono text-[11px]"
            >
              15:19:59 (종료 직전)
            </button>
            <button
              onClick={() => {
                setTestTimeInput('15:20:00');
                runTimeTest('15:20:00');
              }}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-rose-300 font-mono text-[11px]"
            >
              15:20:00 (종료 정각)
            </button>

            <div className="flex items-center gap-1 ml-auto">
              <input
                type="text"
                placeholder="HH:mm:ss"
                value={testTimeInput}
                onChange={(e) => setTestTimeInput(e.target.value)}
                className="bg-neutral-900 border border-neutral-700 px-2 py-1 rounded text-white font-mono text-xs w-24"
              />
              <button
                onClick={() => runTimeTest(testTimeInput)}
                disabled={isTesting}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
              >
                판정 검증
              </button>
            </div>
          </div>

          {testResult && (
            <div className="mt-2.5 p-2 bg-neutral-900 rounded border border-neutral-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">입력 시각:</span>
                <span className="font-mono text-white font-semibold">{testResult.kstTimeString}</span>
                <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-neutral-400">상태:</span>
                <span className="font-mono text-blue-300">{testResult.sessionState}</span>
                <span className="text-neutral-500">|</span>
                <span className="text-neutral-400">신규 매수 허용:</span>
                <span className={`font-bold ${testResult.allowed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {testResult.allowed ? '허용 (TRUE)' : '거부 (FALSE)'}
                </span>
              </div>
              <div className="text-neutral-300 italic">
                "{testResult.reason}"
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
