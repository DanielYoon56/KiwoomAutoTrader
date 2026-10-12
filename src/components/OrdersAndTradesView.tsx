import React, { useState } from 'react';
import { History, FileText, CheckCircle2, Clock, XCircle, Filter, RefreshCw } from 'lucide-react';
import { Order, AuditLog } from '../types/trader';

interface OrdersAndTradesViewProps {
  orders: Order[];
  logs: AuditLog[];
  onRefresh: () => void;
}

export const OrdersAndTradesView: React.FC<OrdersAndTradesViewProps> = ({ orders, logs, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'logs'>('orders');
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>('ALL');

  const filteredLogs = logs.filter((log) => {
    if (logCategoryFilter === 'ALL') return true;
    return log.category === logCategoryFilter;
  });

  const getOrderStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'FILLED':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'PENDING':
        return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'CANCELLED':
        return <XCircle className="w-3.5 h-3.5 text-neutral-400" />;
      case 'REJECTED':
        return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Refresh */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-1.5 text-xs font-semibold pb-1 border-b-2 transition-colors ${
              activeTab === 'orders'
                ? 'text-white border-blue-500'
                : 'text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>모의 주문 및 체결 내역 ({orders.length}건)</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 text-xs font-semibold pb-1 border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'text-white border-blue-500'
                : 'text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>SQLite 영속 감사 로그 ({logs.length}건)</span>
          </button>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 text-xs transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>새로고침</span>
        </button>
      </div>

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-12 text-center text-xs text-neutral-400">
              <History className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
              <div>생성된 주문 내역이 없습니다.</div>
              <div className="text-neutral-500 mt-1">
                자동매매 엔진 또는 모의매매 실행 시 생성된 주문이 이곳에 기록됩니다.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="py-2.5 px-3.5 font-medium">주문 시각</th>
                    <th className="py-2.5 px-3 font-medium">종목코드 / 종목명</th>
                    <th className="py-2.5 px-3 font-medium text-center">구분</th>
                    <th className="py-2.5 px-3 font-medium text-right">주문수량</th>
                    <th className="py-2.5 px-3 font-medium text-right">주문단가</th>
                    <th className="py-2.5 px-3 font-medium text-right">체결가</th>
                    <th className="py-2.5 px-3 font-medium text-center">상태</th>
                    <th className="py-2.5 px-3.5 font-medium text-left">주문 및 체결 사유</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 font-mono">
                  {orders.map((order) => {
                    const isBuy = order.orderType === 'BUY';
                    const timeStr = new Date(order.createdAt).toLocaleTimeString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      hour12: false,
                    });
                    const dateStr = new Date(order.createdAt).toLocaleDateString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                    });

                    return (
                      <tr key={order.id} className="hover:bg-neutral-800/40">
                        <td className="py-3 px-3.5 text-neutral-400">
                          <div>{timeStr}</div>
                          <div className="text-[10px] text-neutral-500">{dateStr}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white font-sans">{order.stockName}</div>
                          <div className="text-[11px] text-neutral-400">{order.stockCode}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              isBuy
                                ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                                : 'bg-blue-950/60 text-blue-300 border border-blue-800/60'
                            }`}
                          >
                            {isBuy ? '매수' : '매도'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-neutral-200">
                          {order.quantity.toLocaleString()}주
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-neutral-200">
                          {order.price.toLocaleString()}원
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-white font-semibold">
                          {order.filledPrice ? `${order.filledPrice.toLocaleString()}원` : '-'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 font-sans">
                            {getOrderStatusIcon(order.status)}
                            <span className="text-[11px] text-neutral-300">{order.status}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-left font-sans text-neutral-300 text-[11px] max-w-xs">
                          {order.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
          {/* Category Filter Bar */}
          <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Filter className="w-3.5 h-3.5" />
              <span>카테고리 필터:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {['ALL', 'SESSION', 'ORDER', 'ENTRY', 'EXIT', 'RISK', 'CONFIG', 'SYSTEM'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setLogCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    logCategoryFilter === cat
                      ? 'bg-blue-600 text-white font-medium'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-neutral-400">
              <FileText className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
              <div>감사 로그가 비어 있습니다.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800 font-sans">
                  <tr>
                    <th className="py-2.5 px-3.5 font-medium w-24">ID</th>
                    <th className="py-2.5 px-3 font-medium w-36">타임스탬프 (KST)</th>
                    <th className="py-2.5 px-3 font-medium text-center w-28">카테고리</th>
                    <th className="py-2.5 px-3 font-medium w-48">액션</th>
                    <th className="py-2.5 px-3 font-medium text-center w-24">종목코드</th>
                    <th className="py-2.5 px-3.5 font-medium text-left">상세 내용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filteredLogs.map((log) => {
                    const timeStr = new Date(log.timestamp).toLocaleTimeString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      hour12: false,
                    });

                    return (
                      <tr key={log.id} className="hover:bg-neutral-800/40">
                        <td className="py-2.5 px-3.5 text-neutral-500">#{log.id}</td>
                        <td className="py-2.5 px-3 text-neutral-300 tabular-nums">{timeStr}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[11px] text-neutral-400">
                            {log.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-white font-semibold text-[11px]">
                          {log.action}
                        </td>
                        <td className="py-2.5 px-3 text-center text-neutral-400">
                          {log.stockCode || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 text-neutral-300 font-sans text-[11px] leading-relaxed">
                          {log.details}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
