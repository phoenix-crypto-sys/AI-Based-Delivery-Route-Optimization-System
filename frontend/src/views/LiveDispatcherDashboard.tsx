import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Map as MapLibreMap, Popup, LngLatBounds, GeoJSONSource, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

try {
  setWorkerUrl(workerUrl);
} catch {
  // worker already configured
}

import { useLiveSocket } from '../hooks/useLiveSocket';
import { DEFAULT_CITY_CENTER } from '../config/mapConfig';
import { BrainViewModal } from '../components/brain/BrainViewModal';
import { OdometerNumber } from '../components/common/OdometerNumber';
import {
  Truck,
  Plus,
  FileSpreadsheet,
  RefreshCw,
  Clock,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  Locate,
  Flame,
  Cpu,
  Sliders,
  TrendingDown,
  DollarSign,
  Leaf,
  Terminal,
  Play,
  Pause,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { LiveVehicle, LiveOrder } from '../types/live';

export const LiveDispatcherDashboard: React.FC = () => {
  const {
    liveState,
    flashReRoute,
    addLiveOrder,
    importCSV,
    triggerOptimize,
    toggleVehicleFailover
  } = useLiveSocket();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);

  const [activeRightTab, setActiveRightTab] = useState<'orders' | 'analytics' | 'intake' | 'csv'>('orders');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [showBrainView, setShowBrainView] = useState<boolean>(false);
  const [objectiveSlider, setObjectiveSlider] = useState<number>(34);
  const [showDeepAnalytics, setShowDeepAnalytics] = useState<boolean>(false);

  // Historical Timeline Playback & Scrubber State
  const [isHistoricalPlaying, setIsHistoricalPlaying] = useState<boolean>(false);
  const [timelineIndex, setTimelineIndex] = useState<number>(0);
  const [scrubberHover, setScrubberHover] = useState<{ x: number; percent: number } | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);

  // Manual Order Intake Form State
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualDemand, setManualDemand] = useState(2);
  const [manualPriority, setManualPriority] = useState('normal');

  // CSV Import State
  const [csvContent, setCsvContent] = useState('');
  const [csvImportMsg, setCsvImportMsg] = useState<string | null>(null);

  // 1. Initialize MapLibre GL Map (OpenFreeMap Dark Style — Configured for India / Hyderabad)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [DEFAULT_CITY_CENTER.lng, DEFAULT_CITY_CENTER.lat], // Configurable Indian City Center [lng, lat]
      zoom: DEFAULT_CITY_CENTER.zoom,
      minZoom: DEFAULT_CITY_CENTER.minZoom,
      maxZoom: DEFAULT_CITY_CENTER.maxZoom,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false
    });

    // Tune scroll zoom rate for smooth, controllable navigation
    map.scrollZoom.setWheelZoomRate(1 / 450);

    // Suppress missing style image warnings (e.g. wood-pattern sprite)
    map.setMissingStyleImageResolver((id) => {
      try {
        if (!map.hasImage(id)) {
          map.addImage(id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
        }
      } catch {
        // ignore
      }
    });

    map.on('load', () => {
      // Add Empty GeoJSON source for OSRM routes
      map.addSource('route-lines', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'route-lines-layer',
        type: 'line',
        source: 'route-lines',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3.5,
          'line-opacity': 0.85
        }
      });

      // Add Empty GeoJSON source for live traffic congestion overlays
      map.addSource('traffic-segments', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'traffic-segments-layer',
        type: 'line',
        source: 'traffic-segments',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5.5,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2]
        }
      });

      // 3. Native Central Depot GL Layer
      map.addSource('depot-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'depot-circle-layer',
        type: 'circle',
        source: 'depot-source',
        paint: {
          'circle-radius': 13,
          'circle-color': '#0F172A',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#3B82F6'
        }
      });
      map.addLayer({
        id: 'depot-label-layer',
        type: 'symbol',
        source: 'depot-source',
        layout: {
          'text-field': 'HUB',
          'text-size': 9,
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#60A5FA'
        }
      });

      // 4. Native Order Destinations GL Layer
      map.addSource('orders-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'orders-circle-layer',
        type: 'circle',
        source: 'orders-source',
        paint: {
          'circle-radius': ['match', ['get', 'priority'], 'urgent', 11, 'high', 10, 8.5],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0F172A'
        }
      });
      map.addLayer({
        id: 'orders-label-layer',
        type: 'symbol',
        source: 'orders-source',
        layout: {
          'text-field': ['get', 'demand_str'],
          'text-size': 9.5,
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#FFFFFF'
        }
      });

      // 5. Native Live Vehicles GL Layer (Halo + Circle + Telemetry Label)
      map.addSource('vehicles-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'vehicles-halo-layer',
        type: 'circle',
        source: 'vehicles-source',
        paint: {
          'circle-radius': ['get', 'haloRadius'],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.28
        }
      });
      map.addLayer({
        id: 'vehicles-circle-layer',
        type: 'circle',
        source: 'vehicles-source',
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#FFFFFF'
        }
      });
      map.addLayer({
        id: 'vehicles-label-layer',
        type: 'symbol',
        source: 'vehicles-source',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#F8FAFC',
          'text-halo-color': '#0F172A',
          'text-halo-width': 2
        }
      });

      // Interactive Click & Hover handlers for GPU layers
      map.on('click', 'vehicles-circle-layer', (e) => {
        const feat = e.features?.[0];
        if (feat?.properties?.id) {
          setSelectedVehicleId(feat.properties.id);
        }
      });

      map.on('click', 'orders-circle-layer', (e) => {
        const feat = e.features?.[0];
        if (feat && feat.geometry.type === 'Point') {
          const coords = (feat.geometry as unknown as { coordinates: [number, number] }).coordinates;
          const props = feat.properties as { customer_name: string; address?: string; color: string; priority: string; demand: number };
          new Popup({ offset: 12 })
            .setLngLat(coords)
            .setHTML(`
              <div style="font-family: sans-serif; font-size: 11px;">
                <strong style="color: #F8FAFC;">${props.customer_name}</strong><br/>
                <span style="color: #94A3B8; font-size: 10px;">${props.address || ''}</span><br/>
                <span style="color: ${props.color}; font-weight: bold; font-family: monospace;">${props.priority.toUpperCase()} · ${props.demand} PKG</span>
              </div>
            `)
            .addTo(map);
        }
      });

      map.on('click', 'depot-circle-layer', (e) => {
        const feat = e.features?.[0];
        if (feat && feat.geometry.type === 'Point') {
          const coords = (feat.geometry as unknown as { coordinates: [number, number] }).coordinates;
          const props = feat.properties as { name?: string; address?: string };
          new Popup({ offset: 14 })
            .setLngLat(coords)
            .setHTML(`
              <div style="font-family: sans-serif; font-size: 12px;">
                <strong style="color: #60A5FA;">${props.name || 'Central Hub'}</strong><br/>
                <span style="color: #94A3B8; font-size: 11px;">${props.address || ''}</span>
              </div>
            `)
            .addTo(map);
        }
      });

      map.on('mouseenter', 'vehicles-circle-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'vehicles-circle-layer', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'orders-circle-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'orders-circle-layer', () => { map.getCanvas().style.cursor = ''; });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. High-Performance GPU Layer Sync (Direct GeoJSON Data Updates, ZERO DOM Markers)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !liveState) return;

    const renderLayers = () => {
      // A. Central Depot GL Source
      const depotSrc = map.getSource('depot-source') as GeoJSONSource | undefined;
      if (depotSrc) {
        depotSrc.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [liveState.depot.lng, liveState.depot.lat] },
            properties: { name: liveState.depot.name, address: liveState.depot.address }
          }]
        });
      }

      // B. Update Route Polyline GeoJSON
      const routeSrc = map.getSource('route-lines') as GeoJSONSource | undefined;
      if (routeSrc) {
        const routeFeatures = liveState.routes
          .filter(r => r.geometry_geojson && r.geometry_geojson.coordinates?.length)
          .map(route => {
            const veh = liveState.vehicles.find(v => v.id === route.vehicle_id);
            return {
              type: 'Feature' as const,
              properties: {
                vehicle_id: route.vehicle_id,
                color: veh?.color || '#3B82F6'
              },
              geometry: route.geometry_geojson!
            };
          });

        routeSrc.setData({
          type: 'FeatureCollection',
          features: routeFeatures
        });
      }

      // C. Update Traffic Congestion Segments
      const trafficSrc = map.getSource('traffic-segments') as GeoJSONSource | undefined;
      if (trafficSrc) {
        const trafficFeatures = liveState.traffic_segments
          .filter(t => t.coordinates && t.coordinates.length >= 2)
          .map(seg => ({
            type: 'Feature' as const,
            properties: {
              id: seg.id,
              color: seg.congestion_level > 0.7 ? '#EF4444' : '#F59E0B',
              congestion: seg.congestion_level
            },
            geometry: {
              type: 'LineString' as const,
              coordinates: (seg.coordinates || []).map(([lat, lng]) => [lng, lat])
            }
          }));

        trafficSrc.setData({
          type: 'FeatureCollection',
          features: trafficFeatures
        });
      }

      // D. Update Order Destinations GL Source
      const ordersSrc = map.getSource('orders-source') as GeoJSONSource | undefined;
      if (ordersSrc) {
        const orderFeatures = liveState.orders
          .filter(o => o.status !== 'delivered' && o.lng != null && o.lat != null)
          .map(order => ({
            type: 'Feature' as const,
            properties: {
              id: order.id,
              customer_name: order.customer_name,
              address: order.address,
              demand: order.demand,
              demand_str: String(order.demand),
              priority: order.priority,
              color: order.priority === 'urgent' ? '#F43F5E' : order.priority === 'high' ? '#F59E0B' : '#3B82F6'
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [order.lng, order.lat]
            }
          }));

        ordersSrc.setData({
          type: 'FeatureCollection',
          features: orderFeatures
        });
      }

      // E. Update Live Vehicles GL Source (GPU WebGL rendering, ZERO DOM allocations)
      const vehSrc = map.getSource('vehicles-source') as GeoJSONSource | undefined;
      if (vehSrc) {
        const vehFeatures = liveState.vehicles
          .filter(v => v.current_lng != null && v.current_lat != null)
          .map(veh => {
            const isSignalLost = veh.status === 'signal_lost';
            const isOffline = veh.status === 'offline';
            const isSelected = selectedVehicleId === veh.id;
            const color = isOffline ? '#64748B' : isSignalLost ? '#F59E0B' : veh.color;
            return {
              type: 'Feature' as const,
              properties: {
                id: veh.id,
                name: veh.name,
                label: isOffline ? `${veh.name} (OFFLINE)` : `${veh.name} · ${veh.speed_kmh}km/h`,
                color: color,
                radius: isSelected ? 14 : 10,
                haloRadius: isSelected ? 20 : 15,
                heading: veh.heading || 0
              },
              geometry: {
                type: 'Point' as const,
                coordinates: [veh.current_lng!, veh.current_lat!]
              }
            };
          });

        vehSrc.setData({
          type: 'FeatureCollection',
          features: vehFeatures
        });
      }
    };

    if (map.isStyleLoaded()) {
      renderLayers();
    } else {
      map.once('styledata', renderLayers);
    }
  }, [liveState, selectedVehicleId]);

  // Recenter Fleet programmatic camera bounds move
  const handleRecenterFleet = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !liveState) return;

    const bounds = new LngLatBounds();
    bounds.extend([liveState.depot.lng, liveState.depot.lat]);

    liveState.vehicles.forEach(v => {
      if (v.current_lng && v.current_lat && v.status !== 'offline') {
        bounds.extend([v.current_lng, v.current_lat]);
      }
    });

    liveState.orders.forEach(o => {
      if (o.status !== 'delivered') {
        bounds.extend([o.lng, o.lat]);
      }
    });

    map.fitBounds(bounds, {
      padding: 90,
      duration: 650,
      maxZoom: 15
    });
  }, [liveState]);

  // Zoom controls
  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn({ duration: 300 });
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut({ duration: 300 });
  };

  // Programmatic pan/fly to vehicle from roster
  const handleSelectVehicle = (vehicle: LiveVehicle) => {
    if (selectedVehicleId === vehicle.id) {
      setSelectedVehicleId(null);
      return;
    }
    setSelectedVehicleId(vehicle.id);
    if (vehicle.current_lng && vehicle.current_lat) {
      mapInstanceRef.current?.flyTo({
        center: [vehicle.current_lng, vehicle.current_lat],
        zoom: 15,
        duration: 650,
        essential: true
      });
    }
  };

  // Programmatic pan/fly to order from queue
  const handleSelectOrder = (order: LiveOrder) => {
    mapInstanceRef.current?.flyTo({
      center: [order.lng, order.lat],
      zoom: 15.5,
      duration: 650,
      essential: true
    });
  };

  // Handle Manual Order Submission
  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAddress.trim()) return;

    addLiveOrder({
      customer_name: manualName.trim() || 'New Priority Client',
      address: manualAddress.trim(),
      demand: manualDemand,
      priority: manualPriority
    });

    setManualName('');
    setManualAddress('');
    setManualDemand(2);
    setActiveRightTab('orders');
  };

  // Handle CSV Bulk Import
  const handleImportCsv = async () => {
    if (!csvContent.trim()) return;
    const count = await importCSV(csvContent);
    setCsvImportMsg(`Successfully imported ${count} delivery orders.`);
    setCsvContent('');
    setTimeout(() => {
      setCsvImportMsg(null);
      setActiveRightTab('orders');
    }, 2000);
  };

  // Multi-objective tri-pole slider handler (Fastest vs Cost vs Eco)
  const handleSliderChange = (val: number) => {
    setObjectiveSlider(val);
    let fastest = 0.34, cheapest = 0.33, greenest = 0.33;
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
    triggerOptimize({
      fastest: Number((fastest / sum).toFixed(2)),
      cheapest: Number((cheapest / sum).toFixed(2)),
      greenest: Number((greenest / sum).toFixed(2))
    });
  };

  // Historical Timeline Playback timer
  useEffect(() => {
    if (!isHistoricalPlaying) return;
    const historyCount = liveState?.history?.length || 1;
    const timer = setInterval(() => {
      setTimelineIndex(prev => (prev + 1) % historyCount);
    }, 2500);
    return () => clearInterval(timer);
  }, [isHistoricalPlaying, liveState?.history]);

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineTrackRef.current) return;
    const rect = timelineTrackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percent = Math.round((x / rect.width) * 100);
    setScrubberHover({ x, percent });
  };

  const handleTimelineMouseLeave = () => {
    setScrubberHover(null);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineTrackRef.current || !liveState?.history?.length) return;
    const rect = timelineTrackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = x / rect.width;
    const idx = Math.min(Math.floor(ratio * liveState.history.length), liveState.history.length - 1);
    setTimelineIndex(idx);
  };

  const metrics = liveState?.metrics;

  // Identify top urgent order for Hero Card in Order List
  const urgentOrders = liveState?.orders.filter(o => o.status !== 'delivered' && o.priority === 'urgent') || [];
  const topUrgentOrder = urgentOrders[0];
  const standardOrders = liveState?.orders.filter(o => o.id !== topUrgentOrder?.id) || [];

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070B14] flex flex-col select-none">
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-6 right-6 z-30 pointer-events-none flex items-center justify-between">
        {/* Left: Operations Telemetry HUD */}
        <div className="pointer-events-auto flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-slate-950/95 border border-slate-800 shadow-xl contain-panel">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-display font-semibold text-slate-100">
              Live Fleet Dispatch
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <span className="text-[11px] font-telemetry text-slate-400">
            {metrics?.distance_saved_percent || 27.5}% saved · {metrics?.on_time_rate_percent || 98.8}% on-time · {metrics?.co2_saved_kg || 0}kg CO₂
          </span>
        </div>

        {/* Right: Quick Solver Trigger & Traffic Freshness Indicator */}
        <div className="pointer-events-auto flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/95 border border-slate-800 text-[11px] font-telemetry text-slate-400 shadow-xl contain-panel">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Traffic: <strong className="text-slate-200">Active Live Roads</strong></span>
          </div>

          {/* Brain View Optimizer Internals Modal Trigger */}
          <button
            onClick={() => setShowBrainView(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 active:scale-95 text-xs font-display font-medium text-slate-200 hover:text-white border border-slate-700 shadow-xl transition-all contain-panel"
            title="Open Live Solver Decision Graph & Telemetry"
          >
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Brain View</span>
          </button>

          <button
            onClick={() => triggerOptimize()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-display font-semibold text-white shadow-lg shadow-blue-900/40 transition-all contain-panel"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-Optimize
          </button>
        </div>
      </div>

      {/* Re-route notification flash */}
      {flashReRoute && (
        <div className="absolute inset-0 z-40 pointer-events-none border border-blue-500/40 bg-blue-500/5 transition-opacity duration-300 flex items-start justify-center pt-16">
          <div className="px-4 py-1.5 rounded-full bg-slate-900/95 border border-blue-500/50 text-blue-300 font-display text-xs font-semibold tracking-wide shadow-lg">
            ⚡ Real-World Routes Re-Optimized via OR-Tools
          </div>
        </div>
      )}

      {/* FLOATING PANEL 1: Fleet Roster & Real GPS Telemetry (Left) */}
      <aside className="absolute left-6 top-18 bottom-6 w-80 z-20 flex flex-col glass-panel rounded-xl overflow-hidden border border-slate-800/90 shadow-2xl contain-panel">
        <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-display font-semibold uppercase tracking-wider text-slate-200">
              Live Fleet Roster
            </h3>
          </div>
          <span className="text-[9px] font-telemetry px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/40 font-bold uppercase tracking-wider">
            {liveState?.vehicles.filter(v => v.status !== 'offline').length || 0} ACTIVE
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {liveState?.vehicles.map((veh) => {
            const isSelected = selectedVehicleId === veh.id;
            const isSignalLost = veh.status === 'signal_lost';
            const isOffline = veh.status === 'offline';

            // Size differentiation: Selected vehicle gets an expanded Hero Card layout
            if (isSelected) {
              return (
                <div
                  key={veh.id}
                  onClick={() => handleSelectVehicle(veh)}
                  className={`p-3.5 rounded-xl border transition-all duration-300 cursor-pointer bg-blue-950/40 border-blue-500/80 shadow-lg shadow-blue-950/40 ${
                    isSignalLost ? 'border-l-4 border-l-amber-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full ring-2 ring-blue-400/40"
                        style={{ backgroundColor: veh.color }}
                      />
                      <span className="text-sm font-display font-semibold text-white">
                        {veh.name}
                      </span>
                      <span className="text-[10px] font-telemetry text-slate-400">
                        {veh.label || 'VAN'}
                      </span>
                    </div>

                    <span className="text-[9px] font-telemetry px-2 py-0.5 rounded-full bg-blue-900/80 text-blue-200 font-bold tracking-wider uppercase border border-blue-400/30">
                      SELECTED
                    </span>
                  </div>

                  {/* Highlighted prominent metrics */}
                  <div className="grid grid-cols-3 gap-2 py-2 px-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 mb-2">
                    <div>
                      <div className="text-[9px] font-telemetry uppercase tracking-wider text-slate-500">Speed</div>
                      <div className="text-sm font-telemetry font-bold text-white">{veh.speed_kmh} <span className="text-[10px] font-normal text-slate-400">km/h</span></div>
                    </div>
                    <div>
                      <div className="text-[9px] font-telemetry uppercase tracking-wider text-slate-500">Battery</div>
                      <div className="text-sm font-telemetry font-bold text-white">{veh.battery_level}%</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-telemetry uppercase tracking-wider text-slate-500">Stops</div>
                      <div className="text-sm font-telemetry font-bold text-blue-400">{veh.assigned_order_ids.length}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <div className="text-[9px] font-telemetry text-slate-400">
                      {veh.current_lat && veh.current_lng ? `GPS: [${veh.current_lat.toFixed(4)}, ${veh.current_lng.toFixed(4)}]` : 'GPS Inactive'}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVehicleFailover(veh.id);
                      }}
                      className={`px-2 py-1 rounded-md text-[9px] font-telemetry font-bold uppercase tracking-wider transition-all border ${
                        isOffline
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-600 hover:bg-emerald-900'
                          : 'bg-rose-950 text-rose-300 border-rose-600 hover:bg-rose-900'
                      }`}
                      title={isOffline ? 'Restore vehicle to live dispatch' : 'Report breakdown / driver issue and redistribute remaining stops'}
                    >
                      {isOffline ? '✓ Restore Fleet' : '⚠ Failover / Issue'}
                    </button>
                  </div>
                </div>
              );
            }

            // Compact layout for unselected vehicles
            return (
              <div
                key={veh.id}
                onClick={() => handleSelectVehicle(veh)}
                className={`p-2.5 rounded-lg border transition-all duration-300 cursor-pointer ${
                  isSignalLost
                    ? 'bg-amber-950/20 border-amber-800/60 border-l-4 border-l-amber-500'
                    : isOffline
                    ? 'bg-slate-900/40 border-slate-800/50 opacity-60'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {/* Status dot varied with context */}
                    {isOffline ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 opacity-40" />
                    ) : isSignalLost ? (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full ring-2 ring-emerald-500/30"
                        style={{ backgroundColor: veh.color }}
                      />
                    )}
                    <span className="text-xs font-display font-semibold text-slate-200">
                      {veh.name}
                    </span>
                    <span className="text-[9px] font-telemetry text-slate-500">
                      {veh.label || 'VAN'}
                    </span>
                  </div>

                  {/* Neutral / Muted Vehicle Status Badges (cross-fading over 300ms) */}
                  {isOffline ? (
                    <span className="text-[8px] font-telemetry px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-medium uppercase tracking-wider transition-colors duration-300">
                      OFFLINE
                    </span>
                  ) : isSignalLost ? (
                    <span className="text-[8px] font-telemetry px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-bold uppercase tracking-wider animate-pulse transition-colors duration-300">
                      SIGNAL LOST
                    </span>
                  ) : (
                    <span className="text-[8px] font-telemetry px-1.5 py-0.5 rounded bg-slate-800/90 text-emerald-400 font-semibold uppercase tracking-wider transition-colors duration-300">
                      LIVE GPS
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] font-telemetry text-slate-400 border-t border-slate-800/40">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase">Spd </span>
                    <strong className="text-slate-200 font-semibold">{veh.speed_kmh}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase">Bat </span>
                    <strong className="text-slate-200 font-semibold">{veh.battery_level}%</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase">Stp </span>
                    <strong className="text-blue-400 font-semibold">{veh.assigned_order_ids.length}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-slate-800/60 text-[9px]">
                  <span className="font-telemetry text-slate-500">
                    {isOffline ? 'Truck Out of Service' : 'Active Routing'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVehicleFailover(veh.id);
                    }}
                    className={`px-2 py-0.5 rounded text-[8px] font-telemetry font-bold uppercase tracking-wider transition-all border ${
                      isOffline
                        ? 'bg-emerald-950/90 text-emerald-300 border-emerald-800 hover:bg-emerald-900'
                        : 'bg-rose-950/80 text-rose-300 border-rose-800 hover:bg-rose-900'
                    }`}
                  >
                    {isOffline ? 'Restore' : 'Failover'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* FLOATING PANEL 2: Real Order Intake & Queue (Right) */}
      <aside className="absolute right-6 top-18 bottom-6 w-88 z-20 flex flex-col glass-panel rounded-xl overflow-hidden border border-slate-800/90 shadow-2xl contain-panel">
        {/* Tab Headers */}
        <div className="flex items-center border-b border-slate-800 bg-slate-900/80 p-1.5 gap-1">
          <button
            onClick={() => setActiveRightTab('orders')}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-display font-medium transition-all ${
              activeRightTab === 'orders'
                ? 'bg-blue-600 text-white font-semibold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Orders</span>
            <span className="text-[9px] font-telemetry px-1 rounded-full bg-blue-950 text-blue-300 font-bold">
              {liveState?.orders.filter(o => o.status !== 'delivered').length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveRightTab('analytics')}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-display font-medium transition-all ${
              activeRightTab === 'analytics'
                ? 'bg-blue-600 text-white font-semibold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => setActiveRightTab('intake')}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-display font-medium transition-all ${
              activeRightTab === 'intake'
                ? 'bg-blue-600 text-white font-semibold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>

          <button
            onClick={() => setActiveRightTab('csv')}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-display font-medium transition-all ${
              activeRightTab === 'csv'
                ? 'bg-blue-600 text-white font-semibold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>

        {/* Tab 1: Orders Queue List with Size Variation & Urgent Breathing */}
        {activeRightTab === 'orders' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* HERO CARD: Top Urgent Priority Order */}
            {topUrgentOrder && (
              <div
                onClick={() => handleSelectOrder(topUrgentOrder)}
                className="p-3.5 rounded-xl border border-rose-600/70 border-l-4 border-l-rose-500 bg-rose-950/20 shadow-lg shadow-rose-950/30 cursor-pointer animate-slide-down-fade"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    <span className="font-display font-bold text-sm text-white">
                      {topUrgentOrder.customer_name}
                    </span>
                  </div>

                  {/* Reserved slow breathing animation ONLY for urgent orders */}
                  <span className="text-[9px] font-telemetry px-2 py-0.5 rounded-full bg-rose-900/90 text-rose-100 border border-rose-500/50 uppercase tracking-wider font-bold animate-urgent-breath">
                    URGENT
                  </span>
                </div>

                <div className="text-xs font-body text-slate-300 mb-2 truncate">
                  {topUrgentOrder.address}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-rose-900/40 text-[10px] font-telemetry">
                  <div>
                    <span className="text-slate-400 uppercase">Demand: </span>
                    <strong className="text-rose-300 font-bold text-xs">{topUrgentOrder.demand} PKG</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase">Window: </span>
                    <strong className="text-slate-200 font-semibold">+{topUrgentOrder.time_window_start}m</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase">Route: </span>
                    <strong className="text-blue-400 font-semibold">{topUrgentOrder.assigned_vehicle_id || 'Pending'}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Standard Compressed Orders */}
            {standardOrders.map((order) => {
              const isDelivered = order.status === 'delivered';
              const isHigh = order.priority === 'high';

              return (
                <div
                  key={order.id}
                  onClick={() => handleSelectOrder(order)}
                  className={`p-2.5 rounded-lg border text-xs transition-all cursor-pointer animate-slide-down-fade ${
                    isDelivered
                      ? 'bg-slate-950/40 border-slate-800/40 opacity-50'
                      : isHigh
                      ? 'bg-slate-900/70 border-amber-800/50 border-l-2 border-l-amber-500'
                      : 'bg-slate-900/50 border-slate-800/70 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-semibold text-slate-200">
                      {order.customer_name}
                    </span>
                    <span className={`text-[8px] font-telemetry px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold ${
                      isDelivered
                        ? 'bg-slate-800 text-slate-400'
                        : isHigh
                        ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {order.priority}
                    </span>
                  </div>

                  <div className="text-[11px] font-body text-slate-400 truncate mb-1.5">
                    {order.address}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-telemetry text-slate-500">
                    <span>Pkgs: <strong className="text-slate-300 font-semibold">{order.demand}</strong></span>
                    <span>Window: <strong className="text-slate-300 font-semibold">+{order.time_window_start}m</strong></span>
                    <span>Assigned: <strong className="text-blue-400 font-semibold">{order.assigned_vehicle_id || 'Pending'}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Analytics, Multi-Objective Slider & Live Audit Stream */}
        {activeRightTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            {/* Multi-Objective Tri-Pole Slider */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs font-display font-semibold text-slate-200 uppercase tracking-wider">
                    Solver Objectives
                  </span>
                </div>
                <span className="text-[9px] font-telemetry px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/40 font-bold">
                  OR-TOOLS VRP
                </span>
              </div>

              <div className="flex justify-between items-center text-[11px] font-display pt-1">
                <span className={`flex items-center gap-1 ${objectiveSlider < 35 ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>
                  <Clock className="w-3 h-3" /> Fastest
                </span>
                <span className={`flex items-center gap-1 ${objectiveSlider >= 35 && objectiveSlider <= 65 ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                  <DollarSign className="w-3 h-3" /> Cost
                </span>
                <span className={`flex items-center gap-1 ${objectiveSlider > 65 ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
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

              <div className="text-[10px] font-body text-slate-400 pt-0.5 flex items-center justify-between">
                <span>Focus: <strong className="text-slate-200">
                  {objectiveSlider < 35 ? 'Transit speed & tight SLA windows' : objectiveSlider <= 65 ? 'Fuel economy & minimum distance' : 'Carbon avoidance & traffic bypass'}
                </strong></span>
              </div>
            </div>

            {/* Headline Metric Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-[10px] font-body mb-1">
                  <span>Distance Saved</span>
                  <TrendingDown className="w-3 h-3 text-blue-400" />
                </div>
                <div className="text-lg font-bold font-telemetry text-blue-400">
                  +<OdometerNumber value={metrics?.distance_saved_percent || 0} decimals={1} suffix="%" />
                </div>
                <div className="text-[9px] font-body text-slate-500 mt-0.5">vs naive baseline</div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-[10px] font-body mb-1">
                  <span>On-Time SLA</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="text-lg font-bold font-telemetry text-emerald-300">
                  <OdometerNumber value={metrics?.on_time_rate_percent || 98.8} decimals={1} suffix="%" />
                </div>
                <div className="text-[9px] font-body text-slate-500 mt-0.5">within windows</div>
              </div>
            </div>

            {/* Collapsible Telemetry Breakdown */}
            <div className="pt-0.5">
              <button
                onClick={() => setShowDeepAnalytics(!showDeepAnalytics)}
                className="w-full flex items-center justify-between py-1 px-1 text-[11px] font-display text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span>Telemetry Breakdown</span>
                {showDeepAnalytics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showDeepAnalytics && (
                <div className="mt-2 space-y-1.5 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs font-body animate-in fade-in duration-200">
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>CO₂ Reduced:</span>
                    <span className="font-telemetry text-emerald-400 font-semibold">
                      <OdometerNumber value={metrics?.co2_saved_kg || 0} decimals={2} suffix=" kg" />
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Fuel Used:</span>
                    <span className="font-telemetry text-slate-200 font-semibold">
                      <OdometerNumber value={metrics?.fuel_used_liters || 0} decimals={2} suffix=" L" />
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Active Mileage:</span>
                    <span className="font-telemetry text-slate-200 font-semibold">
                      <OdometerNumber value={metrics?.total_distance_km || 0} decimals={1} suffix=" km" />
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Solver Latency:</span>
                    <span className="font-telemetry text-blue-400 font-semibold">{metrics?.solver_execution_time_ms || 19.5} ms</span>
                  </div>
                </div>
              )}
            </div>

            {/* Real Live Event Stream */}
            <div className="pt-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400 font-body">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  <span className="console-header text-slate-300">Live Audit Stream</span>
                </div>
                <span className="text-[9px] font-telemetry px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold uppercase">
                  ACTIVE
                </span>
              </div>

              <div className="relative rounded-lg bg-slate-950/90 border border-slate-800 p-2.5 max-h-44 overflow-y-auto font-telemetry text-[10.5px] leading-relaxed space-y-1.5">
                {(liveState?.events || []).slice().reverse().map((ev, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <span className="text-slate-500 font-mono text-[9px] shrink-0 mt-0.5">[{ev.timestamp}]</span>
                    <span className={
                      ev.type === 'alert'
                        ? 'text-rose-400 font-semibold'
                        : ev.type === 'warning'
                        ? 'text-amber-400 font-semibold'
                        : ev.type === 'success'
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-300'
                    }>
                      ▸ {ev.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Manual Order Intake Form */}
        {activeRightTab === 'intake' && (
          <form onSubmit={handleCreateOrder} className="flex-1 overflow-y-auto p-4 space-y-3.5">
            <div>
              <label className="block text-[11px] font-display text-slate-400 mb-1">Customer Name / Company</label>
              <input
                type="text"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                placeholder="e.g. Acme Technologies India"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-display text-slate-400 mb-1">Street Address</label>
              <input
                type="text"
                value={manualAddress}
                onChange={e => setManualAddress(e.target.value)}
                placeholder="e.g. Google Signature Towers, Kondapur, Hyderabad"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-[9px] font-body text-slate-500 mt-0.5 block">
                Automatic geocoding will resolve coordinates in India.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-display text-slate-400 mb-1">Packages Count</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={manualDemand}
                  onChange={e => setManualDemand(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-display text-slate-400 mb-1">Priority</label>
                <select
                  value={manualPriority}
                  onChange={e => setManualPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-display font-semibold text-white shadow-md shadow-blue-900/40 transition-all mt-4"
            >
              Add to Live Dispatch Queue
            </button>
          </form>
        )}

        {/* Tab 4: CSV Batch Import */}
        {activeRightTab === 'csv' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-3">
            <div className="text-xs font-body text-slate-400 leading-relaxed">
              Paste delivery orders formatted as CSV:
              <code className="block p-2 rounded bg-slate-950 border border-slate-800 text-[10px] font-telemetry text-slate-300 my-1.5 select-all">
                customer,address,lat,lng,demand,priority<br/>
                Cyber Gateway,HITEC City,17.4502,78.3812,3,urgent<br/>
                Financial District,Nanakramguda,17.4180,78.3450,2,normal
              </code>
            </div>

            <textarea
              rows={8}
              value={csvContent}
              onChange={e => setCsvContent(e.target.value)}
              placeholder="customer,address,lat,lng,demand,priority..."
              className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-telemetry text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {csvImportMsg && (
              <div className="p-2 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-1.5 font-display">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {csvImportMsg}
              </div>
            )}

            <button
              onClick={handleImportCsv}
              disabled={!csvContent.trim()}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-display font-semibold text-white shadow-md shadow-blue-900/40 transition-all"
            >
              Import CSV Orders
            </button>
          </div>
        )}
      </aside>

      {/* Main MapLibre Container */}
      <div className="flex-1 relative w-full h-full">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Bottom Timeline Bar: Dispatch Historical Playback */}
        {(() => {
          const totalOrdersCount = liveState?.orders.length || 1;
          const completedCount = liveState?.metrics.completed_deliveries || 0;
          const timelineProgressPercent = Math.min(100, Math.round((completedCount / totalOrdersCount) * 100));
          const currentHistoryItem = liveState?.history && liveState.history[timelineIndex];

          return (
            <div className="absolute bottom-6 left-90 right-96 h-14 z-20 glass-panel rounded-xl flex items-center justify-between px-5 border border-slate-800/90 shadow-2xl contain-panel">
              {/* Play/Pause Historical Playback */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsHistoricalPlaying(!isHistoricalPlaying)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display text-xs font-semibold transition-all duration-150 active:scale-95 border ${
                    isHistoricalPlaying
                      ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
                      : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                  }`}
                  title="Toggle Historical Route Playback across today's shifts"
                >
                  {isHistoricalPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isHistoricalPlaying ? 'Pause Playback' : 'Play Timeline'}</span>
                </button>
              </div>

              {/* Timeline Scrubber */}
              <div className="flex-1 max-w-lg mx-5 flex items-center gap-3">
                <span className="text-[10px] font-display text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">
                  Shift Timeline
                </span>

                <div
                  ref={timelineTrackRef}
                  onMouseMove={handleTimelineMouseMove}
                  onMouseLeave={handleTimelineMouseLeave}
                  onClick={handleTimelineClick}
                  className="flex-1 relative h-2 rounded-full bg-slate-800/90 cursor-pointer overflow-visible border border-slate-700/80"
                >
                  <div
                    className="h-full rounded-full bg-linear-to-r from-blue-600 to-indigo-500 transition-all duration-300"
                    style={{ width: `${Math.max(8, timelineProgressPercent)}%` }}
                  />

                  {scrubberHover && (
                    <>
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
                        style={{ left: `${scrubberHover.x}px` }}
                      />
                      <div
                        className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-telemetry text-slate-300 shadow-md pointer-events-none whitespace-nowrap"
                        style={{ left: `${scrubberHover.x}px` }}
                      >
                        {scrubberHover.percent}% Shift Point
                      </div>
                    </>
                  )}
                </div>

                <span className="text-xs font-telemetry text-slate-300 whitespace-nowrap">
                  {completedCount}/{totalOrdersCount} ({timelineProgressPercent}%)
                </span>
              </div>

              {/* Active Milestone Tag */}
              <div className="hidden lg:flex items-center gap-2 max-w-xs truncate text-[11px] font-telemetry text-slate-400">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="truncate">
                  {currentHistoryItem ? `${currentHistoryItem.timestamp}: ${currentHistoryItem.event}` : 'Live Operations In-Progress'}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Custom On-Map Navigation Controls: Zoom & Recenter Fleet */}
        <div className="absolute bottom-6 right-96 z-20 flex flex-col gap-1.5">
          <button
            onClick={handleRecenterFleet}
            title="Recenter Camera on Fleet"
            className="p-2.5 rounded-xl bg-slate-950/95 hover:bg-slate-900 text-blue-400 border border-slate-800 shadow-xl contain-panel active:scale-95 transition-all flex items-center gap-1.5 text-xs font-display font-semibold"
          >
            <Locate className="w-4 h-4 text-blue-400" />
            <span className="hidden sm:inline text-[11px] text-slate-300">Recenter Fleet</span>
          </button>

          <div className="flex flex-col rounded-xl bg-slate-950/95 border border-slate-800 shadow-xl contain-panel overflow-hidden">
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-2 hover:bg-slate-800/80 text-slate-300 active:bg-slate-700 transition-colors border-b border-slate-800/80"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-2 hover:bg-slate-800/80 text-slate-300 active:bg-slate-700 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Brain View Optimizer Internals Modal */}
      {showBrainView && (
        <BrainViewModal
          onClose={() => setShowBrainView(false)}
          apiEndpoint="http://127.0.0.1:8000/api/live/brain"
          title="Live Brain View"
        />
      )}
    </div>
  );
};

export default LiveDispatcherDashboard;
