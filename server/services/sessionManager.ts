import { z } from 'zod';
import { getDb, saveDb, TradingSessionConfig, AuditLog, Order } from '../db/database.js';

export type { TradingSessionConfig };

export const sessionConfigSchema = z.object({
  enabled: z.boolean(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시작 시각은 HH:mm 형식이어야 합니다 (00:00 ~ 23:59)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '종료 시각은 HH:mm 형식이어야 합니다 (00:00 ~ 23:59)'),
  timezone: z.literal('Asia/Seoul'),
  cancelPendingEntryOrdersAtEnd: z.boolean(),
  blockNewEntryOutside: z.boolean(),
}).refine((data) => {
  const [sH, sM] = data.startTime.split(':').map(Number);
  const [eH, eM] = data.endTime.split(':').map(Number);
  const startMinutes = sH * 60 + sM;
  const endMinutes = eH * 60 + eM;
  return endMinutes > startMinutes;
}, {
  message: '종료 시각은 시작 시각보다 늦어야 합니다 (자정에 걸치는 야간 거래는 v1.0에서 미지원).',
  path: ['endTime'],
});

export type SessionState = 'PRE_SESSION' | 'OPEN_SESSION' | 'POST_SESSION' | 'RESTRICTED' | 'DISABLED';

export interface EntryTimeCheckResult {
  allowed: boolean;
  reason: string;
  sessionState: SessionState;
  kstTimeString: string;
  kstDateString: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
}

/**
 * Converts a date into KST (Asia/Seoul) components.
 */
export function getKstComponents(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
  timeString: string;
  dateString: string;
} {
  // Use Intl to reliably get Asia/Seoul time in any OS locale
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);

  // Map weekday to 0..6 (0=Sun, 6=Sat)
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
  };
  const dayOfWeek = weekdayMap[partMap.weekday] ?? 0;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const timeString = `${pad(hour)}:${pad(minute)}:${pad(second)}`;
  const dateString = `${year}-${pad(month)}-${pad(day)}`;

  return { year, month, day, hour, minute, second, dayOfWeek, timeString, dateString };
}

/**
 * Server-authoritative single function to verify whether a new entry buy order is allowed.
 * All new buy orders MUST pass this function.
 */
export function isEntryTimeAllowed(
  config: TradingSessionConfig,
  checkDate: Date = new Date()
): EntryTimeCheckResult {
  const kst = getKstComponents(checkDate);

  // 1. Weekend check: KRX exchanges are strictly closed on Saturday & Sunday
  if (kst.dayOfWeek === 0 || kst.dayOfWeek === 6) {
    return {
      allowed: false,
      reason: `거래소 휴장일(주말: ${kst.dayOfWeek === 0 ? '일요일' : '토요일'})에는 신규 매수 주문이 불가합니다.`,
      sessionState: 'RESTRICTED',
      kstTimeString: kst.timeString,
      kstDateString: kst.dateString,
      dayOfWeek: kst.dayOfWeek,
    };
  }

  // 2. Validate configuration times
  const startMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(config.startTime);
  const endMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(config.endTime);
  if (!startMatch || !endMatch) {
    return {
      allowed: false,
      reason: `유효하지 않은 거래 시간 형식(시작: ${config.startTime}, 종료: ${config.endTime})입니다.`,
      sessionState: 'RESTRICTED',
      kstTimeString: kst.timeString,
      kstDateString: kst.dateString,
      dayOfWeek: kst.dayOfWeek,
    };
  }

  const [startH, startM] = [parseInt(startMatch[1], 10), parseInt(startMatch[2], 10)];
  const [endH, endM] = [parseInt(endMatch[1], 10), parseInt(endMatch[2], 10)];

  const startTotalSec = startH * 3600 + startM * 60;
  const endTotalSec = endH * 3600 + endM * 60;
  const currentTotalSec = kst.hour * 3600 + kst.minute * 60 + kst.second;

  if (startTotalSec >= endTotalSec) {
    return {
      allowed: false,
      reason: `종료 시각(${config.endTime})은 시작 시각(${config.startTime})보다 커야 합니다.`,
      sessionState: 'RESTRICTED',
      kstTimeString: kst.timeString,
      kstDateString: kst.dateString,
      dayOfWeek: kst.dayOfWeek,
    };
  }

  // 3. When session restrictions are disabled by user, fallback to KRX standard trading window (09:00:00 ~ 15:30:00)
  if (!config.enabled) {
    const krxOpenSec = 9 * 3600;
    const krxCloseSec = 15 * 3600 + 30 * 60;
    if (currentTotalSec < krxOpenSec || currentTotalSec >= krxCloseSec) {
      return {
        allowed: false,
        reason: `거래 세션 제한 미사용 상태이나, 한국거래소 정규장 운영시간(09:00~15:30) 외에는 신규 매수가 불가합니다. (현재 KST ${kst.timeString})`,
        sessionState: 'DISABLED',
        kstTimeString: kst.timeString,
        kstDateString: kst.dateString,
        dayOfWeek: kst.dayOfWeek,
      };
    }
    return {
      allowed: true,
      reason: `거래 세션 제한 비활성화(한국거래소 정규장 운영시간 내 정상 진입 허용)`,
      sessionState: 'OPEN_SESSION',
      kstTimeString: kst.timeString,
      kstDateString: kst.dateString,
      dayOfWeek: kst.dayOfWeek,
    };
  }

  // 4. Strict user-defined trading session evaluation
  if (currentTotalSec < startTotalSec) {
    return {
      allowed: false,
      reason: `거래 시작 시각(${config.startTime}:00) 이전에는 신규 매수가 금지됩니다. (현재 KST ${kst.timeString})`,
      sessionState: 'PRE_SESSION',
      kstTimeString: kst.timeString,
      kstDateString: kst.dateString,
      dayOfWeek: kst.dayOfWeek,
    };
  }

  if (currentTotalSec >= endTotalSec) {
    return {
      allowed: false,
      reason: `거래 종료 시각(${config.endTime}:00) 이후에는 신규 매수가 차단됩니다. (현재 KST ${kst.timeString})`,
      sessionState: 'POST_SESSION',
      kstTimeString: kst.timeString,
      kstDateString: kst.dateString,
      dayOfWeek: kst.dayOfWeek,
    };
  }

  // Within range [startTotalSec, endTotalSec)
  return {
    allowed: true,
    reason: `사용자 지정 거래 세션(${config.startTime} ~ ${config.endTime}) 내 신규 매수 허용`,
    sessionState: 'OPEN_SESSION',
    kstTimeString: kst.timeString,
    kstDateString: kst.dateString,
    dayOfWeek: kst.dayOfWeek,
  };
}

export class SessionManager {
  private static cachedConfig: TradingSessionConfig | null = null;
  private static lastKnownState: SessionState = 'PRE_SESSION';

  public static async getConfig(): Promise<TradingSessionConfig> {
    if (this.cachedConfig) return this.cachedConfig;
    const db = await getDb();
    const rows = db.exec('SELECT id, enabled, startTime, endTime, timezone, cancelPendingEntryOrdersAtEnd, blockNewEntryOutside, updatedAt FROM session_config WHERE id = 1');
    if (rows.length > 0 && rows[0].values.length > 0) {
      const v = rows[0].values[0];
      this.cachedConfig = {
        id: Number(v[0]),
        enabled: Boolean(v[1]),
        startTime: String(v[2]),
        endTime: String(v[3]),
        timezone: String(v[4]),
        cancelPendingEntryOrdersAtEnd: Boolean(v[5]),
        blockNewEntryOutside: Boolean(v[6]),
        updatedAt: String(v[7]),
      };
      return this.cachedConfig;
    }
    throw new Error('Trading session configuration not found');
  }

  public static async updateConfig(partial: Partial<TradingSessionConfig>): Promise<TradingSessionConfig> {
    const current = await this.getConfig();
    const merged = { ...current, ...partial, updatedAt: new Date().toISOString() };
    
    // Validate with zod
    const validated = sessionConfigSchema.parse(merged);
    
    const db = await getDb();
    db.run(
      `UPDATE session_config 
       SET enabled = ?, startTime = ?, endTime = ?, timezone = ?, cancelPendingEntryOrdersAtEnd = ?, blockNewEntryOutside = ?, updatedAt = ?
       WHERE id = 1`,
      [
        validated.enabled ? 1 : 0,
        validated.startTime,
        validated.endTime,
        validated.timezone,
        validated.cancelPendingEntryOrdersAtEnd ? 1 : 0,
        validated.blockNewEntryOutside ? 1 : 0,
        merged.updatedAt,
      ]
    );
    saveDb(db);

    this.cachedConfig = { ...merged, ...validated };

    // Audit log
    await this.logAudit('CONFIG', 'UPDATE_SESSION_CONFIG', undefined, 
      `세션 설정 변경: 활성화=${validated.enabled}, 시작=${validated.startTime}, 종료=${validated.endTime}, 종료시미체결취소=${validated.cancelPendingEntryOrdersAtEnd}`);

    return this.cachedConfig;
  }

  public static async checkEntryAllowed(checkDate: Date = new Date()): Promise<EntryTimeCheckResult> {
    const config = await this.getConfig();
    return isEntryTimeAllowed(config, checkDate);
  }

  /**
   * Periodic tick to evaluate session state transitions and auto-cancel pending buy orders if session ends.
   */
  public static async handleSessionTick(now: Date = new Date()): Promise<void> {
    const config = await this.getConfig();
    const result = isEntryTimeAllowed(config, now);

    // If transitioned into POST_SESSION
    if (this.lastKnownState === 'OPEN_SESSION' && result.sessionState === 'POST_SESSION') {
      await this.logAudit('SESSION', 'SESSION_ENDED', undefined, 
        `거래 세션 종료 감지 (${config.endTime}:00 도달). 신규 매수 차단 및 사후 처리 시작.`);

      if (config.cancelPendingEntryOrdersAtEnd) {
        await this.cancelAllPendingEntryOrders('세션 종료에 따른 신규 매수 미체결 주문 자동 취소');
      }
    } else if (this.lastKnownState !== 'OPEN_SESSION' && result.sessionState === 'OPEN_SESSION') {
      await this.logAudit('SESSION', 'SESSION_STARTED', undefined, 
        `거래 세션 시작 감지 (${config.startTime}:00). 신규 매수 허용 활성화.`);
    }

    this.lastKnownState = result.sessionState;
  }

  public static async cancelAllPendingEntryOrders(reason: string): Promise<number> {
    const db = await getDb();
    const rows = db.exec(`SELECT id, stockCode, stockName, quantity, price FROM orders WHERE orderType = 'BUY' AND status = 'PENDING'`);
    if (rows.length === 0 || rows[0].values.length === 0) {
      return 0;
    }

    const cancelledCount = rows[0].values.length;
    const now = new Date().toISOString();

    db.run(
      `UPDATE orders 
       SET status = 'CANCELLED', reason = ?, updatedAt = ?
       WHERE orderType = 'BUY' AND status = 'PENDING'`,
      [reason, now]
    );
    saveDb(db);

    for (const v of rows[0].values) {
      const orderId = String(v[0]);
      const stockCode = String(v[1]);
      const stockName = String(v[2]);
      await this.logAudit('ORDER', 'AUTO_CANCEL_BUY_ORDER', stockCode, 
        `주문 ID: ${orderId} (${stockName}) 자동 취소 완료. 사유: ${reason}`);
    }

    await this.logAudit('SESSION', 'CANCELLED_PENDING_BUY_AT_SESSION_END', undefined, 
      `총 ${cancelledCount}건의 미체결 매수 주문을 안전하게 취소했습니다.`);

    return cancelledCount;
  }

  public static async logAudit(category: AuditLog['category'], action: string, stockCode?: string, details: string = ''): Promise<void> {
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO audit_logs (timestamp, category, action, stockCode, details) VALUES (?, ?, ?, ?, ?)`,
        [now, category, action, stockCode || null, details]
      );
      saveDb(db);
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }
}
