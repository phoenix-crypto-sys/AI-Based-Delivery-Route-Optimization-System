import React, { useState, useRef } from 'react';
import { Play, Pause, Flame, RotateCcw } from 'lucide-react';
import type { SimulationState } from '../../types/simulation';

interface BottomSimulationBarProps {
  state: SimulationState | null;
  onTogglePlay: () => void;
  onSetSpeed: (speed: number) => void;
  onToggleTraffic: () => void;
  onReset: () => void;
}

export const BottomSimulationBar: React.FC<BottomSimulationBarProps> = ({
  state,
  onTogglePlay,
  onSetSpeed,
  onToggleTraffic,
  onReset,
}) => {
  const totalOrders = state?.orders.length || 1;
  const completedOrders = state?.metrics.completed_deliveries || 0;
  const isFinished = totalOrders > 0 && completedOrders >= totalOrders;
  const isPaused = (state?.is_paused ?? false) || isFinished;
  const currentSpeed = state?.speed_multiplier ?? 1.0;
  const progressPercent = Math.min(100, Math.round((completedOrders / totalOrders) * 100));

  // Scrubber hover preview state
  const [hoverPosition, setHoverPosition] = useState<{ x: number; percent: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percent = Math.round((x / rect.width) * 100);
    setHoverPosition({ x, percent });
  };

  const handleMouseLeave = () => {
    setHoverPosition(null);
  };

  return (
    <div className="absolute bottom-4 left-5 right-5 h-16 z-30 glass-panel rounded-xl flex items-center justify-between px-6 border border-slate-800/90 shadow-xl">
      {/* Playback & Speed Controls */}
      <div className="flex items-center gap-2.5">
        {/* Play/Pause/Restart Button */}
        <button
          onClick={isFinished ? onReset : onTogglePlay}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-display text-xs font-semibold transition-all duration-150 active:scale-95 shadow-sm border ${
            isFinished
              ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500'
              : isPaused
              ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
        >
          {isFinished ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </>
          ) : isPaused ? (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause</span>
            </>
          )}
        </button>

        {/* Speed Controls */}
        <div className="flex items-center bg-slate-900/80 rounded-lg p-0.5 border border-slate-700/60">
          {[1.0, 2.0, 5.0, 10.0].map((spd) => (
            <button
              key={spd}
              onClick={() => onSetSpeed(spd)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-telemetry font-medium transition-all duration-150 ${
                currentSpeed === spd
                  ? 'bg-slate-800 text-blue-400 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Center Media Timeline Scrubber with Ghost Position Preview */}
      <div className="flex-1 max-w-xl mx-6 flex items-center gap-3">
        <span className="text-[11px] font-display text-slate-400 font-semibold tracking-wider uppercase">
          Timeline
        </span>

        <div
          ref={trackRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="flex-1 relative h-2 rounded-full bg-slate-800/90 cursor-pointer overflow-visible border border-slate-700/80"
        >
          {/* Progress bar */}
          <div
            className="h-full rounded-full bg-linear-to-r from-blue-600 to-indigo-500 transition-all duration-300"
            style={{ width: `${Math.max(6, progressPercent)}%` }}
          />

          {/* Hover Ghost Marker Tooltip */}
          {hoverPosition && (
            <>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/70 pointer-events-none"
                style={{ left: `${hoverPosition.x}px` }}
              />
              <div
                className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-telemetry text-slate-300 shadow-md pointer-events-none"
                style={{ left: `${hoverPosition.x}px` }}
              >
                {hoverPosition.percent}% Target
              </div>
            </>
          )}
        </div>

        <span className="text-xs font-telemetry text-slate-300 whitespace-nowrap">
          {completedOrders}/{totalOrders} ({progressPercent}%)
        </span>
      </div>

      {/* Dynamic Scenario Actions */}
      <div className="flex items-center gap-2.5">
        {/* Simulate Congestion Spike */}
        <button
          onClick={onToggleTraffic}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/70 hover:border-amber-500/40 hover:bg-amber-950/20 text-slate-300 hover:text-amber-300 font-display text-xs font-medium transition-all duration-150 active:scale-95"
          title="Toggle Urban Road Congestion Spike"
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Simulate Congestion</span>
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/70 hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-all active:scale-95"
          title="Reset Simulation State"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
