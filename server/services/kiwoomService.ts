/**
 * Kiwoom Securities REST API Specifications & Adapter Layer
 * Strictly separates Real Order execution from Mock/Paper trading.
 */

export interface KiwoomApiSpec {
  trId: string;
  name: string;
  endpoint: string;
  method: 'GET' | 'POST';
  description: string;
  requestSchema: Record<string, string>;
  responseSchema: Record<string, string>;
  isMockSupported: boolean;
  notes: string;
}

export const KIWOOM_API_SPECS: Record<string, KiwoomApiSpec> = {
  OAUTH_TOKEN: {
    trId: 'AUTH_001',
    name: '접근 토큰 발급 (OAuth2.0 Token)',
    endpoint: '/oauth2/token',
    method: 'POST',
    description: '키움 모의투자/실서버 접근을 위한 OAuth2 Bearer 토큰 발급. 유효기간 24시간.',
    requestSchema: {
      grant_type: 'client_credentials',
      appkey: 'string (발급받은 앱키)',
      appsecret: 'string (발급받은 시크릿)',
    },
    responseSchema: {
      access_token: 'string (Bearer 토큰)',
      token_type: 'Bearer',
      expires_in: 'number (86400)',
    },
    isMockSupported: true,
    notes: '토큰 만료 시 자동 재발급 로직 필수. 키와 시크릿은 프론트엔드 노출 금지.',
  },
  STOCK_PRICE: {
    trId: 'ka01010',
    name: '국내주식 현재가 시세',
    endpoint: '/uapi/domestic-stock/v1/quotations/inquire-price',
    method: 'GET',
    description: '종목코드 기준 현재가, 전일대비, 등락률, 거래량 조회.',
    requestSchema: {
      FID_COND_MRKT_DIV_CODE: 'J (주식)',
      FID_INPUT_ISCD: '005930 (6자리 종목코드)',
    },
    responseSchema: {
      stck_prpr: 'string (현재가, KRW 정수 변환)',
      prdy_vrss: 'string (전일대비)',
      prdy_ctrt: 'string (등락률 %)',
      acml_vol: 'string (누적거래량)',
    },
    isMockSupported: true,
    notes: '원화 정수 파싱 적용, 음수/양수 부호 보존 필수.',
  },
  EXECUTION_STRENGTH: {
    trId: 'ka01015',
    name: '국내주식 체결강도',
    endpoint: '/uapi/domestic-stock/v1/quotations/inquire-chegang',
    method: 'GET',
    description: '당일 및 직전 체결강도(매수체결량/매도체결량 * 100) 조회.',
    requestSchema: {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: '종목코드',
    },
    responseSchema: {
      tday_rltv: 'string (체결강도 %, 예: 114.85)',
      tot_buy_vol: 'string (총매수체결량)',
      tot_sell_vol: 'string (총매도체결량)',
    },
    isMockSupported: true,
    notes: '체결강도 100% 이상일 때 매수세 우위.',
  },
  PROGRAM_NET_BUY: {
    trId: 'ka01035',
    name: '프로그램 매매 투자자별 및 순매수 동향',
    endpoint: '/uapi/domestic-stock/v1/quotations/inquire-program-trade',
    method: 'GET',
    description: '차익·비차익 합산 프로그램 순매수 금액 및 수량 조회.',
    requestSchema: {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: '종목코드',
    },
    responseSchema: {
      pgm_netprc: 'string (순매수금액, 백만원 또는 천원 단위)',
      pgm_netvol: 'string (순매수수량)',
      time: 'string (집계 시각 HHmmss)',
    },
    isMockSupported: true,
    notes: '중요: 부호 유지 필수(-는 매도 우위, 절댓값 변환 금지). 공식 단위 확인 후 정수 KRW(원)로 정규화.',
  },
  CONDITION_SEARCH: {
    trId: 'ka01080',
    name: '키움 조건검색식 목록 및 포착 종목',
    endpoint: '/uapi/domestic-stock/v1/quotations/psearch-result',
    method: 'GET',
    description: '영웅문/OpenAPI에서 저장한 조건검색식에 실시간 포착된 종목 목록.',
    requestSchema: {
      user_id: 'string',
      seq: 'number (검색식 인덱스)',
    },
    responseSchema: {
      output2: 'Array<{ code: string; name: string; price: string }>',
    },
    isMockSupported: true,
    notes: '실시간 편입/이탈 이벤트는 REST 폴링 또는 웹소켓으로 수신.',
  },
  MOCK_ORDER: {
    trId: 'ka10010',
    name: '모의투자 주식 주문 (매수/매도)',
    endpoint: '/uapi/domestic-stock/v1/trading/order-cash',
    method: 'POST',
    description: '키움 모의투자 서버로 전송하는 가상 주문.',
    requestSchema: {
      CANO: '계좌번호 앞 8자리',
      ACNT_PRDT_CD: '01',
      PDNO: '종목코드',
      ORD_DVSN: '00 (지정가) / 01 (시장가)',
      ORD_QTY: '주문수량',
      ORD_UNPR: '주문단가',
    },
    responseSchema: {
      ODNO: '주문번호',
      ORD_TMD: '주문시각',
    },
    isMockSupported: true,
    notes: 'v1.0 초기버전은 실제 외부 API 호출 대신 완전히 독립된 PaperBroker 내부 시뮬레이터로 안전 처리.',
  },
};

/**
 * Strict Safety Fuse: Real Account Order Adapter
 * GUARANTEE: Real orders are completely blocked and disconnected in v1.0.
 */
export class RealOrderAdapter {
  public static executeRealOrder(): never {
    throw new Error(
      'FATAL_SECURITY_LOCK: Real account order execution is strictly disabled in KiwoomAutoTrader v1.0. ' +
      'All live trades are physically blocked at the adapter barrier.'
    );
  }
}

export interface MonitoredStock {
  code: string;
  name: string;
  currentPrice: number;
  changeRate: number;
  executionStrength: number; // 체결강도 % (e.g. 118.5)
  programNetBuyRaw: number;  // 원본 응답값 (예: 1250 백만원 단위 or 원단위)
  programNetBuyUnit: string; // '백만원' | '원'
  programNetBuyKRW: number;  // 정규화된 정수 원화 (예: 1,250,000,000)
  inConditionSearch: boolean;
  conditionFormulaName: string;
  caughtFormulas?: string[]; // Multiple condition formula IDs that caught this stock
  updatedAt: string;         // ISO timestamp
  isFresh: boolean;
  freshnessSeconds: number;
}

/**
 * Normalizes program net buy amount into exact signed integer KRW (원화 정수).
 * Preserves negative sign! (Negative means institutional net selling).
 */
export function normalizeProgramNetBuy(rawValue: number, unit: '백만원' | '원'): number {
  if (isNaN(rawValue)) return 0;
  if (unit === '백만원') {
    return Math.round(rawValue * 1_000_000);
  }
  return Math.round(rawValue);
}
