import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Cpu, X, GitCommit, Grid, RefreshCw } from 'lucide-react';
import type { BrainData } from '../../types/simulation';
import { ConvergenceChart } from './ConvergenceChart';
import { Galaxy } from '../effects/Galaxy';

interface BrainViewProps {
  onClose: () => void;
  apiEndpoint?: string;
  title?: string;
}

export const BrainViewModal: React.FC<BrainViewProps> = ({
  onClose,
  apiEndpoint = 'http://127.0.0.1:8000/api/brain',
  title = 'Brain View'
}) => {
  const [brainData, setBrainData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const graphSvgRef = useRef<SVGSVGElement | null>(null);

  const fetchBrainData = () => {
    setLoading(true);
    fetch(apiEndpoint)
      .then(res => res.json())
      .then(data => {
        setBrainData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch brain view telemetry:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchBrainData();
  }, []);

  // Render D3 Force-Directed Decision Graph
  useEffect(() => {
    if (!graphSvgRef.current || !brainData || !brainData.decision_nodes) return;

    const svg = d3.select(graphSvgRef.current);
    svg.selectAll('*').remove();

    const width = 600;
    const height = 480;

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 3]).on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoom as any);

    // Deep copy nodes and links
    const nodes = brainData.decision_nodes.map(d => ({ ...d }));
    const links = brainData.decision_links.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links as any).id((d: any) => d.id).distance(95))
      .force('charge', d3.forceManyBody().strength(-360))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35));

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d: any) => d.color || '#475569')
      .attr('stroke-width', (d: any) => (d.type === 'active_assignment' ? 2 : 1))
      .attr('stroke-dasharray', (d: any) => (d.type === 'candidate' ? '3,3' : 'none'))
      .attr('opacity', (d: any) => (d.type === 'active_assignment' ? 0.8 : 0.2));

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .call(
        d3.drag<any, any>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Node circles
    node.append('circle')
      .attr('r', (d: any) => d.radius || 8)
      .attr('fill', (d: any) => d.color || '#3B82F6')
      .attr('stroke', '#0F172A')
      .attr('stroke-width', 2)
      .attr('opacity', 0.95);

    // Node tooltip
    node.append('title')
      .text((d: any) => d.label || d.id);

    // Node labels with stroke backing to prevent collision clutter
    node.append('text')
      .text((d: any) => {
        const full = d.label || d.id;
        return full.length > 15 ? `${full.slice(0, 14)}…` : full;
      })
      .attr('x', 12)
      .attr('y', 3.5)
      .attr('font-family', 'Space Grotesk')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .attr('fill', '#E2E8F0')
      .attr('stroke', '#070B14')
      .attr('stroke-width', '3px')
      .attr('paint-order', 'stroke fill')
      .attr('pointer-events', 'none');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [brainData]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col glass-panel rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden relative">
        {/* Ambient Cosmic Galaxy Backdrop */}
        <div className="absolute inset-0 pointer-events-none opacity-35 z-0">
          <Galaxy
            transparent={true}
            density={0.7}
            glowIntensity={0.3}
            speed={0.4}
            hueShift={215}
            starSpeed={0.3}
            mouseRepulsion={true}
            mouseInteraction={false}
          />
        </div>

        {/* Modal Header */}
        <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
                Optimizer Decision Graph
                <span className="text-[10px] font-telemetry text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 font-normal">
                  {title}
                </span>
              </h2>
              <p className="text-xs font-body text-slate-400">
                Live bipartite assignment graph and convergence telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchBrainData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-display font-medium text-slate-300 hover:text-white hover:border-slate-500 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh State
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="relative z-10 flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: D3 Force Directed Decision Graph */}
          <div className="lg:col-span-7 flex flex-col p-4 rounded-xl bg-slate-950/60 border border-slate-800/90">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-blue-400" />
                <h4 className="console-header text-slate-300">
                  Bipartite Network Topology
                </h4>
              </div>
              <span className="text-[10px] font-body text-slate-500">Scroll to zoom • Drag to inspect</span>
            </div>

            <div className="w-full h-96 bg-[#060A14] rounded-lg border border-slate-800/80 overflow-hidden relative">
              <svg ref={graphSvgRef} viewBox="0 0 600 480" className="w-full h-full block cursor-grab" />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm text-blue-400 font-telemetry text-xs">
                  Computing decision network...
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-around pt-3 text-[10px] font-body text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white inline-block" /> Depot
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#5EEAD4] inline-block" /> Fleet
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FBBF24] inline-block" /> Demand Stops
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 bg-blue-400 inline-block" /> Active Routes
              </span>
            </div>
          </div>

          {/* Right Column: Convergence Chart & Distance Matrix */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Convergence Chart Card */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/90">
              <h4 className="console-header text-slate-300 mb-3 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                Solver Convergence Curve
              </h4>
              <ConvergenceChart history={brainData?.convergence_history || []} />
            </div>

            {/* Distance Matrix Heatmap Slice */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/90">
              <div className="flex items-center justify-between mb-3">
                <h4 className="console-header text-slate-300 flex items-center gap-2">
                  <Grid className="w-3.5 h-3.5 text-blue-400" />
                  Distance & Duration Cost Matrix
                </h4>
                <span className="text-[10px] font-telemetry text-slate-500">Normalized km</span>
              </div>

              {brainData?.cost_matrix && (
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-[10px] font-telemetry border-collapse">
                    <thead>
                      <tr>
                        <th className="p-1 text-slate-500 font-normal">Src\Dst</th>
                        {brainData.node_labels.slice(0, 6).map((lbl, idx) => (
                          <th key={idx} className="p-1 text-slate-300 font-semibold">{lbl}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {brainData.cost_matrix.slice(0, 6).map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="p-1 text-slate-300 font-semibold text-left">{brainData.node_labels[rIdx]}</td>
                          {row.slice(0, 6).map((val, cIdx) => {
                            const intensity = Math.min(1.0, val / 15.0);
                            const bg = rIdx === cIdx ? 'rgba(255,255,255,0.03)' : `rgba(59, 130, 246, ${intensity * 0.35})`;
                            return (
                              <td
                                key={cIdx}
                                className="p-1 border border-slate-800/80 rounded"
                                style={{ backgroundColor: bg }}
                              >
                                {val.toFixed(1)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
