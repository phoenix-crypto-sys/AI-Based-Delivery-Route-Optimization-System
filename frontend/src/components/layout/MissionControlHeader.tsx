import React, { useState } from 'react';
import { Radio, Cpu, Map, RotateCcw, Compass, Info } from 'lucide-react';
import type { SimulationState } from '../../types/simulation';

interface MissionControlHeaderProps {
  state: SimulationState | null;
  connected: boolean;
  viewMode: 'ops' | 'brain';
  onToggleViewMode: (mode: 'ops' | 'brain') => void;
  mapMode: 'cyber' | 'real';
  onToggleMapMode: (mode: 'cyber' | 'real') => void;
  onReset: () => void;
}

export const MissionControlHeader: React.FC<MissionControlHeaderProps> = ({
  state,
  connected,
  viewMode,
  onToggleViewMode,
  mapMode,
  onToggleMapMode,
  onReset,
}) => {
  const [showTelemetryDetails, setShowTelemetryDetails] = useState(false);

  const activeFleet = state?.metrics.active_fleet_count ?? 4;
  const totalFleet = state?.metrics.total_fleet_count ?? 4;

  return (
    <header className="absolute top-0 left-0 right-0 h-16 z-30 flex items-center justify-between px-6 glass-panel border-b border-slate-800">
      {/* Cluster 1: Branding & System Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-400">
          <Compass className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-sm font-display font-bold tracking-tight text-white flex items-center gap-2">
            Route Optimizer
            <span className="text-[10px] font-telemetry px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-normal">
              v2.1
            </span>
          </h1>
          <p className="text-[11px] font-body text-slate-400">
            Autonomous fleet routing & simulation
          </p>
        </div>
      </div>

      {/* Cluster 2: Consolidated Simulation Status (Single Compact Readout) */}
      <div className="relative">
        <div
          onMouseEnter={() => setShowTelemetryDetails(true)}
          onMouseLeave={() => setShowTelemetryDetails(false)}
          className="flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs font-telemetry text-slate-300 shadow-sm cursor-pointer hover:border-blue-500/40 transition-colors"
        >
          {/* Live indicator dot */}
          <span className="flex items-center gap-1.5 text-[11px]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? 'bg-emerald-400' : 'bg-rose-500'
              }`}
            />
            <span className="font-semibold text-white tracking-wider">
              {state?.sim_time_str || "08:00:00 AM"}
            </span>
          </span>

          <span className="text-slate-600">•</span>

          <span className="text-slate-300">
            OR-Tools <span className="text-blue-400 font-medium">GLS</span>
          </span>

          <span className="text-slate-600">•</span>

          <span className="text-slate-300">
            <strong className="text-white font-semibold">{activeFleet}</strong>/{totalFleet} Active
          </span>

          <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 ml-1" />
        </div>

        {/* Hover Telemetry Drawer */}
        {showTelemetryDetails && (
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 p-3 rounded-lg glass-panel border border-slate-700/80 text-[11px] font-telemetry text-slate-300 space-y-1.5 shadow-xl z-50 pointer-events-none">
            <div className="flex justify-between text-slate-400">
              <span>Status:</span>
              <span className={connected ? 'text-emerald-400 font-medium' : 'text-rose-400'}>
                {connected ? 'WebSocket Connected' : 'Connecting...'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Solver Latency:</span>
              <span className="text-slate-200">{state?.metrics.solver_execution_time_ms || 18} ms</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Time Rate:</span>
              <span className="text-slate-200">{state?.speed_multiplier || 1}x simulation speed</span>
            </div>
          </div>
        )}
      </div>

      {/* Cluster 3: View & Map Mode Switchers */}
      <div className="flex items-center gap-2.5">
        {/* Street Map vs Cyber Grid */}
        <button
          onClick={() => onToggleMapMode(mapMode === 'cyber' ? 'real' : 'cyber')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:border-slate-500 text-xs font-body text-slate-300 hover:text-white transition-all"
          title="Toggle Street Map vs Cyber Grid"
        >
          <Map className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline text-[11px]">
            {mapMode === 'cyber' ? 'Grid' : 'Satellite'}
          </span>
        </button>

        {/* Ops vs Brain View Segmented Control */}
        <div className="flex items-center p-0.5 rounded-lg bg-slate-900/90 border border-slate-700/70">
          <button
            onClick={() => onToggleViewMode('ops')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-display font-medium transition-all ${
              viewMode === 'ops'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3 h-3" />
            Operations
          </button>
          <button
            onClick={() => onToggleViewMode('brain')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-display font-medium transition-all ${
              viewMode === 'brain'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3 h-3" />
            Brain View
          </button>
        </div>

        {/* Reset */}
        <button
          onClick={onReset}
          className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-all"
          title="Reset Simulation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
