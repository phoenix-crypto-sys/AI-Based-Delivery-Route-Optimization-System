import React, { useState } from 'react';
import { useSimulationSocket } from '../hooks/useSimulationSocket';
import { SimulationCanvas } from '../components/canvas/SimulationCanvas';
import { LeftFleetPanel } from '../components/layout/LeftFleetPanel';
import { RightAnalyticsPanel } from '../components/layout/RightAnalyticsPanel';
import { BottomSimulationBar } from '../components/layout/BottomSimulationBar';
import { BrainViewModal } from '../components/brain/BrainViewModal';
import { Galaxy } from '../components/effects/Galaxy';
import { Cpu, RotateCcw, Map } from 'lucide-react';

export const SimulationView: React.FC = () => {
  const {
    state,
    flashReRoute,
    togglePlay,
    setSpeed,
    addOrder,
    toggleBreakdown,
    optimize,
    reset,
  } = useSimulationSocket();

  const [mapMode, setMapMode] = useState<'cyber' | 'real'>('cyber');
  const [showBrainView, setShowBrainView] = useState<boolean>(false);

  // Trigger traffic congestion surge demo
  const handleToggleTraffic = () => {
    fetch('http://127.0.0.1:8000/api/traffic/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone_id: 'TZ-CORE-1' }),
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#080D1A] select-none">
      {/* Subtle Cosmic Ambient Galaxy Layer behind simulation canvas */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-40 overflow-hidden">
        <Galaxy
          transparent={true}
          density={0.65}
          glowIntensity={0.25}
          starSpeed={0.25}
          speed={0.35}
          hueShift={270} // Violet shift
          mouseRepulsion={true}
          mouseInteraction={true}
        />
      </div>

      {/* Full-Bleed Animated Procedural Canvas Simulation */}
      <div className="relative z-10 w-full h-full">
        <SimulationCanvas
          state={state}
          onCanvasClick={(x, y) => addOrder(x, y, 2, 'urgent')}
          mapMode={mapMode}
        />
      </div>

      {/* Simulation Header Banner Overlay */}
      <div className="absolute top-4 left-6 right-6 z-20 flex items-center justify-between pointer-events-none">
        {/* Left Badge: Test Mode Banner */}
        <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-950/90 border border-violet-800/60 shadow-lg backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-xs font-display font-semibold text-violet-200">
            Procedural Simulation Environment
          </span>
          <span className="text-[10px] font-telemetry px-1.5 py-0.5 rounded bg-violet-950/80 text-violet-300 border border-violet-800/40">
            SYNTHETIC
          </span>
        </div>

        {/* Right Controls: Brain View, Map Mode, Reset */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Map style */}
          <button
            onClick={() => setMapMode(m => (m === 'cyber' ? 'real' : 'cyber'))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/60 text-xs font-body text-slate-300 hover:text-white hover:border-slate-500 transition-all backdrop-blur-md"
            title="Toggle Visual Grid Style"
          >
            <Map className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px]">{mapMode === 'cyber' ? 'Cyber Grid' : 'Satellite'}</span>
          </button>

          {/* Brain View Button */}
          <button
            onClick={() => setShowBrainView(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-950/70 border border-violet-700/70 hover:border-violet-400 text-xs font-display font-medium text-violet-200 hover:text-white transition-all shadow-sm backdrop-blur-md"
            title="Open OR-Tools Decision Graph & Convergence"
          >
            <Cpu className="w-3.5 h-3.5 text-violet-400" />
            <span>Brain View</span>
          </button>

          {/* Reset */}
          <button
            onClick={reset}
            className="p-2 rounded-lg bg-slate-900/90 border border-slate-700/60 hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-all backdrop-blur-md"
            title="Reset Simulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle, Non-Jarring Re-optimization Notification Flash */}
      {flashReRoute && (
        <div className="absolute inset-0 z-40 pointer-events-none border border-violet-500/40 bg-violet-500/5 transition-opacity duration-300 flex items-start justify-center pt-16">
          <div className="px-4 py-1.5 rounded-full bg-slate-900/95 border border-violet-500/50 text-violet-300 font-display text-xs font-semibold tracking-wide shadow-lg">
            ⚡ Routes Re-Optimized via OR-Tools
          </div>
        </div>
      )}

      {/* Left Fleet Panel */}
      <LeftFleetPanel
        state={state}
        onToggleBreakdown={toggleBreakdown}
        onAddOrder={addOrder}
      />

      {/* Right Analytics Panel */}
      <RightAnalyticsPanel
        state={state}
        onOptimize={optimize}
      />

      {/* Bottom Simulation Bar */}
      <BottomSimulationBar
        state={state}
        onTogglePlay={togglePlay}
        onSetSpeed={setSpeed}
        onToggleTraffic={handleToggleTraffic}
        onReset={reset}
      />

      {/* Brain View Modal */}
      {showBrainView && (
        <BrainViewModal onClose={() => setShowBrainView(false)} />
      )}
    </div>
  );
};

export default SimulationView;
