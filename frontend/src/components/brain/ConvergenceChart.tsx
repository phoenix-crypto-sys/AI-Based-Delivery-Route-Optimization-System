import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface ConvergenceChartProps {
  history: {
    iteration: number;
    temperature: number;
    cost: number;
    best_cost: number;
  }[];
}

export const ConvergenceChart: React.FC<ConvergenceChartProps> = ({ history }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !history || history.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 450;
    const height = 200;
    const margin = { top: 20, right: 30, bottom: 30, left: 45 };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([0, d3.max(history, d => d.iteration) || 40])
      .range([0, innerWidth]);

    const yMin = d3.min(history, d => Math.min(d.cost, d.best_cost)) || 0;
    const yMax = d3.max(history, d => Math.max(d.cost, d.best_cost)) || 100;
    const yScale = d3
      .scaleLinear()
      .domain([yMin * 0.9, yMax * 1.05])
      .range([innerHeight, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );

    // Axes
    const xAxis = d3.axisBottom(xScale).ticks(6);
    const yAxis = d3.axisLeft(yScale).ticks(5);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .attr('color', '#64748B')
      .selectAll('text')
      .attr('font-family', 'IBM Plex Mono')
      .attr('font-size', '10px');

    g.append('g')
      .call(yAxis)
      .attr('color', '#64748B')
      .selectAll('text')
      .attr('font-family', 'IBM Plex Mono')
      .attr('font-size', '10px');

    // Gradient Area under Best Cost Curve
    const area = d3
      .area<any>()
      .x(d => xScale(d.iteration))
      .y0(innerHeight)
      .y1(d => yScale(d.best_cost))
      .curve(d3.curveMonotoneX);

    const gradient = svg
      .append('defs')
      .append('linearGradient')
      .attr('id', 'cost-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#3B82F6').attr('stop-opacity', 0.25);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#3B82F6').attr('stop-opacity', 0.0);

    g.append('path')
      .datum(history)
      .attr('fill', 'url(#cost-gradient)')
      .attr('d', area);

    // Raw candidate cost line (subtle violet dashed)
    const rawLine = d3
      .line<any>()
      .x(d => xScale(d.iteration))
      .y(d => yScale(d.cost))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(history)
      .attr('fill', 'none')
      .attr('stroke', '#A78BFA')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.6)
      .attr('d', rawLine);

    // Best Solution Line (Electric Blue)
    const bestLine = d3
      .line<any>()
      .x(d => xScale(d.iteration))
      .y(d => yScale(d.best_cost))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(history)
      .attr('fill', 'none')
      .attr('stroke', '#3B82F6')
      .attr('stroke-width', 2.0)
      .attr('d', bestLine);

    // Final minimum dot
    const lastPoint = history[history.length - 1];
    if (lastPoint) {
      g.append('circle')
        .attr('cx', xScale(lastPoint.iteration))
        .attr('cy', yScale(lastPoint.best_cost))
        .attr('r', 3.5)
        .attr('fill', '#3B82F6')
        .attr('stroke', '#FFFFFF')
        .attr('stroke-width', 1.5);
    }
  }, [history]);

  return (
    <div className="w-full overflow-hidden flex flex-col items-center">
      <div className="flex items-center justify-between w-full px-1 mb-2 text-[10.5px] font-body text-slate-400">
        <span className="flex items-center gap-1.5 text-blue-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          Optimal Route Objective
        </span>
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="w-2.5 h-0.5 border-b border-indigo-400 border-dashed inline-block" />
          Annealing Permutations
        </span>
      </div>
      <svg ref={svgRef} viewBox="0 0 450 200" className="w-full h-auto max-h-52 block" />
    </div>
  );
};
