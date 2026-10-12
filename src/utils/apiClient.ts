/**
 * Safe JSON fetch utility for AI Studio environment.
 * Prevents "Unexpected token '<', <!doctype... is not valid JSON" errors
 * when endpoints return HTML error/warmup pages or during dev server reload.
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  [key: string]: any;
}

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: `서버 연결 대기 중 (HTTP ${res.status})`,
      };
    }

    const json = await res.json();
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || '네트워크 요청 중 오류가 발생했습니다.',
    };
  }
}
