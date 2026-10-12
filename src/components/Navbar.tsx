import React from 'react';
import { Play, Pause, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  activeTab: 'dashboard' | 'watchlist' | 'settings' | 'orders' | 'api';
  setActiveTab: (tab: 'dashboard' | 'watchlist' | 'settings' | 'orders' | 'api') => void;
  autoTradingEnabled: boolean;
  onToggleAutoTrading: () => void;
  isToggling: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  autoTradingEnabled,
  onToggleAutoTrading,
  isToggling,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-neutral-800 bg-neutral-950 text-neutral-100 sticky top-0 z-50">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-neutral-200"
        >
          KiwoomAutoTrader
        </a>
        <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>모의매매 전용</span>
        </div>
      </div>

      {/* Zone 2: 4-5 concise single-line nav links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-300">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'dashboard'
              ? 'text-white border-blue-500 font-semibold'
              : 'text-neutral-400 border-transparent hover:text-white'
          }`}
        >
          대시보드
        </button>
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'watchlist'
              ? 'text-white border-blue-500 font-semibold'
              : 'text-neutral-400 border-transparent hover:text-white'
          }`}
        >
          종목 감시
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'settings'
              ? 'text-white border-blue-500 font-semibold'
              : 'text-neutral-400 border-transparent hover:text-white'
          }`}
        >
          매매 설정 (시간·전략)
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'orders'
              ? 'text-white border-blue-500 font-semibold'
              : 'text-neutral-400 border-transparent hover:text-white'
          }`}
        >
          주문·체결 및 감사기록
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'api'
              ? 'text-white border-blue-500 font-semibold'
              : 'text-neutral-400 border-transparent hover:text-white'
          }`}
        >
          키움 API 명세 & 안전검증
        </button>
      </nav>

      {/* Zone 3: 1 primary action (Emergency Killswitch / Auto Trading Control) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onToggleAutoTrading}
          disabled={isToggling}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
            autoTradingEnabled
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {autoTradingEnabled ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>자동매매 일시정지</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>자동매매 가동</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
