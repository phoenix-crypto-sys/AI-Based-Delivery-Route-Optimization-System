import React, { useState } from 'react';
import { Sliders, TrendingDown, Leaf, DollarSign, Clock, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import type { SimulationState } from '../../types/simulation';
import { OdometerNumber } from '../common/OdometerNumber';

interface RightAnalyticsPanelProps {
  state: SimulationState | null;
  onOptimize: (fastest: number, cheapest: number, greenest: number, trafficAware: boolean) => void;
}

export const RightAnalyticsPanel: React.FC<RightAnalyticsPanelProps> = ({ state, onOptimize }) => {
  const [objectiveSlider, setObjectiveSlider] = useState<number>(33);
  const [showDeepAnalytics, setShowDeepAnalytics] = useState<boolean>(false);
  const trafficAware = true;

  const handleSliderChange = (val: number) => {
    setObjectiveSlider(val);

    let fastest = 0.33, cheapest = 0.33, greenest = 0.33;
    if (val <= 50) {
      const t = val / 50.0;
      fastest = 1.0 - t;
      cheapest = t;
      greenest = 0.05;
    } else {
      const t = (val - 50.0) / 50.0;
      fastest = 0.05;
      cheapest = 1.0 - t;
      greenest = t;
    }

    const sum = fastest + cheapest + greenest;
    onOptimize(fastest / sum, cheapest / sum, greenest / sum, trafficAware);
  };

  const metrics = state?.metrics;

  return (
    <aside className="absolute right-5 top-20 bottom-24 w-76 md:w-84 z-20 flex flex-col glass-panel rounded-xl overflow-hidden border border-slate-800/90 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <h3 className="console-header">
            Optimization Controls
          </h3>
        </div>
        <span className="text-[10px] font-telemetry text-slate-400">
          GLS Solver
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Multi-Objective Tri-Pole Slider */}
        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-[11px] font-display">
            <span className={`flex items-center gap-1 ${objectiveSlider < 35 ? 'text-blue-400 font-semibold' : 'text-slate-400'}`}>
              <Clock className="w-3 h-3" /> Fastest
            </span>
            <span className={`flex items-center gap-1 ${objectiveSlider >= 35 && objectiveSlider <= 65 ? 'text-amber-400 font-semibold' : 'text-slate-400'}`}>
              <DollarSign className="w-3 h-3" /> Cost
            </span>
            <span className={`flex items-center gap-1 ${objectiveSlider > 65 ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
              <Leaf className="w-3 h-3" /> Eco
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={objectiveSlider}
            onChange={(e) => handleSliderChange(parseInt(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
          />

          <div className="text-[10px] font-body text-slate-400 pt-0.5">
            Prioritizing: <span className="text-slate-200">
              {objectiveSlider < 35 ? 'Transit time & delivery windows' : objectiveSlider <= 65 ? 'Total fleet mileage' : 'Carbon avoidance & traffic bypass'}
            </span>
          </div>
        </div>

        {/* Headline Stats: Maximum 2 Headline Cards Always Visible */}
        <div className="grid grid-cols-2 gap-2">
          {/* Distance Saved */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-body mb-1">
              <span>Distance Saved</span>
              <TrendingDown className="w-3 h-3 text-blue-400" />
            </div>
            <div className="text-lg font-bold font-telemetry text-blue-400">
              +<OdometerNumber value={metrics?.distance_saved_percent || 0} decimals={1} suffix="%" />
            </div>
            <div className="text-[9px] font-body text-slate-500 mt-0.5">vs naive baseline</div>
          </div>

          {/* On-Time SLA */}
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-body mb-1">
              <span>On-Time SLA</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <div className="text-lg font-bold font-telemetry text-emerald-300">
              <OdometerNumber value={metrics?.on_time_rate_percent || 100} decimals={1} suffix="%" />
            </div>
            <div className="text-[9px] font-body text-slate-500 mt-0.5">within windows</div>
          </div>
        </div>

        {/* Collapsible Deep Analytics Details */}
        <div className="pt-1">
          <button
            onClick={() => setShowDeepAnalytics(!showDeepAnalytics)}
            className="w-full flex items-center justify-between py-1 px-1 text-[11px] font-display text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span>Telemetry Breakdown</span>
            {showDeepAnalytics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDeepAnalytics && (
            <div className="mt-2 space-y-1.5 p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80 text-xs font-body animate-in fade-in duration-200">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>CO₂ Avoided:</span>
                <span className="font-telemetry text-emerald-400">
                  <OdometerNumber value={metrics?.co2_saved_kg || 0} decimals={2} suffix=" kg" />
                </span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Fuel Used:</span>
                <span className="font-telemetry text-slate-200">
                  <OdometerNumber value={metrics?.fuel_used_liters || 0} decimals={2} suffix=" L" />
                </span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Total Mileage:</span>
                <span className="font-telemetry text-slate-200">
                  <OdometerNumber value={metrics?.total_distance_km || 0} decimals={1} suffix=" km" />
                </span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Solver Latency:</span>
                <span className="font-telemetry text-blue-400">{metrics?.solver_execution_time_ms || 18} ms</span>
              </div>
            </div>
          )}
        </div>

        {/* Live Event Stream (Fixed max-height with top edge gradient fade mask) */}
        <div className="pt-1 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-body">
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
            <span className="console-header">Audit Stream</span>
          </div>

          <div className="relative rounded-lg bg-slate-950/70 border border-slate-800 p-2.5 max-h-28 overflow-y-auto mask-fade-top font-telemetry text-[10.5px] leading-relaxed text-slate-300">
            <div className="text-slate-500">[{state?.sim_time_str}] Connected to optimizer.</div>
            {state?.last_event && (
              <div className="text-slate-200 mt-1 font-medium">
                ▸ {state.last_event}
              </div>
            )}
            <div className="text-slate-400 mt-1">
              ▸ Road speed models dynamic.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
