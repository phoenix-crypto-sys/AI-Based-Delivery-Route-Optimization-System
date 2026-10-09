import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Map as MapLibreMap, Marker, GeoJSONSource, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

try {
  setWorkerUrl(workerUrl);
} catch {
  // worker already configured
}

import { useLiveSocket } from '../hooks/useLiveSocket';
import {
  Volume2,
  VolumeX,
  CheckCircle,
  MapPin,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  Play,
  Pause
} from 'lucide-react';
import { DEFAULT_CITY_CENTER } from '../config/mapConfig';
import type { ManeuverStep } from '../types/live';

export const DriverCompanionView: React.FC = () => {
  const { liveState, sendGPSPing, markDelivered } = useLiveSocket();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('TRK-LIVE-01');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const speechRate = 1.0;
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const selectedVoiceIndex = 0;

  // GPS source mode: 'device' (real navigator.geolocation) or 'virtual_drive' (for desktop testing)
  const [gpsMode, setGpsMode] = useState<'device' | 'virtual_drive'>('device');
  const [isVirtualDriving, setIsVirtualDriving] = useState<boolean>(false);
  const [, setVirtualIndex] = useState<number>(0);

  // Current driver location
  const [driverLat, setDriverLat] = useState<number>(DEFAULT_CITY_CENTER.lat);
  const [driverLng, setDriverLng] = useState<number>(DEFAULT_CITY_CENTER.lng);
  const [driverHeading, setDriverHeading] = useState<number>(90);
  const [driverSpeed, setDriverSpeed] = useState<number>(28);

  // Current turn maneuver
  const [currentManeuverIndex, setCurrentManeuverIndex] = useState<number>(0);
  const announcedStepsRef = useRef<Set<string>>(new Set());

  // MapLibre map refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const driverMarkerRef = useRef<Marker | null>(null);

  const activeRoute = liveState?.routes.find(r => r.vehicle_id === selectedVehicleId);
  const maneuvers: ManeuverStep[] = useMemo(() => activeRoute?.maneuvers || [], [activeRoute?.maneuvers]);
  const currentManeuver: ManeuverStep = useMemo(() => maneuvers[currentManeuverIndex] || {
    instruction: 'Continue on planned delivery corridor',
    type: 'continue',
    modifier: 'straight',
    distance_meters: 450,
    duration_seconds: 60,
    street_name: 'HITEC City Main Rd / Cyberabad Corridor',
    location: [driverLng, driverLat]
  }, [maneuvers, currentManeuverIndex, driverLng, driverLat]);

  const formattedInstruction = useMemo(() => {
    let text = currentManeuver.instruction || 'Continue on planned route';
    if (text.trim() === 'Head out onto' || text.endsWith('onto ')) {
      text = 'Head out onto Cyberabad Arterial Corridor';
    }
    return text;
  }, [currentManeuver.instruction]);

  const [justDelivered, setJustDelivered] = useState<boolean>(false);
  const nextStop = activeRoute?.ordered_stops[0];

  // Initialize Web Speech Synthesis Voices
  useEffect(() => {
    const updateVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
      }
    };
    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Spoken Announcement Helper (Threshold-based)
  const speakText = useCallback((text: string) => {
    if (isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (availableVoices[selectedVoiceIndex]) {
        utterance.voice = availableVoices[selectedVoiceIndex];
      }
      utterance.rate = speechRate;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }, [isMuted, availableVoices, selectedVoiceIndex, speechRate]);

  // Real Device GPS: navigator.geolocation.watchPosition
  useEffect(() => {
    if (gpsMode !== 'device' || typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const heading = pos.coords.heading || 0;
        const speedKmh = pos.coords.speed ? pos.coords.speed * 3.6 : 25;

        setDriverLat(lat);
        setDriverLng(lng);
        setDriverHeading(heading);
        setDriverSpeed(Math.round(speedKmh));

        // Stream real GPS ping to backend
        sendGPSPing(selectedVehicleId, lat, lng, heading, Math.round(speedKmh));
      },
      (err) => {
        console.warn('Device GPS unavailable (fallback active):', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [gpsMode, selectedVehicleId, sendGPSPing]);

  // Virtual Driving GPS (Step-by-step testing on desktop along real OSRM coordinates)
  useEffect(() => {
    if (gpsMode !== 'virtual_drive' || !isVirtualDriving || !activeRoute?.geometry_geojson?.coordinates) {
      return;
    }

    const coords = activeRoute.geometry_geojson.coordinates;
    if (coords.length < 2) return;

    const interval = setInterval(() => {
      setVirtualIndex((prev) => {
        const next = (prev + 1) % coords.length;
        const [lng, lat] = coords[next];
        const [prevLng, prevLat] = coords[prev];

        // Heading calculation
        const dy = lat - prevLat;
        const dx = lng - prevLng;
        const heading = Math.round((Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360);

        setDriverLat(lat);
        setDriverLng(lng);
        setDriverHeading(heading);
        setDriverSpeed(32);

        // POST real ping to backend
        sendGPSPing(selectedVehicleId, lat, lng, heading, 32);

        // Check distance to next maneuver step
        if (maneuvers.length > 0) {
          const mIdx = Math.min(Math.floor((next / coords.length) * maneuvers.length), maneuvers.length - 1);
          setCurrentManeuverIndex(mIdx);
        }

        return next;
      });
    }, 2500);

    return () => clearInterval(interval);
  }, [gpsMode, isVirtualDriving, activeRoute, selectedVehicleId, sendGPSPing, maneuvers]);

  // Voice Guidance Triggers (Threshold & Event-based)
  useEffect(() => {
    if (!currentManeuver) return;

    const key = `${currentManeuverIndex}-${currentManeuver.instruction}`;
    if (!announcedStepsRef.current.has(key)) {
      announcedStepsRef.current.add(key);
      speakText(currentManeuver.instruction);
    }
  }, [currentManeuver, currentManeuverIndex, speakText]);

  // Initialize MapLibre GL Mobile Driver Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [driverLng, driverLat],
      zoom: 16,
      minZoom: 10,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false
    });

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
      // Add source for route line
      map.addSource('driver-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'driver-route-layer',
        type: 'line',
        source: 'driver-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3B82F6',
          'line-width': 5,
          'line-opacity': 0.9
        }
      });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Driver Marker and Smooth Camera Follow
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Smooth camera ease to driver position
    map.easeTo({
      center: [driverLng, driverLat],
      duration: 800,
      essential: true
    });

    if (!driverMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'driver-gps-marker';
      el.innerHTML = `
        <div style="width: 38px; height: 38px; border-radius: 50%; background: #3B82F6; border: 3px solid #FFFFFF; box-shadow: 0 0 20px #3B82F6; display: flex; align-items: center; justify-content: center; color: white; transform: rotate(${driverHeading}deg); transition: transform 0.4s ease;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
          </svg>
        </div>
      `;

      driverMarkerRef.current = new Marker({ element: el })
        .setLngLat([driverLng, driverLat])
        .addTo(map);
    } else {
      driverMarkerRef.current.setLngLat([driverLng, driverLat]);
      const iconDiv = driverMarkerRef.current.getElement().firstElementChild as HTMLElement;
      if (iconDiv) {
        iconDiv.style.transform = `rotate(${driverHeading}deg)`;
      }
    }

    // Update Route Line Data
    if (map.getSource('driver-route') && activeRoute?.geometry_geojson) {
      (map.getSource('driver-route') as GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: activeRoute.geometry_geojson
      });
    }
  }, [driverLat, driverLng, driverHeading, activeRoute]);

  const handleMarkDelivered = () => {
    if (!nextStop || justDelivered) return;
    setJustDelivered(true);
    speakText("Delivery confirmed. Calculating next stop.");
    markDelivered(nextStop.order_id, selectedVehicleId);
    setTimeout(() => setJustDelivered(false), 1500);
  };

  const getManeuverIcon = (_type?: string, modifier?: string) => {
    if (modifier?.includes('left')) return <ArrowLeft className="w-8 h-8 text-blue-400" />;
    if (modifier?.includes('right')) return <ArrowRight className="w-8 h-8 text-blue-400" />;
    return <ArrowUp className="w-8 h-8 text-blue-400" />;
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070B14] flex flex-col select-none">
      {/* Mobile Top Navigation Bar: Turn Instruction + Audio Controls */}
      <div className="z-30 p-4 bg-slate-950/95 border-b border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center">
            {getManeuverIcon(currentManeuver.type, currentManeuver.modifier)}
          </div>
          <div>
            <div className="text-sm font-display font-bold text-white tracking-wide flex items-center gap-2">
              {formattedInstruction}
            </div>
            <div className="text-xs font-telemetry text-slate-400 flex items-center gap-2 mt-0.5">
              <span>in <strong className="text-blue-300 font-semibold">{currentManeuver.distance_meters}m</strong></span>
              <span>•</span>
              <span>Speed: <strong className="text-slate-200">{driverSpeed} km/h</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio Mute Toggle */}
          <button
            onClick={() => {
              setIsMuted(!isMuted);
              if (isMuted) speakText("Voice guidance enabled");
            }}
            className={`p-2 rounded-xl border transition-all ${
              isMuted
                ? 'bg-rose-950/40 border-rose-800 text-rose-400'
                : 'bg-blue-600/20 border-blue-500 text-blue-300'
            }`}
            title={isMuted ? 'Unmute Voice' : 'Mute Voice'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Fullscreen Turn-by-Turn Map */}
      <div className="flex-1 relative w-full h-full">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* GPS Mode & Test Controls Overlay */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          <div className="p-2 rounded-xl bg-slate-950/90 border border-slate-800 backdrop-blur-md text-[11px] font-telemetry space-y-1.5 shadow-lg">
            <div className="flex items-center justify-between gap-3 text-slate-400">
              <span>GPS Mode:</span>
              <select
                value={gpsMode}
                onChange={e => setGpsMode(e.target.value as any)}
                className="bg-slate-900 text-slate-200 px-2 py-0.5 rounded border border-slate-700 text-[10px]"
              >
                <option value="device">Phone GPS</option>
                <option value="virtual_drive">Drive Simulation</option>
              </select>
            </div>

            {gpsMode === 'virtual_drive' && (
              <button
                onClick={() => setIsVirtualDriving(!isVirtualDriving)}
                className={`w-full py-1 rounded text-[10px] font-display font-semibold flex items-center justify-center gap-1 border ${
                  isVirtualDriving
                    ? 'bg-rose-950 border-rose-800 text-rose-300'
                    : 'bg-emerald-950 border-emerald-800 text-emerald-300'
                }`}
              >
                {isVirtualDriving ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {isVirtualDriving ? 'Pause Virtual Drive' : 'Drive Route'}
              </button>
            )}

            <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
              <span>Vehicle:</span>
              <select
                value={selectedVehicleId}
                onChange={e => setSelectedVehicleId(e.target.value)}
                className="bg-slate-900 text-slate-200 px-1 rounded border border-slate-700 text-[9px]"
              >
                {liveState?.vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Bottom Delivery Action Card */}
      <div className="z-30 p-4 bg-slate-950/95 border-t border-slate-800 backdrop-blur-md shadow-2xl">
        {nextStop ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-[10px] font-telemetry text-blue-400 font-bold tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> NEXT DELIVERY STOP
              </div>
              <div className="text-sm font-display font-bold text-white truncate">
                {nextStop.customer_name}
              </div>
              <div className="text-xs font-body text-slate-400 truncate">
                {nextStop.address || 'HITEC City Cyber Towers, Hyderabad'}
              </div>
            </div>

            <button
              onClick={handleMarkDelivered}
              disabled={justDelivered}
              className={`px-5 py-3 rounded-xl active:scale-95 text-xs font-display font-bold text-white shadow-lg transition-all flex items-center gap-2 shrink-0 ${
                justDelivered
                  ? 'bg-emerald-500 scale-105 shadow-emerald-500/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'
              }`}
            >
              <CheckCircle className={`w-4 h-4 ${justDelivered ? 'animate-spin' : ''}`} />
              {justDelivered ? 'Confirmed!' : 'Mark Delivered'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs font-display text-slate-400 py-1">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" /> All assigned deliveries for this route are complete!
            </span>
            <span className="text-blue-400 font-telemetry text-[11px] font-bold tracking-wider">RETURN TO DEPOT</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverCompanionView;
