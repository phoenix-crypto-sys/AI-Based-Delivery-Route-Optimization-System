import React, { useEffect, useRef } from 'react';
import type { SimulationState, Point } from '../../types/simulation';

interface SimulationCanvasProps {
  state: SimulationState | null;
  onCanvasClick: (x: number, y: number) => void;
  mapMode: 'cyber' | 'real';
}

interface AnimatedRoute {
  vehicleId: string;
  color: string;
  points: Point[];
  startTime: number;
  duration: number; // 750ms pen draw
}

interface FadingRoute {
  color: string;
  points: Point[];
  startTime: number;
  duration: number; // 750ms fade out
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ state, onCanvasClick, mapMode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Smooth interpolated vehicle positions & headings
  const vehiclePosMap = useRef<Map<string, { x: number; y: number; heading: number }>>(new Map());

  // Animated routes management
  const activeAnimatedRoutes = useRef<AnimatedRoute[]>([]);
  const fadingRoutes = useRef<FadingRoute[]>([]);
  const lastNonceRef = useRef<number>(0);

  // Trigger smooth pen-draw-in & fade-out on re-optimization
  useEffect(() => {
    if (!state) return;

    if (state.reroute_nonce !== lastNonceRef.current) {
      lastNonceRef.current = state.reroute_nonce;
      const now = performance.now();

      // Fade out previous routes
      for (const ar of activeAnimatedRoutes.current) {
        if (ar.points.length > 1) {
          fadingRoutes.current.push({
            color: ar.color,
            points: [...ar.points],
            startTime: now,
            duration: 750
          });
        }
      }

      // Draw in new routes
      const newAnimated: AnimatedRoute[] = [];
      state.vehicles.forEach(v => {
        if (v.status !== 'broken' && v.route_points && v.route_points.length > 1) {
          newAnimated.push({
            vehicleId: v.id,
            color: v.color,
            points: [...v.route_points],
            startTime: now,
            duration: 750
          });
        }
      });
      activeAnimatedRoutes.current = newAnimated;
    }
  }, [state?.reroute_nonce, state?.vehicles]);

  // 60 FPS Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const width = canvas.width;
      const height = canvas.height;

      // Virtual space 1000 x 800 scale mapping
      const scaleX = width / 1000.0;
      const scaleY = height / 800.0;
      const scale = Math.min(scaleX, scaleY) * 0.94;
      const offsetX = (width - 1000.0 * scale) / 2.0;
      const offsetY = (height - 800.0 * scale) / 2.0;

      const toScreen = (x: number, y: number): [number, number] => {
        return [offsetX + x * scale, offsetY + y * scale];
      };

      // Clear with restrained deep slate canvas
      ctx.fillStyle = '#080D1A';
      ctx.fillRect(0, 0, width, height);

      // Subtle atmospheric center radial glow
      const centerGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width * 0.6);
      centerGrad.addColorStop(0, 'rgba(30, 41, 59, 0.35)');
      centerGrad.addColorStop(1, 'rgba(8, 13, 26, 0.95)');
      ctx.fillStyle = centerGrad;
      ctx.fillRect(0, 0, width, height);

      // Helper: Draw curved route with rounded corner arcs
      const drawCurvedRoute = (pts: Point[], cornerRadius = 14 * scale) => {
        if (pts.length < 2) return;
        const [startSx, startSy] = toScreen(pts[0].x, pts[0].y);
        ctx.moveTo(startSx, startSy);

        for (let i = 1; i < pts.length - 1; i++) {
          const [p1x, p1y] = toScreen(pts[i].x, pts[i].y);
          const [p2x, p2y] = toScreen(pts[i + 1].x, pts[i + 1].y);
          ctx.arcTo(p1x, p1y, p2x, p2y, cornerRadius);
        }
        const [endSx, endSy] = toScreen(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.lineTo(endSx, endSy);
      };

      // 1. Legible Street Grid (Manhattan-Style Orthogonal Blocks)
      if (state?.road_edges && state.road_edges.length > 0) {
        state.road_edges.forEach(edge => {
          const [sx1, sy1] = toScreen(edge.x1, edge.y1);
          const [sx2, sy2] = toScreen(edge.x2, edge.y2);

          // Base road lines (subtle low opacity: 8-12%)
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.lineWidth = (edge.is_major ? 2.5 : 1.2) * scale;
          ctx.strokeStyle = edge.is_major ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.07)';
          ctx.stroke();

          // On-Road Congestion Visualization: Direct gradient stroke along congested segments
          if (edge.congestion > 1.25) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(sx1, sy1);
            ctx.lineTo(sx2, sy2);
            ctx.lineWidth = (edge.is_major ? 3.5 : 2.5) * scale;

            // Severity color: moderate (amber) to severe (rose/crimson)
            const isSevere = edge.congestion > 2.0;
            ctx.strokeStyle = isSevere ? 'rgba(251, 113, 133, 0.45)' : 'rgba(251, 191, 36, 0.35)';

            // Subtle animated flowing pulse along the direction of travel
            ctx.setLineDash([12 * scale, 8 * scale]);
            ctx.lineDashOffset = -time * 0.015;
            ctx.stroke();
            ctx.restore();
          }
        });
      } else {
        // Fallback procedural grid if road_edges is empty
        for (let i = 0; i <= 10; i++) {
          const isAvenue = (i % 2 === 0);
          ctx.lineWidth = (isAvenue ? 2.2 : 1.2) * scale;
          ctx.strokeStyle = isAvenue ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.07)';

          const [x1, y1] = toScreen(i * 100, 0);
          const [x2, y2] = toScreen(i * 100, 800);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          const [hx1, hy1] = toScreen(0, i * 80);
          const [hx2, hy2] = toScreen(1000, i * 80);
          ctx.beginPath();
          ctx.moveTo(hx1, hy1);
          ctx.lineTo(hx2, hy2);
          ctx.stroke();
        }
      }

      if (!state) {
        animId = requestAnimationFrame(render);
        return;
      }

      // 2. Fading Out Routes (Overlapping cross-fade over 750ms)
      const survivingFades: FadingRoute[] = [];
      for (const fr of fadingRoutes.current) {
        const elapsed = time - fr.startTime;
        if (elapsed < fr.duration && fr.points.length > 1) {
          const alpha = Math.max(0, 1.0 - elapsed / fr.duration);
          ctx.save();
          ctx.strokeStyle = fr.color;
          ctx.globalAlpha = alpha * 0.35;
          ctx.lineWidth = 2.0 * scale;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          drawCurvedRoute(fr.points, 12 * scale);
          ctx.stroke();
          ctx.restore();
          survivingFades.push(fr);
        }
      }
      fadingRoutes.current = survivingFades;

      // 3. Traveled Comet Tail Fade (~15% length fade)
      state.vehicles.forEach(v => {
        if (v.completed_points && v.completed_points.length > 1) {
          const totalPoints = v.completed_points.length;
          const trailLength = Math.min(totalPoints, 12);
          const tailSlice = v.completed_points.slice(totalPoints - trailLength);

          if (tailSlice.length > 1) {
            for (let i = 0; i < tailSlice.length - 1; i++) {
              const [p1x, p1y] = toScreen(tailSlice[i].x, tailSlice[i].y);
              const [p2x, p2y] = toScreen(tailSlice[i + 1].x, tailSlice[i + 1].y);
              const ratio = (i + 1) / tailSlice.length;

              ctx.save();
              ctx.strokeStyle = v.color;
              ctx.globalAlpha = ratio * 0.28; // Comet tail gradient fade
              ctx.lineWidth = 2.2 * scale;
              ctx.beginPath();
              ctx.moveTo(p1x, p1y);
              ctx.lineTo(p2x, p2y);
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      });

      // 4. Active Vehicle Routes with Progressive Line-Trim Pen Animation (~750ms)
      activeAnimatedRoutes.current.forEach(ar => {
        if (!ar.points || ar.points.length < 2) return;
        const elapsed = time - ar.startTime;
        const progress = Math.min(1.0, elapsed / ar.duration); // 0 to 1

        // Ease-out progress for natural pen stroke
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        ctx.save();
        ctx.strokeStyle = ar.color;
        ctx.lineWidth = 2.8 * scale;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Calculate cumulative distances
        let totalPathDist = 0;
        for (let i = 0; i < ar.points.length - 1; i++) {
          totalPathDist += Math.hypot(ar.points[i + 1].x - ar.points[i].x, ar.points[i + 1].y - ar.points[i].y);
        }

        const targetDrawDist = totalPathDist * easedProgress;
        let drawnDist = 0;
        const ptsToDraw: Point[] = [ar.points[0]];

        for (let i = 0; i < ar.points.length - 1; i++) {
          const p1 = ar.points[i];
          const p2 = ar.points[i + 1];
          const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

          if (drawnDist + segDist <= targetDrawDist) {
            ptsToDraw.push(p2);
            drawnDist += segDist;
          } else {
            const segRatio = (targetDrawDist - drawnDist) / Math.max(segDist, 0.001);
            ptsToDraw.push({
              x: p1.x + (p2.x - p1.x) * segRatio,
              y: p1.y + (p2.y - p1.y) * segRatio
            });
            break;
          }
        }

        if (ptsToDraw.length > 1) {
          ctx.beginPath();
          drawCurvedRoute(ptsToDraw, 14 * scale);
          ctx.stroke();
        }
        ctx.restore();
      });

      // 5. Central Mission Depot Marker (Clean, Restrained Design)
      const [depotX, depotY] = toScreen(state.depot.x, state.depot.y);
      ctx.save();
      // Depot outer ring
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(depotX, depotY, 11 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // Depot base fill
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(depotX, depotY, 9 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Depot core
      ctx.fillStyle = '#3B82F6';
      ctx.beginPath();
      ctx.arc(depotX, depotY, 4.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Depot Label with pill backdrop
      const depotLabel = 'CENTRAL DEPOT';
      ctx.font = `600 ${Math.max(9, 10 * scale)}px 'Space Grotesk'`;
      ctx.textAlign = 'center';
      const labelW = ctx.measureText(depotLabel).width + 14;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(depotX - labelW / 2, depotY - 26 * scale, labelW, 15 * scale, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#94A3B8';
      ctx.fillText(depotLabel, depotX, depotY - 15 * scale);
      ctx.restore();

      // 6. Delivery Order Waypoints (Polished, Non-Garish Markers)
      state.orders.forEach(order => {
        const [ox, oy] = toScreen(order.location.x, order.location.y);
        const isDelivered = order.status === 'delivered';

        ctx.save();
        if (isDelivered) {
          // Completed stop: subdued gray dot
          ctx.fillStyle = 'rgba(71, 85, 105, 0.35)';
          ctx.beginPath();
          ctx.arc(ox, oy, 3.5 * scale, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
          ctx.font = `400 ${Math.max(8, 8.5 * scale)}px 'Inter'`;
          ctx.textAlign = 'center';
          ctx.fillText(`✓ ${order.id}`, ox, oy + 11 * scale);
        } else {
          // Pending stop: subtle pulsing dot with semantic severity color
          const pulse = 1.0 + 0.1 * Math.sin(time * 0.004 + order.demand);
          const color = order.priority === 'urgent' ? '#FB7185' : order.priority === 'high' ? '#FBBF24' : '#60A5FA';

          // Faint radar ping
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(ox, oy, 8.5 * scale * pulse, 0, Math.PI * 2);
          ctx.stroke();

          // Waypoint core dot
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(ox, oy, 3.8 * scale, 0, Math.PI * 2);
          ctx.fill();

          // Text outline to prevent map collision
          ctx.font = `500 ${Math.max(8, 9.5 * scale)}px 'Inter'`;
          ctx.textAlign = 'center';
          ctx.strokeStyle = '#080D1A';
          ctx.lineWidth = 2.5;
          ctx.strokeText(`${order.customer_name}`, ox, oy - 11 * scale);
          ctx.fillStyle = '#CBD5E1';
          ctx.fillText(`${order.customer_name}`, ox, oy - 11 * scale);

          // Demand badge
          ctx.font = `400 ${Math.max(7, 8 * scale)}px 'IBM Plex Mono'`;
          ctx.strokeText(`${order.demand} pkg`, ox, oy + 13 * scale);
          ctx.fillStyle = '#64748B';
          ctx.fillText(`${order.demand} pkg`, ox, oy + 13 * scale);
        }
        ctx.restore();
      });

      // 7. Vehicles (Curved Heading Rotation, Subtle Speed Tag, Focal Glow on Active)
      state.vehicles.forEach((vehicle, vIdx) => {
        let currentPos = vehiclePosMap.current.get(vehicle.id);
        if (!currentPos) {
          currentPos = { x: vehicle.position.x, y: vehicle.position.y, heading: vehicle.heading };
          vehiclePosMap.current.set(vehicle.id, currentPos);
        } else {
          // Smooth position interpolation
          currentPos.x += (vehicle.position.x - currentPos.x) * 0.18;
          currentPos.y += (vehicle.position.y - currentPos.y) * 0.18;

          // Smooth heading angular interpolation
          let diff = (vehicle.heading - currentPos.heading + 180) % 360 - 180;
          currentPos.heading = (currentPos.heading + diff * 0.2 + 360) % 360;
        }

        const [vx, vy] = toScreen(currentPos.x, currentPos.y);
        const isBroken = vehicle.status === 'broken';
        const distToDepot = Math.hypot(currentPos.x - state.depot.x, currentPos.y - state.depot.y);
        const isAtDepot = distToDepot < 20 && vehicle.status === 'idle';

        ctx.save();
        ctx.translate(vx, vy);

        if (isBroken) {
          // True alert focal glow
          ctx.shadowColor = '#EF4444';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#EF4444';
          ctx.beginPath();
          ctx.arc(0, 0, 10 * scale, 0, Math.PI * 2);
          ctx.fill();

          ctx.shadowBlur = 0;
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${10 * scale}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', 0, 0);

          ctx.fillStyle = '#F87171';
          ctx.font = `600 ${8.5 * scale}px 'Space Grotesk'`;
          ctx.fillText(`${vehicle.name} • Offline`, 0, 18 * scale);
        } else {
          // Rotate vehicle body matching trajectory heading
          ctx.rotate((currentPos.heading * Math.PI) / 180);

          // Refined wedge silhouette (desaturated palette)
          ctx.fillStyle = vehicle.color;
          ctx.beginPath();
          ctx.moveTo(12 * scale, 0);
          ctx.lineTo(-9 * scale, -6 * scale);
          ctx.lineTo(-5 * scale, 0);
          ctx.lineTo(-9 * scale, 6 * scale);
          ctx.closePath();
          ctx.fill();

          // Reset rotation for text labels
          ctx.rotate((-currentPos.heading * Math.PI) / 180);

          // Disperse labels if clustered at depot
          const labelOffsetY = isAtDepot ? (vIdx % 2 === 0 ? -15 * scale : 19 * scale) : -12 * scale;
          const labelOffsetX = isAtDepot ? (vIdx < 2 ? -26 * scale : 26 * scale) : 0;

          // Vehicle Name (Space Grotesk) with stroke backing
          ctx.font = `600 ${Math.max(8.5, 9.5 * scale)}px 'Space Grotesk'`;
          ctx.textAlign = 'center';
          ctx.strokeStyle = '#080D1A';
          ctx.lineWidth = 2.5;
          ctx.strokeText(`${vehicle.name}`, labelOffsetX, labelOffsetY);
          ctx.fillStyle = '#F1F5F9';
          ctx.fillText(`${vehicle.name}`, labelOffsetX, labelOffsetY);

          // Speed indicator: subtle telemetry readout
          if (!isAtDepot) {
            const isCongested = vehicle.speed_kmh < 28;
            ctx.fillStyle = isCongested ? '#FBBF24' : '#94A3B8';
            ctx.font = `400 ${Math.max(7.5, 8.5 * scale)}px 'IBM Plex Mono'`;
            const speedText = isCongested ? `${Math.round(vehicle.speed_kmh)} km/h • traffic` : `${Math.round(vehicle.speed_kmh)} km/h`;
            ctx.strokeText(speedText, 0, 16 * scale);
            ctx.fillText(speedText, 0, 16 * scale);
          }
        }

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [state, mapMode]);

  // Click handler to deploy delivery waypoint
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = canvas.width / 1000.0;
    const scaleY = canvas.height / 800.0;
    const scale = Math.min(scaleX, scaleY) * 0.94;
    const offsetX = (canvas.width - 1000.0 * scale) / 2.0;
    const offsetY = (canvas.height - 800.0 * scale) / 2.0;

    const simX = (clickX - offsetX) / scale;
    const simY = (clickY - offsetY) / scale;

    if (simX >= 30 && simX <= 970 && simY >= 30 && simY <= 770) {
      onCanvasClick(simX, simY);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#080D1A] select-none">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full h-full block cursor-crosshair"
      />
      {/* Subtle Hint Bar - positioned above bottom bar to avoid top toast overlap */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-slate-900/85 border border-slate-700/60 text-[11px] font-body text-slate-300 pointer-events-none backdrop-blur-md shadow-sm">
        Click anywhere on the road grid to dispatch an order
      </div>
    </div>
  );
};
