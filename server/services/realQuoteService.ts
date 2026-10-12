export interface RealQuote {
  code: string;
  name: string;
  price: number;
  changeRate: number;
  compareToPreviousPrice: number;
  exchangeName: string; // KOSPI or KOSDAQ
  marketStatus: string;
  updatedAt: string;
}

export interface StockDirectoryItem {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
}

// Comprehensive directory of major domestic stocks
export const DOMESTIC_STOCK_DIRECTORY: StockDirectoryItem[] = [
  { code: '005930', name: '삼성전자', market: 'KOSPI' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { code: '373220', name: 'LG에너지솔루션', market: 'KOSPI' },
  { code: '207940', name: '삼성바이오로직스', market: 'KOSPI' },
  { code: '005380', name: '현대차', market: 'KOSPI' },
  { code: '000270', name: '기아', market: 'KOSPI' },
  { code: '068270', name: '셀트리온', market: 'KOSPI' },
  { code: '005490', name: 'POSCO홀딩스', market: 'KOSPI' },
  { code: '035420', name: 'NAVER', market: 'KOSPI' },
  { code: '035720', name: '카카오', market: 'KOSPI' },
  { code: '012450', name: '한화에어로스페이스', market: 'KOSPI' },
  { code: '247540', name: '에코프로비엠', market: 'KOSDAQ' },
  { code: '086520', name: '에코프로', market: 'KOSDAQ' },
  { code: '196170', name: '알테오젠', market: 'KOSDAQ' },
  { code: '000810', name: '삼성화재', market: 'KOSPI' },
  { code: '051910', name: 'LG화학', market: 'KOSPI' },
  { code: '006400', name: '삼성SDI', market: 'KOSPI' },
  { code: '010130', name: '고려아연', market: 'KOSPI' },
  { code: '028260', name: '삼성물산', market: 'KOSPI' },
  { code: '105560', name: 'KB금융', market: 'KOSPI' },
  { code: '055550', name: '신한지주', market: 'KOSPI' },
  { code: '032830', name: '삼성생명', market: 'KOSPI' },
  { code: '086790', name: '하나금융지주', market: 'KOSPI' },
  { code: '003670', name: '포스코퓨처엠', market: 'KOSPI' },
  { code: '042700', name: '한미반도체', market: 'KOSPI' },
  { code: '034020', name: '두산에너빌리티', market: 'KOSPI' },
  { code: '259960', name: '크래프톤', market: 'KOSPI' },
  { code: '011200', name: 'HMM', market: 'KOSPI' },
  { code: '015760', name: '한국전력', market: 'KOSPI' },
  { code: '033780', name: 'KT&G', market: 'KOSPI' },
  { code: '329180', name: 'HD현대중공업', market: 'KOSPI' },
  { code: '277810', name: '한화시스템', market: 'KOSPI' },
  { code: '003550', name: 'LG', market: 'KOSPI' },
  { code: '018260', name: '삼성에스디에스', market: 'KOSPI' },
  { code: '323410', name: '카카오뱅크', market: 'KOSPI' },
  { code: '009150', name: '삼성전기', market: 'KOSPI' },
  { code: '010140', name: '삼성중공업', market: 'KOSPI' },
  { code: '011070', name: 'LG이노텍', market: 'KOSPI' },
];

export class RealQuoteService {
  private static cache: Map<string, RealQuote> = new Map();

  /**
   * Fetches genuine real market quotes for a domestic stock from public financial endpoint.
   */
  public static async fetchRealQuote(code: string): Promise<RealQuote | null> {
    try {
      const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });

      if (!res.ok) return this.cache.get(code) || null;
      const data = await res.json();

      if (!data || !data.closePrice) return this.cache.get(code) || null;

      const rawClose = String(data.closePrice).replace(/,/g, '');
      const price = parseInt(rawClose, 10);
      const changeRate = parseFloat(data.fluctuationsRatio || '0');
      const compareDiff = parseInt(String(data.compareToPreviousClosePrice || '0').replace(/,/g, ''), 10);

      const quote: RealQuote = {
        code,
        name: data.stockName || code,
        price: isNaN(price) ? 0 : price,
        changeRate: isNaN(changeRate) ? 0 : changeRate,
        compareToPreviousPrice: isNaN(compareDiff) ? 0 : compareDiff,
        exchangeName: data.stockExchangeName || 'KOSPI',
        marketStatus: data.marketStatus || 'OPEN',
        updatedAt: new Date().toISOString(),
      };

      if (quote.price > 0) {
        this.cache.set(code, quote);
        return quote;
      }
      return this.cache.get(code) || null;
    } catch (err) {
      console.error(`Failed to fetch real quote for ${code}:`, err);
      return this.cache.get(code) || null;
    }
  }

  /**
   * Batch fetches real quotes for multiple stock codes.
   */
  public static async fetchMultipleQuotes(codes: string[]): Promise<Record<string, RealQuote>> {
    const results: Record<string, RealQuote> = {};
    await Promise.all(
      codes.map(async (code) => {
        const quote = await this.fetchRealQuote(code);
        if (quote) {
          results[code] = quote;
        }
      })
    );
    return results;
  }

  /**
   * Searches domestic stock directory by query (code or Korean name).
   */
  public static searchStocks(query: string): StockDirectoryItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return DOMESTIC_STOCK_DIRECTORY.slice(0, 10);

    return DOMESTIC_STOCK_DIRECTORY.filter(
      (s) => s.code.includes(q) || s.name.toLowerCase().includes(q)
    );
  }
}
