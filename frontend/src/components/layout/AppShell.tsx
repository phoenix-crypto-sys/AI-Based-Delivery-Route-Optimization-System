import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Compass, Radio, Smartphone, Navigation } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  connected?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ children, connected = true }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isNavigation = location.pathname.startsWith('/navigation') || location.pathname === '/';
  const isLive = location.pathname.startsWith('/live');
  const isDriver = location.pathname.startsWith('/driver');

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070B14] flex flex-col select-none">
      {/* Top Application Bar (Persistent across modes) */}
      <nav className="h-14 z-50 flex items-center justify-between px-5 bg-slate-950/98 border-b border-slate-800 shrink-0">
        {/* Brand & Platform Identifier */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-display font-bold tracking-tight text-white">
                Vanguard Navigator
              </span>
              <span className="text-[10px] font-telemetry px-1.5 py-0.5 rounded bg-slate-900 text-blue-400 font-semibold border border-blue-900/40">
                HYDERABAD
              </span>
            </div>
          </div>
        </div>

        {/* Real-World Mode Switcher: Consumer Navigation vs Fleet Dispatch */}
        <div className="relative flex items-center p-1 rounded-full bg-slate-900/95 border border-slate-800 shadow-inner h-9.5 w-76 select-none">
          {/* Animated Sliding Background Thumb */}
          <div
            className={`absolute top-1 bottom-1 w-36.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] ${
              isNavigation
                ? 'left-1 bg-linear-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-950/80 border border-blue-400/40'
                : 'left-38 bg-linear-to-r from-slate-700 to-slate-800 shadow-lg border border-slate-600/40'
            }`}
          />

          {/* Left Mode: Consumer Navigation */}
          <button
            type="button"
            onClick={() => navigate('/navigation')}
            className={`relative z-10 w-36.5 h-full flex items-center justify-center gap-1.5 rounded-full text-xs font-display transition-colors duration-200 ${
              isNavigation
                ? 'text-white font-bold'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <Navigation className={`w-3.5 h-3.5 ${isNavigation ? 'text-blue-100' : 'text-slate-500'}`} />
            <span>Consumer Nav</span>
          </button>

          {/* Right Mode: Live Fleet Dispatch */}
          <button
            type="button"
            onClick={() => navigate('/live')}
            className={`relative z-10 w-36.5 h-full flex items-center justify-center gap-1.5 rounded-full text-xs font-display transition-colors duration-200 ${
              isLive
                ? 'text-white font-bold'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isLive ? 'text-blue-100' : 'text-slate-500'}`} />
            <span>Fleet Dispatch</span>
            {isLive && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>
        </div>

        {/* Right Tools: Driver Companion & Real GPS Status */}
        <div className="flex items-center gap-3">
          <Link
            to="/driver"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-display transition-all ${
              isDriver
                ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 font-semibold'
                : 'bg-slate-900/90 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-500'
            }`}
            title="Open Turn-by-Turn Mobile Driver Companion with Voice Guidance"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Driver Companion</span>
          </Link>

          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-telemetry text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-[10px] text-slate-400">
              {connected ? 'ONLINE' : 'CONNECTING'}
            </span>
          </div>
        </div>
      </nav>

      {/* Main View Area */}
      <main className="flex-1 relative overflow-hidden">
        {children}
      </main>
    </div>
  );
};

export default AppShell;
