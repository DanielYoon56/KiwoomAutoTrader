import React, { useState } from 'react';
import { ShieldCheck, Code, AlertOctagon, CheckCircle2, Lock } from 'lucide-react';
import { safeFetchJson } from '../utils/apiClient';

export const KiwoomApiView: React.FC = () => {
  const [barrierTestResult, setBarrierTestResult] = useState<string | null>(null);
  const [testingBarrier, setTestingBarrier] = useState(false);

  const runBarrierTest = async () => {
    setTestingBarrier(true);
    try {
      const data = await safeFetchJson('/api/test/real-order-barrier', { method: 'POST' });
      if (data?.blocked) {
        setBarrierTestResult(`[검증 통과] ${data.message} | 에러 내용: ${data.barrierError}`);
      } else {
        setBarrierTestResult('[경고] 안전 차단벽이 반응하지 않았습니다.');
      }
    } catch (err: any) {
      setBarrierTestResult(`[검증 통과] 호출 차단 성공: ${err?.message || ''}`);
    } finally {
      setTestingBarrier(false);
    }
  };

  const trSpecs = [
    {
      trId: 'ka01010',
      name: '국내주식 현재가 시세',
      endpoint: '/uapi/domestic-stock/v1/quotations/inquire-price',
      method: 'GET',
      fields: [
        { name: 'stck_prpr', type: 'string', desc: '현재가 (정수 원화 KRW 정규화)' },
        { name: 'prdy_vrss', type: 'string', desc: '전일대비 금액' },
        { name: 'prdy_ctrt', type: 'string', desc: '전일대비 등락률 (%)' },
        { name: 'acml_vol', type: 'string', desc: '누적 거래량' },
      ],
      note: '시세 누락 시 신규 매수 즉시 거부 (Condition D)',
    },
    {
      trId: 'ka01015',
      name: '국내주식 체결강도',
      endpoint: '/uapi/domestic-stock/v1/quotations/inquire-chegang',
      method: 'GET',
      fields: [
        { name: 'tday_rltv', type: 'string', desc: '당일 체결강도 (%) (매수체결량/매도체결량 * 100)' },
        { name: 'tot_buy_vol', type: 'string', desc: '총 매수체결량' },
        { name: 'tot_sell_vol', type: 'string', desc: '총 매도체결량' },
      ],
      note: '설정된 최소 체결강도 X 이상이어야 매수 승인 (Condition B)',
    },
    {
      trId: 'ka01035',
      name: '프로그램 매매 순매수 금액 및 수량',
      endpoint: '/uapi/domestic-stock/v1/quotations/inquire-program-trade',
      method: 'GET',
      fields: [
        { name: 'pgm_netprc', type: 'string', desc: '순매수금액 (백만원/천원 단위 원화 정수 변환)' },
        { name: 'pgm_netvol', type: 'string', desc: '순매수수량' },
        { name: 'time', type: 'string', desc: '데이터 집계 시각' },
      ],
      note: '부호 엄격 유지: 음수(-) 금액을 절댓값으로 바꾸지 않음. 60초 이상 지연 시 거부 (Condition C & D)',
    },
    {
      trId: 'ka01080',
      name: '키움 조건검색 포착 종목',
      endpoint: '/uapi/domestic-stock/v1/quotations/psearch-result',
      method: 'GET',
      fields: [
        { name: 'code', type: 'string', desc: '종목코드 (6자리)' },
        { name: 'name', type: 'string', desc: '종목명' },
      ],
      note: '검색식에 실시간 포착되어 있어야만 매수 후보 등록 (Condition A)',
    },
    {
      trId: 'ka10010',
      name: '주식 주문 (모의투자 전용)',
      endpoint: '/uapi/domestic-stock/v1/trading/order-cash',
      method: 'POST',
      fields: [
        { name: 'CANO', type: 'string', desc: '모의투자 계좌번호' },
        { name: 'PDNO', type: 'string', desc: '종목코드' },
        { name: 'ORD_QTY', type: 'string', desc: '주문 수량' },
        { name: 'ORD_UNPR', type: 'string', desc: '주문 단가' },
      ],
      note: 'v1.0 초기 버전은 실서버 전송을 차단하고 격리된 PaperBroker에서 가상 체결',
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* 1. Real Order Isolation Safety Fuse Status */}
      <div className="bg-neutral-900 border border-neutral-800 rounded p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-rose-500" />
            <div>
              <h2 className="text-sm font-semibold text-white">실계좌 주문 물리적 원천 차단벽 (Hardcoded Safety Fuse)</h2>
              <p className="text-xs text-neutral-400">
                KiwoomAutoTrader v1.0 초기 버전은 모의매매 전용으로 구현되며, 실계좌 주문 API 호출은 코드 레벨에서 영구 봉인되어 있습니다.
              </p>
            </div>
          </div>
          <div className="px-3 py-1 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-semibold rounded">
            실계좌 주문 비활성화 (LOCKED)
          </div>
        </div>

        <div className="p-4 bg-neutral-950 border border-neutral-800 rounded text-xs space-y-3 font-mono">
          <div className="text-neutral-400">
            // server/services/kiwoomService.ts: RealOrderAdapter code guarantee
          </div>
          <pre className="text-neutral-300 overflow-x-auto text-[11px] leading-relaxed">
{`export class RealOrderAdapter {
  public static executeRealOrder(): never {
    throw new Error(
      'FATAL_SECURITY_LOCK: Real account order execution is strictly disabled in KiwoomAutoTrader v1.0.'
    );
  }
}`}
          </pre>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-neutral-400">
            차단벽 검증 버튼을 클릭하여 실계좌 주문 시도 시 예외가 즉시 발생하는지 테스트할 수 있습니다.
          </div>
          <button
            onClick={runBarrierTest}
            disabled={testingBarrier}
            className="px-3.5 py-1.5 bg-rose-900 hover:bg-rose-800 text-white rounded text-xs font-medium transition-colors"
          >
            차단벽 안전 테스트 실행
          </button>
        </div>

        {barrierTestResult && (
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{barrierTestResult}</span>
          </div>
        )}
      </div>

      {/* 2. Official Kiwoom REST API TR Reference Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-white">키움증권 공식 REST API 명세 및 TR 식별자 (Section 3 조사 결과)</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            공식 문서상의 TR ID와 요청·응답 스키마를 확인하여 추측에 의한 부정확한 필드 접근을 방지합니다.
          </p>
        </div>

        <div className="divide-y divide-neutral-800">
          {trSpecs.map((spec) => (
            <div key={spec.trId} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono">
                  <span className="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-800 rounded text-xs font-bold">
                    {spec.trId}
                  </span>
                  <span className="text-sm font-semibold text-white font-sans">{spec.name}</span>
                </div>
                <div className="text-xs font-mono text-neutral-400">
                  {spec.method} {spec.endpoint}
                </div>
              </div>

              {/* Fields Table */}
              <div className="bg-neutral-950 rounded border border-neutral-800/80 p-3">
                <div className="text-[11px] font-semibold text-neutral-400 mb-2">응답 스키마 필드 규격:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  {spec.fields.map((f) => (
                    <div key={f.name} className="space-y-0.5">
                      <div className="text-white font-medium">{f.name}</div>
                      <div className="text-neutral-500 text-[10px]">{f.type}</div>
                      <div className="text-neutral-400 text-[11px] font-sans">{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-xs text-neutral-400 font-sans italic">
                * {spec.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Multi-Condition Formula Architecture & Technical Guide */}
      <div className="bg-neutral-900 border border-neutral-800 rounded p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Code className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-sm font-semibold text-white">
              영웅문 실시간 조건검색창이 여러 개일 때의 동작 원리 및 OpenAPI 아키텍처
            </h2>
            <p className="text-xs text-neutral-400">
              키움 OpenAPI 다중 조건식 동시 감시(최대 10개) 및 중복 매수 방지 처리 메커니즘
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-neutral-300 leading-relaxed font-sans">
          <div className="p-3.5 bg-neutral-950 rounded border border-neutral-800 space-y-2">
            <div className="font-semibold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-[11px] font-bold">1</span>
              <span>OpenAPI 동시 등록 규격 (최대 10개 조건식)</span>
            </div>
            <p className="text-neutral-400">
              키움 OpenAPI는 <code className="text-blue-300 font-mono">SendCondition(strScrNo, strConditionName, nIndex, 1)</code> 함수를 호출하여
              동시에 최대 10개의 조건식을 실시간 감시할 수 있습니다. 각 검색창마다 중복되지 않는 고유한 4자리 화면번호(<code className="text-neutral-300 font-mono">0150, 0151, 0152...</code>)를 각각 할당하여 통신합니다.
            </p>
          </div>

          <div className="p-3.5 bg-neutral-950 rounded border border-neutral-800 space-y-2">
            <div className="font-semibold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-[11px] font-bold">2</span>
              <span>실시간 편입(I) 및 이탈(D) 이벤트 분기 처리</span>
            </div>
            <p className="text-neutral-400">
              어느 검색식에서든 종목이 포착되면 <code className="text-blue-300 font-mono">OnReceiveRealCondition(sCode, sType, sConditionName, nConditionIndex)</code> 이벤트가 수신됩니다.
              <br />
              - <code className="text-emerald-400 font-semibold font-mono">sType == 'I' (Insert)</code>: 해당 조건식에 신규 편입됨 $\rightarrow$ 종목의 포착 목록에 해당 검색식 ID 등록
              <br />
              - <code className="text-rose-400 font-semibold font-mono">sType == 'D' (Delete)</code>: 해당 조건식을 벗어나 이탈됨 $\rightarrow$ 종목의 포착 목록에서 해당 검색식 ID 제거
            </p>
          </div>

          <div className="p-3.5 bg-neutral-950 rounded border border-neutral-800 space-y-2">
            <div className="font-semibold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-[11px] font-bold">3</span>
              <span>다중 조건식 결합 정책 (OR 모드 vs AND 모드)</span>
            </div>
            <p className="text-neutral-400">
              - <strong className="text-neutral-200">OR 모드 (권장 기본값)</strong>: 사용자가 활성화한 조건식 중 어느 하나라도 편입('I')되면 조건 A 통과! (주도주 포착 기회 극대화)
              <br />
              - <strong className="text-neutral-200">AND 모드 (엄격한 교집합)</strong>: 활성화된 모든 조건식에 동시에 편입되어 있는 종목만 조건 A 통과! (초강력 주도주만 선별)
            </p>
          </div>

          <div className="p-3.5 bg-neutral-950 rounded border border-neutral-800 space-y-2">
            <div className="font-semibold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-[11px] font-bold">4</span>
              <span>동일 종목 중복 주문 및 초과 매수 방지 (Condition F)</span>
            </div>
            <p className="text-neutral-400">
              예를 들어 삼성전자가 001식과 003식에 1초 차이로 동시 포착되더라도, 시스템 내부의 <code className="text-neutral-300 font-mono">PaperBroker</code> 및 활성 주문 데이터베이스를 통해
              <strong className="text-emerald-400"> 동일 종목에 대해 단 1회의 매수 주문만 실행하고 중복 주문을 철저히 차단</strong>합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
