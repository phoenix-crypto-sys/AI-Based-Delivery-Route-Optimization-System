import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Map as MapLibreMap, GeoJSONSource, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

try {
  setWorkerUrl(workerUrl);
} catch {
  // worker already configured
}

import {
  Mic,
  Navigation,
  Volume2,
  VolumeX,
  Compass,
  Car,
  Bike,
  Plus,
  AlertTriangle,
  X,
  Star,
  ChevronRight,
  Sparkles,
  Layers,
  ShieldAlert,
  Flag,
  RotateCcw,
  ArrowUpDown,
  Locate,
  Search,
  MapPin,
  Loader2,
  Check
} from 'lucide-react';
import type {
  Landmark,
  ConsumerRouteData,
  ConsumerManeuver,
  AssistantActionCard,
  RerouteExplanationData
} from '../types/consumer';

// Presets in Hyderabad (India-first scope)
const HYDERABAD_PRESETS = [
  { name: 'Inorbit Mall & Durgam Cheruvu', lat: 17.4354, lng: 78.3879, desc: 'Near Cable Bridge' },
  { name: 'Jubilee Hills Check Post', lat: 17.4318, lng: 78.4072, desc: 'Road No. 36 Junction' },
  { name: 'Gachibowli Bio-Diversity Park', lat: 17.4325, lng: 78.3712, desc: 'Old Mumbai Highway' },
  { name: 'Cyber Towers Central Hub', lat: 17.4507, lng: 78.3809, desc: 'Hitec City Epicenter' },
  { name: 'Charminar Heritage Plaza', lat: 17.3616, lng: 78.4747, desc: 'Old City Corridor' },
  { name: 'Ratnadeep Supermarket (Mindspace)', lat: 17.4392, lng: 78.3802, desc: 'Gate 2 Entrance' }
];

export const ConsumerNavigationView: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);
  const [isSimulationDrawerOpen, setIsSimulationDrawerOpen] = useState<boolean>(false);

  // Navigation Origin & Destination (Fully Editable)
  const [origin, setOrigin] = useState<{ lat: number; lng: number; name: string }>({
    lat: 17.4504,
    lng: 78.3811,
    name: 'Cyber Towers / Karachi Bakery Hub'
  });

  const [destination, setDestination] = useState<{ lat: number; lng: number; name: string }>({
    lat: 17.4318,
    lng: 78.4072,
    name: 'Jubilee Hills Check Post'
  });

  // Direct-type input & autocomplete state
  const [startInputText, setStartInputText] = useState<string>('Cyber Towers / Karachi Bakery Hub');
  const [destInputText, setDestInputText] = useState<string>('Jubilee Hills Check Post');
  const [startSuggestions, setStartSuggestions] = useState<Array<{ name: string; display_name: string; lat: number; lng: number; type: string; category?: string }>>([]);
  const [destSuggestions, setDestSuggestions] = useState<Array<{ name: string; display_name: string; lat: number; lng: number; type: string; category?: string }>>([]);
  const [isSearchingStart, setIsSearchingStart] = useState<boolean>(false);
  const [isSearchingDest, setIsSearchingDest] = useState<boolean>(false);
  const [showStartDropdown, setShowStartDropdown] = useState<boolean>(false);
  const [showDestDropdown, setShowDestDropdown] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const startDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputsContainerRef = useRef<HTMLDivElement | null>(null);

  const [enRouteStops, setEnRouteStops] = useState<{ lat: number; lng: number; name: string }[]>([]);
  const [vehicleMode, setVehicleMode] = useState<'car' | 'bike' | 'auto'>('car');
  const [activeRoute, setActiveRoute] = useState<ConsumerRouteData | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);

  // Turn-by-Turn state
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);

  // Landmarks state (Default: false = show only route-relevant landmarks)
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [showLandmarkLayer, setShowLandmarkLayer] = useState<boolean>(false);
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [isAddingLandmark, setIsAddingLandmark] = useState<boolean>(false);

  // Synchronous refs for instantaneous binding inside map on-load event
  const activeRouteRef = useRef<ConsumerRouteData | null>(null);
  const landmarksRef = useRef<Landmark[]>([]);
  const showLandmarkLayerRef = useRef<boolean>(false);

  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);

  useEffect(() => {
    landmarksRef.current = landmarks;
  }, [landmarks]);

  useEffect(() => {
    showLandmarkLayerRef.current = showLandmarkLayer;
  }, [showLandmarkLayer]);

  // Compute landmarks relevant to the current route turn-by-turn maneuvers
  const relevantLandmarkIds = useMemo(() => {
    if (!activeRoute?.maneuvers) return new Set<string>();
    const ids = new Set<string>();
    activeRoute.maneuvers.forEach(m => {
      if (m.landmark?.id) ids.add(m.landmark.id);
    });
    return ids;
  }, [activeRoute]);

  const relevantLandmarksCount = useMemo(() => {
    return landmarks.filter(lm => relevantLandmarkIds.has(lm.id)).length;
  }, [landmarks, relevantLandmarkIds]);
  const [newLandmarkForm, setNewLandmarkForm] = useState({
    name: '',
    category: 'shop',
    visual_cue: '',
    description: '',
    lat: 17.445,
    lng: 78.385
  });

  // Explainable Rerouting state
  const [rerouteAlert, setRerouteAlert] = useState<RerouteExplanationData | null>(null);
  const rerouteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Conversational Voice Assistant state
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceQueryText, setVoiceQueryText] = useState<string>('');
  const [assistantCard, setAssistantCard] = useState<AssistantActionCard | null>(null);
  const [assistantSpokenText, setAssistantSpokenText] = useState<string | null>(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState<boolean>(false);
  const speechRecognitionRef = useRef<any>(null);

  // Web Speech TTS voice output
  const speakUtterance = useCallback((text: string) => {
    if (isAudioMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis silent fallback
    }
  }, [isAudioMuted]);

  // Fetch Landmarks from Backend
  const fetchLandmarks = useCallback(async () => {
    try {
      const resp = await fetch('http://127.0.0.1:8000/api/consumer/landmarks');
      if (resp.ok) {
        const data = await resp.json();
        setLandmarks(data);
      }
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    fetchLandmarks();
  }, [fetchLandmarks]);

  // Curated Hyderabad locations for instant 0ms autocomplete
  const HYDERABAD_LOCAL_DATABASE = useMemo(() => [
    ...HYDERABAD_PRESETS.map(p => ({
      name: p.name,
      display_name: `${p.name} (${p.desc})`,
      lat: p.lat,
      lng: p.lng,
      type: 'hub',
      category: 'hub'
    })),
    { name: 'IKEA Hyderabad (Hitec City)', display_name: 'IKEA Hyderabad, Mindspace / Raidurgam Corridor', lat: 17.4385, lng: 78.3772, type: 'landmark', category: 'shop' },
    { name: 'Rajiv Gandhi International Airport (RGIA)', display_name: 'RGIA Airport, Shamshabad Express Highway', lat: 17.2403, lng: 78.4294, type: 'transit', category: 'transit' },
    { name: 'Secunderabad Railway Station', display_name: 'Secunderabad Junction, Station Road', lat: 17.4344, lng: 78.5011, type: 'transit', category: 'transit' },
    { name: 'KBR National Park (Jubilee Hills)', display_name: 'KBR Park Gate, Road No. 2 Jubilee Hills', lat: 17.4246, lng: 78.4217, type: 'landmark', category: 'park' },
    { name: 'Durgam Cheruvu Cable Stayed Bridge', display_name: 'Cable Bridge Viewpoint, Madhapur', lat: 17.4340, lng: 78.3895, type: 'landmark', category: 'bridge' },
    { name: 'DLF Cyber City Food Street', display_name: 'DLF Gate 2 Night Food Street, Gachibowli', lat: 17.4474, lng: 78.3582, type: 'landmark', category: 'food' },
    { name: 'Financial District (Wipro Circle)', display_name: 'Wipro Circle / WaveRock, Nanakramguda', lat: 17.4168, lng: 78.3475, type: 'hub', category: 'hub' },
    { name: 'Banjara Hills Road No. 12', display_name: 'Road No. 12 / Cancer Hospital Junction, Banjara Hills', lat: 17.4156, lng: 78.4350, type: 'hub', category: 'hub' },
    { name: 'Tank Bund / Hussain Sagar', display_name: 'Tank Bund Promenade, Buddha Statue View', lat: 17.4239, lng: 78.4738, type: 'landmark', category: 'landmark' },
    { name: 'Hi-Tech City MMTS Station', display_name: 'Hitec City Railway Station, Hafeezpet Road', lat: 17.4589, lng: 78.3725, type: 'transit', category: 'transit' }
  ], []);

  // Location search helper: instant local + debounced backend geocode
  const searchLocations = useCallback(async (
    query: string,
    setResults: React.Dispatch<React.SetStateAction<Array<{ name: string; display_name: string; lat: number; lng: number; type: string; category?: string }>>>,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }

    // 1. Instant local match
    const instantMatches = [
      ...HYDERABAD_LOCAL_DATABASE.filter(item => item.name.toLowerCase().includes(q) || item.display_name.toLowerCase().includes(q)),
      ...landmarks.filter(lm => lm.name.toLowerCase().includes(q) || lm.description.toLowerCase().includes(q) || lm.visual_cue.toLowerCase().includes(q)).map(lm => ({
        name: lm.name,
        display_name: `${lm.name} (${lm.visual_cue})`,
        lat: lm.lat,
        lng: lm.lng,
        type: 'landmark',
        category: lm.category
      }))
    ];

    setResults(instantMatches.slice(0, 6));

    if (q.length < 2) {
      setLoading(false);
      return;
    }

    // 2. Query geocoding endpoint for deeper search
    setLoading(true);
    try {
      const resp = await fetch(`http://127.0.0.1:8000/api/consumer/geocode?q=${encodeURIComponent(query)}`);
      if (resp.ok) {
        const data = await resp.json();
        const combined = [...instantMatches];
        for (const item of data) {
          if (!combined.some(existing => Math.abs(existing.lat - item.lat) < 0.0008 && Math.abs(existing.lng - item.lng) < 0.0008)) {
            combined.push(item);
          }
        }
        setResults(combined.slice(0, 8));
      }
    } catch {
      // Keep instant matches
    } finally {
      setLoading(false);
    }
  }, [HYDERABAD_LOCAL_DATABASE, landmarks]);

  // Handle start input typing with 350ms debounce
  const handleStartInputChange = (val: string) => {
    setStartInputText(val);
    setShowStartDropdown(true);
    if (startDebounceRef.current) clearTimeout(startDebounceRef.current);
    startDebounceRef.current = setTimeout(() => {
      searchLocations(val, setStartSuggestions, setIsSearchingStart);
    }, 350);
  };

  // Handle dest input typing with 350ms debounce
  const handleDestInputChange = (val: string) => {
    setDestInputText(val);
    setShowDestDropdown(true);
    if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
    destDebounceRef.current = setTimeout(() => {
      searchLocations(val, setDestSuggestions, setIsSearchingDest);
    }, 350);
  };

  // Explicit confirmation state tracking: input text must match active routing endpoint
  const isStartConfirmed = startInputText.trim().toLowerCase() === origin.name.trim().toLowerCase();
  const isDestConfirmed = destInputText.trim().toLowerCase() === destination.name.trim().toLowerCase();

  const startSearchFailed = !isSearchingStart && startSuggestions.length === 0 && startInputText.trim().length >= 2 && !isStartConfirmed;
  const destSearchFailed = !isSearchingDest && destSuggestions.length === 0 && destInputText.trim().length >= 2 && !isDestConfirmed;

  // Select start location
  const handleSelectStart = (item: { name: string; lat: number; lng: number }) => {
    setOrigin({ lat: item.lat, lng: item.lng, name: item.name });
    setStartInputText(item.name);
    setShowStartDropdown(false);
    setStartSuggestions([]);
  };

  // Select dest location
  const handleSelectDest = (item: { name: string; lat: number; lng: number }) => {
    setDestination({ lat: item.lat, lng: item.lng, name: item.name });
    setDestInputText(item.name);
    setShowDestDropdown(false);
    setDestSuggestions([]);
  };

  // Swap Start & Destination
  const handleSwapEndpoints = () => {
    const prevOrigin = origin;
    const prevDest = destination;
    setOrigin(prevDest);
    setDestination(prevOrigin);
    setStartInputText(prevDest.name);
    setDestInputText(prevOrigin.name);
    setShowStartDropdown(false);
    setShowDestDropdown(false);
  };

  // Use Current Location (GPS)
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationNotice('Geolocation not supported by this browser.');
      setTimeout(() => setLocationNotice(null), 3500);
      return;
    }

    setIsLocating(true);
    setLocationNotice(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const name = 'Current Location (GPS)';
        setOrigin({ lat: userLat, lng: userLng, name });
        setStartInputText(name);
        setIsLocating(false);
        setLocationNotice('GPS Location acquired!');
        setTimeout(() => setLocationNotice(null), 3000);
      },
      (err) => {
        setIsLocating(false);
        let msg = 'Could not acquire GPS position.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission denied. Please allow location access in browser.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Position unavailable. Retaining current start point.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out.';
        }
        setLocationNotice(msg);
        setTimeout(() => setLocationNotice(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  };

  // Click outside to dismiss autocomplete dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputsContainerRef.current && !inputsContainerRef.current.contains(e.target as Node)) {
        setShowStartDropdown(false);
        setShowDestDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Initialize MapLibre GL Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [origin.lng, origin.lat],
      zoom: 14,
      pitch: 28, // Subtle physical driving perspective
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
      // A. Consumer Route Polyline
      map.addSource('consumer-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'consumer-route-casing',
        type: 'line',
        source: 'consumer-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#1E3A8A',
          'line-width': 7.5,
          'line-opacity': 0.75
        }
      });

      map.addLayer({
        id: 'consumer-route-core',
        type: 'line',
        source: 'consumer-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#3B82F6',
          'line-width': 4.5,
          'line-opacity': 0.95
        }
      });

      // B. Landmarks GL Native Layer (Subtle, visually secondary to endpoints)
      map.addSource('landmarks-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'landmarks-halo',
        type: 'circle',
        source: 'landmarks-source',
        paint: {
          'circle-radius': 9,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.16
        }
      });

      map.addLayer({
        id: 'landmarks-circle',
        type: 'circle',
        source: 'landmarks-source',
        paint: {
          'circle-radius': 5.5,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#0F172A'
        }
      });

      map.addLayer({
        id: 'landmarks-label',
        type: 'symbol',
        source: 'landmarks-source',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 9,
          'text-offset': [1.2, 0],
          'text-anchor': 'left',
          'text-optional': true
        },
        paint: {
          'text-color': '#94A3B8',
          'text-halo-color': '#090D1A',
          'text-halo-width': 1.5
        }
      });

      // C. Origin & Destination GL Points & Bold Endpoint Labels
      map.addSource('endpoints-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'endpoints-circle',
        type: 'circle',
        source: 'endpoints-source',
        paint: {
          'circle-radius': 12,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FFFFFF'
        }
      });

      map.addLayer({
        id: 'endpoints-label',
        type: 'symbol',
        source: 'endpoints-source',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.8],
          'text-anchor': 'bottom',
          'text-max-width': 14,
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#0F172A',
          'text-halo-width': 3
        }
      });

      // D. Suggested En-Route POI Highlight Layer
      map.addSource('poi-highlight-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'poi-highlight-circle',
        type: 'circle',
        source: 'poi-highlight-source',
        paint: {
          'circle-radius': 14,
          'circle-color': '#10B981',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FFFFFF'
        }
      });

      // E. User Simulated / Real-Time Live Position Marker
      map.addSource('user-location-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [origin.lng, origin.lat] },
            properties: { label: 'You' }
          }]
        }
      });

      map.addLayer({
        id: 'user-location-pulse',
        type: 'circle',
        source: 'user-location-source',
        paint: {
          'circle-radius': 20,
          'circle-color': '#06B6D4',
          'circle-opacity': 0.35
        }
      });

      map.addLayer({
        id: 'user-location-dot',
        type: 'circle',
        source: 'user-location-source',
        paint: {
          'circle-radius': 7.5,
          'circle-color': '#06B6D4',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#FFFFFF'
        }
      });

      // Click on Landmark
      map.on('click', 'landmarks-circle', (e) => {
        const feat = e.features?.[0];
        if (feat?.properties) {
          const props = feat.properties as any;
          setSelectedLandmark({
            id: props.id,
            name: props.name,
            category: props.category,
            visual_cue: props.visual_cue,
            description: props.description,
            lat: props.lat,
            lng: props.lng
          });
        }
      });

      map.on('mouseenter', 'landmarks-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'landmarks-circle', () => { map.getCanvas().style.cursor = ''; });

      // Immediate data population on map load if route or landmarks are ready
      if (activeRouteRef.current) {
        const rSrc = map.getSource('consumer-route') as GeoJSONSource | undefined;
        if (rSrc) {
          rSrc.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {},
              geometry: activeRouteRef.current.geometry
            }]
          });
        }

        const epSrc = map.getSource('endpoints-source') as GeoJSONSource | undefined;
        if (epSrc) {
          epSrc.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [origin.lng, origin.lat] },
                properties: { color: '#10B981', label: origin.name, role: 'Start' }
              },
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [destination.lng, destination.lat] },
                properties: { color: '#EF4444', label: destination.name, role: 'Destination' }
              }
            ]
          });
        }

        try {
          const bounds = new LngLatBounds();
          bounds.extend([origin.lng, origin.lat]);
          bounds.extend([destination.lng, destination.lat]);
          map.fitBounds(bounds, { padding: 90, duration: 400, maxZoom: 15 });
        } catch {}
      }

      if (landmarksRef.current && landmarksRef.current.length > 0) {
        const lmSrc = map.getSource('landmarks-source') as GeoJSONSource | undefined;
        if (lmSrc) {
          const relevantIds = new Set<string>();
          if (activeRouteRef.current?.maneuvers) {
            activeRouteRef.current.maneuvers.forEach(m => {
              if (m.landmark?.id) relevantIds.add(m.landmark.id);
            });
          }
          const displayLms = showLandmarkLayerRef.current
            ? landmarksRef.current
            : landmarksRef.current.filter(lm => relevantIds.has(lm.id));

          const features = displayLms.map((lm) => {
            let color = '#3B82F6';
            if (lm.category === 'tea_stall') color = '#F59E0B';
            else if (lm.category === 'temple') color = '#EAB308';
            else if (lm.category === 'gate') color = '#38BDF8';
            else if (lm.category === 'shop') color = '#10B981';
            else if (lm.category === 'food') color = '#F43F5E';

            return {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [lm.lng, lm.lat] },
              properties: {
                id: lm.id,
                name: lm.name,
                category: lm.category,
                visual_cue: lm.visual_cue,
                description: lm.description,
                lat: lm.lat,
                lng: lm.lng,
                color: color
              }
            };
          });
          lmSrc.setData({ type: 'FeatureCollection', features });
        }
      }

      map.resize();
      setIsMapLoaded(true);
    });

    mapInstanceRef.current = map;
    (window as any).consumerMapInstance = map;

    return () => {
      (window as any).consumerMapInstance = null;
      map.remove();
      mapInstanceRef.current = null;
      setIsMapLoaded(false);
    };
  }, []);

  // ResizeObserver for rock-solid map sizing in responsive layout
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const ro = new ResizeObserver(() => {
      mapInstanceRef.current?.resize();
    });
    ro.observe(mapContainerRef.current);

    const t1 = setTimeout(() => mapInstanceRef.current?.resize(), 100);
    const t2 = setTimeout(() => mapInstanceRef.current?.resize(), 400);
    const t3 = setTimeout(() => mapInstanceRef.current?.resize(), 1000);

    return () => {
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // 2. Sync Landmarks to Native MapLibre Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isMapLoaded) return;

    const lmSrc = map.getSource('landmarks-source') as GeoJSONSource | undefined;
    if (lmSrc) {
      // By default show only route-relevant landmarks; if showLandmarkLayer is true, show all
      let displayLandmarks: Landmark[] = [];
      if (showLandmarkLayer) {
        displayLandmarks = landmarks;
      } else if (activeRoute?.maneuvers) {
        const relevantIds = new Set<string>();
        activeRoute.maneuvers.forEach(m => {
          if (m.landmark?.id) relevantIds.add(m.landmark.id);
        });
        displayLandmarks = landmarks.filter(lm => relevantIds.has(lm.id));
      }

      const features = displayLandmarks.map((lm) => {
        let color = '#3B82F6';
        if (lm.category === 'tea_stall') color = '#F59E0B'; // Amber
        else if (lm.category === 'temple') color = '#EAB308'; // Gold
        else if (lm.category === 'gate') color = '#38BDF8'; // Sky blue
        else if (lm.category === 'shop') color = '#10B981'; // Emerald
        else if (lm.category === 'food') color = '#F43F5E'; // Rose

        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lm.lng, lm.lat] },
          properties: {
            id: lm.id,
            name: lm.name,
            category: lm.category,
            visual_cue: lm.visual_cue,
            description: lm.description,
            lat: lm.lat,
            lng: lm.lng,
            color: color
          }
        };
      });

      lmSrc.setData({ type: 'FeatureCollection', features });
    }
  }, [landmarks, showLandmarkLayer, isMapLoaded, activeRoute]);

  // 3. Compute Consumer Route (Landmark Enriched Directions)
  const calculateRoute = useCallback(async () => {
    setIsLoadingRoute(true);
    try {
      const resp = await fetch('http://127.0.0.1:8000/api/consumer/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          stops: enRouteStops.map(s => ({ lat: s.lat, lng: s.lng })),
          vehicle_type: vehicleMode
        })
      });

      if (resp.ok) {
        const routeData: ConsumerRouteData = await resp.json();
        setActiveRoute(routeData);
        setCurrentStepIndex(0);

        // Voice announcement of the first landmark-enriched instruction
        if (routeData.maneuvers.length > 0) {
          const firstStep = routeData.maneuvers[0];
          speakUtterance(firstStep.instruction);
        }
      }
    } catch (e) {
      console.error('Route calculation error:', e);
    } finally {
      setIsLoadingRoute(false);
    }
  }, [origin, destination, enRouteStops, vehicleMode, speakUtterance]);

  // Recalculate route whenever endpoints change
  useEffect(() => {
    calculateRoute();
  }, [calculateRoute]);

  // 4. Reactive synchronization of Active Route & Live Position to Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isMapLoaded || !activeRoute) return;

    // Update route line
    const rSrc = map.getSource('consumer-route') as GeoJSONSource | undefined;
    if (rSrc) {
      rSrc.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: activeRoute.geometry
        }]
      });
    }

    // Update origin, stops & destination markers with exact name labels
    const epSrc = map.getSource('endpoints-source') as GeoJSONSource | undefined;
    if (epSrc) {
      const epFeatures = [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [origin.lng, origin.lat] },
          properties: { color: '#10B981', label: origin.name, role: 'Start' }
        },
        ...enRouteStops.map(s => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
          properties: { color: '#F59E0B', label: s.name, role: 'Stop' }
        })),
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [destination.lng, destination.lat] },
          properties: { color: '#EF4444', label: destination.name, role: 'Destination' }
        }
      ];
      epSrc.setData({ type: 'FeatureCollection', features: epFeatures });
    }

    // Update User Live Position Marker
    const userSrc = map.getSource('user-location-source') as GeoJSONSource | undefined;
    if (userSrc) {
      userSrc.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [origin.lng, origin.lat] },
          properties: { label: 'You' }
        }]
      });
    }

    // Camera fit bounds
    try {
      const bounds = new LngLatBounds();
      bounds.extend([origin.lng, origin.lat]);
      bounds.extend([destination.lng, destination.lat]);
      enRouteStops.forEach(s => bounds.extend([s.lng, s.lat]));
      map.fitBounds(bounds, { padding: 90, duration: 650, maxZoom: 15 });
    } catch {
      // bounds fallback
    }
  }, [activeRoute, isMapLoaded, origin, destination, enRouteStops]);

  // Current Active Maneuver
  const currentManeuver: ConsumerManeuver = useMemo(() => {
    if (!activeRoute?.maneuvers?.length) {
      return {
        instruction: 'Navigating towards Hyderabad destination',
        type: 'continue',
        modifier: 'straight',
        distance_meters: 250,
        duration_seconds: 40,
        street_name: 'Hyderabad Corridor',
        location: [origin.lng, origin.lat]
      };
    }
    return activeRoute.maneuvers[currentStepIndex] || activeRoute.maneuvers[0];
  }, [activeRoute, currentStepIndex, origin]);

  // Trigger Explainable Rerouting Simulation
  const triggerExplainableReroute = async (triggerType: 'accident' | 'waterlogging' | 'traffic_surge') => {
    try {
      const resp = await fetch('http://127.0.0.1:8000/api/consumer/simulate-reroute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_type: triggerType,
          location_name: triggerType === 'waterlogging' ? 'Jubilee Hills Road 36 Underpass' : 'HITEC City Flyover',
          corridor_name: triggerType === 'waterlogging' ? 'Durgam Cheruvu Cable Bypass' : 'Mindspace Arterial Bypass'
        })
      });

      if (resp.ok) {
        const data: RerouteExplanationData = await resp.json();
        setRerouteAlert(data);
        speakUtterance(data.spoken_announcement);

        // Auto-dismiss after 8 seconds
        if (rerouteTimeoutRef.current) clearTimeout(rerouteTimeoutRef.current);
        rerouteTimeoutRef.current = setTimeout(() => {
          setRerouteAlert(null);
        }, 8000);

        // Re-calculate route with bypass
        calculateRoute();
      }
    } catch {
      // Fallback local explanation
      const fallback: RerouteExplanationData = {
        trigger_type: triggerType,
        explanation: 'Rerouting — traffic bottleneck detected ahead; taking Mindspace bypass saves 6 minutes.',
        spoken_announcement: 'Rerouting ahead to save 6 minutes.',
        time_saved_min: 6,
        delay_avoided_min: 10,
        trigger_distance_m: 650,
        timestamp: Date.now()
      };
      setRerouteAlert(fallback);
      speakUtterance(fallback.spoken_announcement);
    }
  };

  // Conversational Voice Query Pipeline
  const handleProcessVoiceQuery = async (queryText: string) => {
    if (!queryText.trim()) return;
    setIsProcessingVoice(true);
    setVoiceQueryText(queryText);

    try {
      const routeCoords = activeRoute?.geometry?.coordinates || [];
      const resp = await fetch('http://127.0.0.1:8000/api/consumer/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          current_lat: origin.lat,
          current_lng: origin.lng,
          active_route_coords: routeCoords
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        setAssistantSpokenText(data.voice_response);
        speakUtterance(data.voice_response);

        if (data.card) {
          setAssistantCard(data.card);
          // Highlight suggested POI on map
          const map = mapInstanceRef.current;
          if (map && map.isStyleLoaded()) {
            const poiSrc = map.getSource('poi-highlight-source') as GeoJSONSource | undefined;
            if (poiSrc) {
              poiSrc.setData({
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [data.card.lng, data.card.lat] },
                  properties: {}
                }]
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Voice assistant error:', e);
    } finally {
      setIsProcessingVoice(false);
    }
  };

  // Toggle Browser Web Speech Recognition
  const toggleSpeechRecognition = () => {
    if (isListening) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. You can click any of the voice prompt buttons below.');
      return;
    }

    try {
      const recognizer = new SpeechRecognition();
      recognizer.lang = 'en-IN'; // Indian English model
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 1;

      recognizer.onstart = () => {
        setIsListening(true);
      };

      recognizer.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);
        handleProcessVoiceQuery(transcript);
      };

      recognizer.onerror = () => {
        setIsListening(false);
      };

      recognizer.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognizer;
      recognizer.start();
    } catch {
      setIsListening(false);
    }
  };

  // Add Assistant Card POI as En-Route Stop
  const handleAddAssistantStop = () => {
    if (!assistantCard) return;

    setEnRouteStops(prev => [
      ...prev,
      { lat: assistantCard.lat, lng: assistantCard.lng, name: assistantCard.title }
    ]);

    // Clear card & highlight
    setAssistantCard(null);
    const map = mapInstanceRef.current;
    if (map && map.isStyleLoaded()) {
      const poiSrc = map.getSource('poi-highlight-source') as GeoJSONSource | undefined;
      if (poiSrc) {
        poiSrc.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // Explainable Stop Added Alert
    const stopAlert: RerouteExplanationData = {
      trigger_type: 'en_route_stop',
      explanation: `Added stop at ${assistantCard.title} (${assistantCard.detour_minutes}m detour). Route dynamically updated.`,
      spoken_announcement: `Added ${assistantCard.title} as a stop on your route.`,
      time_saved_min: 0,
      delay_avoided_min: 0,
      trigger_distance_m: assistantCard.detour_meters,
      timestamp: Date.now()
    };
    setRerouteAlert(stopAlert);
    speakUtterance(stopAlert.spoken_announcement);
  };

  // Submit New Landmark
  const handleSaveLandmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLandmarkForm.name.trim() || !newLandmarkForm.visual_cue.trim()) return;

    try {
      const resp = await fetch('http://127.0.0.1:8000/api/consumer/landmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLandmarkForm)
      });
      if (resp.ok) {
        setIsAddingLandmark(false);
        fetchLandmarks();
        setNewLandmarkForm({
          name: '',
          category: 'shop',
          visual_cue: '',
          description: '',
          lat: 17.445,
          lng: 78.385
        });
      }
    } catch {
      // offline error
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070B14] select-none">
      {/* 1. Full-Bleed Map Canvas */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full z-0"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
      />

      {/* 2. Top Banner: Explainable Rerouting (Factual Trigger + Seconds Saved) */}
      {rerouteAlert && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 anim-stagger-1">
          <div className="p-3.5 rounded-xl bg-slate-950/95 border border-amber-500/80 shadow-2xl contain-panel flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-950/80 border border-amber-500/50 text-amber-400 shrink-0">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-telemetry uppercase tracking-wider font-bold text-amber-400">
                  ⚡ Explainable Reroute Active
                </span>
                <button
                  onClick={() => setRerouteAlert(null)}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-xs font-display font-semibold text-slate-100 leading-snug">
                {rerouteAlert.explanation}
              </div>

              {rerouteAlert.time_saved_min > 0 && (
                <div className="flex items-center gap-3 mt-2 text-[10px] font-telemetry text-emerald-400">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800">
                    ⏱️ Saves ~{rerouteAlert.time_saved_min} mins
                  </span>
                  <span className="text-slate-400">
                    Avoids ~{rerouteAlert.delay_avoided_min}m delay
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Floating Left Column: Search & Turn-by-Turn Card */}
      <div className="absolute left-5 top-5 bottom-5 w-92 z-20 flex flex-col gap-3 pointer-events-none">
        {/* Card A: Destination Search & Vehicle Mode Picker */}
        <div className="pointer-events-auto p-4 rounded-xl glass-panel contain-panel flex flex-col gap-3 shadow-2xl border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-400" />
              <h2 className="text-xs font-display font-bold uppercase tracking-wider text-slate-200">
                Hyderabad Navigator
              </h2>
              {isLoadingRoute && (
                <span className="text-[9px] font-telemetry px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 animate-pulse">
                  Routing...
                </span>
              )}
            </div>

            {/* Audio Voice Guidance Toggle */}
            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                isAudioMuted
                  ? 'bg-slate-900 border-slate-700 text-slate-500'
                  : 'bg-blue-950/80 border-blue-600 text-blue-300'
              }`}
              title={isAudioMuted ? 'Unmute Voice Directions' : 'Mute Voice Directions'}
            >
              {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Origin & Destination Direct-Type Inputs */}
          <div ref={inputsContainerRef} className="relative flex flex-col gap-2">
            {/* Start Point Input Box */}
            <div className="relative">
              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/95 border transition-all ${
                startSearchFailed
                  ? 'border-rose-500/80 ring-1 ring-rose-500/30'
                  : !isStartConfirmed
                  ? 'border-amber-500/80 ring-1 ring-amber-500/30'
                  : showStartDropdown
                  ? 'border-emerald-500/80 ring-1 ring-emerald-500/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full ring-2 shrink-0 ${
                  startSearchFailed
                    ? 'bg-rose-500 ring-rose-500/20'
                    : !isStartConfirmed
                    ? 'bg-amber-400 ring-amber-400/20 animate-pulse'
                    : 'bg-emerald-400 ring-emerald-500/20'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <label htmlFor="start-point-input" className="text-[9px] font-telemetry text-slate-500 block uppercase tracking-wider">
                      Start Point
                    </label>
                    {!isStartConfirmed && (
                      <span className="text-[8.5px] font-telemetry text-amber-400 uppercase tracking-wider font-semibold">
                        Unconfirmed
                      </span>
                    )}
                  </div>
                  <input
                    id="start-point-input"
                    type="text"
                    value={startInputText}
                    onChange={(e) => handleStartInputChange(e.target.value)}
                    onFocus={() => {
                      setShowStartDropdown(true);
                      setShowDestDropdown(false);
                      if (startSuggestions.length === 0 && startInputText) {
                        searchLocations(startInputText, setStartSuggestions, setIsSearchingStart);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && startSuggestions.length > 0) {
                        handleSelectStart(startSuggestions[0]);
                      }
                    }}
                    placeholder="Search start point or landmark..."
                    className="w-full bg-transparent text-xs font-body text-slate-100 focus:outline-none"
                  />
                </div>

                {/* Right controls: Clear button & Geolocation button */}
                <div className="flex items-center gap-1 shrink-0">
                  {startInputText && (
                    <button
                      type="button"
                      onClick={() => {
                        setStartInputText('');
                        setStartSuggestions([]);
                      }}
                      className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                      title="Clear Start Point"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={isLocating}
                    className={`p-1.5 rounded-md border transition-all ${
                      isLocating
                        ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300 animate-pulse'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-600/50 hover:bg-slate-800'
                    }`}
                    title="Use Current Location (GPS)"
                  >
                    {isLocating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <Locate className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Unconfirmed / Failed Geocoding Explicit Status Alert */}
              {startSearchFailed ? (
                <div className="text-[10px] font-telemetry px-2.5 py-1 rounded bg-rose-950/80 border border-rose-800/60 text-rose-300 mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 truncate">
                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                    <span>No match found. Still using: <strong className="text-white">{origin.name}</strong></span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStartInputText(origin.name);
                      setShowStartDropdown(false);
                    }}
                    className="underline hover:text-white text-[9px] shrink-0 ml-1.5 cursor-pointer"
                    title="Revert to confirmed location"
                  >
                    Revert
                  </button>
                </div>
              ) : !isStartConfirmed && (
                <div className="text-[10px] font-telemetry px-2.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300 mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span>Unconfirmed — select from suggestions to route</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStartInputText(origin.name);
                      setShowStartDropdown(false);
                    }}
                    className="underline text-slate-400 hover:text-slate-200 text-[9px] shrink-0 ml-1.5"
                  >
                    Revert
                  </button>
                </div>
              )}

              {/* Start Suggestions Dropdown */}
              {showStartDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-950/98 backdrop-blur-xl border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden max-h-56 overflow-y-auto p-1 space-y-0.5">
                  {isSearchingStart && (
                    <div className="flex items-center gap-2 p-2 text-xs text-slate-400 font-telemetry">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Searching regional places...</span>
                    </div>
                  )}

                  {!isSearchingStart && startSuggestions.length === 0 && startInputText.trim().length > 1 && (
                    <div className="p-3 text-xs text-rose-400/90 font-body text-center">
                      No matching places found. Route remains locked to confirmed start point.
                    </div>
                  )}

                  {/* Seeded Landmarks Category Header */}
                  {startSuggestions.some(s => s.type === 'landmark' || s.type === 'hub') && (
                    <div className="px-2 py-0.5 text-[9px] font-telemetry uppercase tracking-wider text-amber-400 font-bold bg-amber-950/30 rounded border border-amber-800/30">
                      Verified Landmarks & Hubs
                    </div>
                  )}
                  {startSuggestions.filter(s => s.type === 'landmark' || s.type === 'hub').map((s, idx) => (
                    <div
                      key={`start-lm-${s.name}-${idx}`}
                      onClick={() => handleSelectStart(s)}
                      className="p-2 rounded-md hover:bg-emerald-950/50 cursor-pointer transition-colors group flex items-start gap-2.5"
                    >
                      <div className="p-1 rounded bg-slate-900 text-amber-400 mt-0.5 shrink-0 border border-slate-800 group-hover:border-amber-500/50">
                        <Flag className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-200 group-hover:text-emerald-300 truncate">
                            {s.name}
                          </span>
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 shrink-0 font-telemetry">
                            {s.type}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-body truncate mt-0.5">
                          {s.display_name}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* General OSM Places Category Header */}
                  {startSuggestions.some(s => s.type === 'osm' || s.type === 'place') && (
                    <div className="px-2 py-0.5 text-[9px] font-telemetry uppercase tracking-wider text-blue-400 font-bold bg-blue-950/30 rounded border border-blue-800/30 mt-1">
                      Addresses & Places (OSM Geocoder)
                    </div>
                  )}
                  {startSuggestions.filter(s => s.type === 'osm' || s.type === 'place').map((s, idx) => (
                    <div
                      key={`start-osm-${s.name}-${idx}`}
                      onClick={() => handleSelectStart(s)}
                      className="p-2 rounded-md hover:bg-emerald-950/50 cursor-pointer transition-colors group flex items-start gap-2.5"
                    >
                      <div className="p-1 rounded bg-slate-900 text-blue-400 mt-0.5 shrink-0 border border-slate-800 group-hover:border-blue-500/50">
                        <MapPin className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-200 group-hover:text-emerald-300 truncate">
                            {s.name}
                          </span>
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 shrink-0 font-telemetry">
                            {s.type}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-body truncate mt-0.5">
                          {s.display_name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Swap Button Divider */}
            <div className="relative flex items-center justify-center -my-1 z-10">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dashed border-slate-800/80" />
              </div>
              <button
                type="button"
                onClick={handleSwapEndpoints}
                className="relative p-1 rounded-full bg-slate-900 border border-slate-700/80 hover:border-blue-500/80 text-slate-400 hover:text-white hover:scale-105 transition-all shadow-md group"
                title="Swap Start Point and Destination"
              >
                <ArrowUpDown className="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-300" />
              </button>
            </div>

            {/* Destination Input Box */}
            <div className="relative">
              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/95 border transition-all ${
                destSearchFailed
                  ? 'border-rose-500/80 ring-1 ring-rose-500/30'
                  : !isDestConfirmed
                  ? 'border-amber-500/80 ring-1 ring-amber-500/30'
                  : showDestDropdown
                  ? 'border-rose-500/80 ring-1 ring-rose-500/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full ring-2 shrink-0 ${
                  destSearchFailed
                    ? 'bg-rose-500 ring-rose-500/20'
                    : !isDestConfirmed
                    ? 'bg-amber-400 ring-amber-400/20 animate-pulse'
                    : 'bg-rose-500 ring-rose-500/20'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <label htmlFor="destination-input" className="text-[9px] font-telemetry text-slate-500 block uppercase tracking-wider">
                      Destination
                    </label>
                    {!isDestConfirmed && (
                      <span className="text-[8.5px] font-telemetry text-amber-400 uppercase tracking-wider font-semibold">
                        Unconfirmed
                      </span>
                    )}
                  </div>
                  <input
                    id="destination-input"
                    type="text"
                    value={destInputText}
                    onChange={(e) => handleDestInputChange(e.target.value)}
                    onFocus={() => {
                      setShowDestDropdown(true);
                      setShowStartDropdown(false);
                      if (destSuggestions.length === 0 && destInputText) {
                        searchLocations(destInputText, setDestSuggestions, setIsSearchingDest);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && destSuggestions.length > 0) {
                        handleSelectDest(destSuggestions[0]);
                      }
                    }}
                    placeholder="Search destination, mall, IT park..."
                    className="w-full bg-transparent text-xs font-body text-slate-100 focus:outline-none"
                  />
                </div>

                {/* Right controls: Clear button & Search icon */}
                <div className="flex items-center gap-1 shrink-0">
                  {destInputText && (
                    <button
                      type="button"
                      onClick={() => {
                        setDestInputText('');
                        setDestSuggestions([]);
                      }}
                      className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                      title="Clear Destination"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}

                  <div className="p-1.5 text-slate-500">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Unconfirmed / Failed Geocoding Explicit Status Alert */}
              {destSearchFailed ? (
                <div className="text-[10px] font-telemetry px-2.5 py-1 rounded bg-rose-950/80 border border-rose-800/60 text-rose-300 mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 truncate">
                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                    <span>No match found. Still routed to: <strong className="text-white">{destination.name}</strong></span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDestInputText(destination.name);
                      setShowDestDropdown(false);
                    }}
                    className="underline hover:text-white text-[9px] shrink-0 ml-1.5 cursor-pointer"
                    title="Revert to confirmed location"
                  >
                    Revert
                  </button>
                </div>
              ) : !isDestConfirmed && (
                <div className="text-[10px] font-telemetry px-2.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300 mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span>Unconfirmed — select from suggestions to route</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDestInputText(destination.name);
                      setShowDestDropdown(false);
                    }}
                    className="underline text-slate-400 hover:text-slate-200 text-[9px] shrink-0 ml-1.5"
                  >
                    Revert
                  </button>
                </div>
              )}

              {/* Destination Suggestions Dropdown */}
              {showDestDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-950/98 backdrop-blur-xl border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden max-h-56 overflow-y-auto p-1 space-y-0.5">
                  {isSearchingDest && (
                    <div className="flex items-center gap-2 p-2 text-xs text-slate-400 font-telemetry">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                      <span>Searching regional places...</span>
                    </div>
                  )}

                  {!isSearchingDest && destSuggestions.length === 0 && destInputText.trim().length > 1 && (
                    <div className="p-3 text-xs text-rose-400/90 font-body text-center">
                      No matching places found. Route remains locked to confirmed destination.
                    </div>
                  )}

                  {/* Seeded Landmarks Category Header */}
                  {destSuggestions.some(s => s.type === 'landmark' || s.type === 'hub') && (
                    <div className="px-2 py-0.5 text-[9px] font-telemetry uppercase tracking-wider text-amber-400 font-bold bg-amber-950/30 rounded border border-amber-800/30">
                      Verified Landmarks & Hubs
                    </div>
                  )}
                  {destSuggestions.filter(s => s.type === 'landmark' || s.type === 'hub').map((s, idx) => (
                    <div
                      key={`dest-lm-${s.name}-${idx}`}
                      onClick={() => handleSelectDest(s)}
                      className="p-2 rounded-md hover:bg-rose-950/50 cursor-pointer transition-colors group flex items-start gap-2.5"
                    >
                      <div className="p-1 rounded bg-slate-900 text-amber-400 mt-0.5 shrink-0 border border-slate-800 group-hover:border-amber-500/50">
                        <Flag className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-200 group-hover:text-rose-300 truncate">
                            {s.name}
                          </span>
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 shrink-0 font-telemetry">
                            {s.type}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-body truncate mt-0.5">
                          {s.display_name}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* General OSM Places Category Header */}
                  {destSuggestions.some(s => s.type === 'osm' || s.type === 'place') && (
                    <div className="px-2 py-0.5 text-[9px] font-telemetry uppercase tracking-wider text-blue-400 font-bold bg-blue-950/30 rounded border border-blue-800/30 mt-1">
                      Addresses & Places (OSM Geocoder)
                    </div>
                  )}
                  {destSuggestions.filter(s => s.type === 'osm' || s.type === 'place').map((s, idx) => (
                    <div
                      key={`dest-osm-${s.name}-${idx}`}
                      onClick={() => handleSelectDest(s)}
                      className="p-2 rounded-md hover:bg-rose-950/50 cursor-pointer transition-colors group flex items-start gap-2.5"
                    >
                      <div className="p-1 rounded bg-slate-900 text-blue-400 mt-0.5 shrink-0 border border-slate-800 group-hover:border-blue-500/50">
                        <MapPin className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-200 group-hover:text-rose-300 truncate">
                            {s.name}
                          </span>
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 shrink-0 font-telemetry">
                            {s.type}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-body truncate mt-0.5">
                          {s.display_name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Geolocation toast / notice if applicable */}
            {locationNotice && (
              <div className="text-[11px] font-telemetry px-2.5 py-1 rounded bg-slate-900 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 animate-fade-in">
                <Check className="w-3 h-3 shrink-0" />
                <span className="truncate">{locationNotice}</span>
              </div>
            )}
          </div>

          {/* Presets Quick Chips */}
          <div className="space-y-1">
            <span className="text-[10px] font-display text-slate-400 font-semibold uppercase tracking-wider">
              Quick Hyderabad Hubs
            </span>
            <div className="flex flex-wrap gap-1.5">
              {HYDERABAD_PRESETS.slice(0, 4).map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setDestination({ lat: p.lat, lng: p.lng, name: p.name });
                    setDestInputText(p.name);
                  }}
                  className="px-2 py-1 rounded text-[10px] font-body bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all"
                >
                  {p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Vehicle Mode Selector */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
            <button
              onClick={() => setVehicleMode('car')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-display font-medium transition-all ${
                vehicleMode === 'car' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>Car</span>
            </button>

            <button
              onClick={() => setVehicleMode('bike')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-display font-medium transition-all ${
                vehicleMode === 'bike' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>Bike</span>
            </button>

            <button
              onClick={() => setVehicleMode('auto')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-display font-medium transition-all ${
                vehicleMode === 'auto' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Auto</span>
            </button>
          </div>
        </div>

        {/* Card B: Landmark-Enriched Turn-by-Turn Instruction Card */}
        {activeRoute && (
          <div className="pointer-events-auto p-4 rounded-xl glass-panel contain-panel border border-blue-500/40 shadow-2xl flex flex-col gap-3 anim-stagger-2">
            {/* Header: Next Maneuver Arrow + Distance */}
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-blue-600 text-white shrink-0 shadow-lg shadow-blue-600/30">
                <Navigation className="w-6 h-6 rotate-45" />
              </div>

              <div className="flex-1">
                <div className="text-[11px] font-telemetry uppercase tracking-wider text-blue-400 font-bold">
                  In {currentManeuver.distance_meters} meters
                </div>

                <div className="text-sm font-display font-bold text-white leading-snug mt-0.5">
                  {currentManeuver.instruction}
                </div>
              </div>
            </div>

            {/* Indian Visual Driver Cue (Enhances maneuver without echoing text) */}
            {currentManeuver.landmark && (
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-amber-500/40 flex items-start gap-2.5">
                <div className="p-1.5 rounded-md bg-amber-950/80 border border-amber-500/40 text-amber-400 shrink-0 mt-0.5 shadow-sm">
                  <Flag className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[10px] font-telemetry uppercase tracking-wider font-bold text-amber-400">
                      Visual Driver Cue
                    </span>
                    <span className="text-[9px] font-telemetry uppercase px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
                      {currentManeuver.landmark.category.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="font-body text-[11px] text-slate-200 leading-snug">
                    <span className="text-amber-300/90 font-medium">Look for: </span>
                    "{currentManeuver.landmark.visual_cue}"
                  </div>
                  <div className="text-[10px] font-telemetry text-slate-400 mt-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Target marker at turn junction</span>
                  </div>
                </div>
              </div>
            )}

            {/* Travel Summary Metrics */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs font-telemetry text-slate-300">
              <div>
                <span className="text-slate-500 uppercase text-[10px]">ETA: </span>
                <strong className="text-emerald-400 font-bold">{activeRoute.duration_min} mins</strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[10px]">Dist: </span>
                <strong className="text-slate-100 font-bold">{activeRoute.distance_km} km</strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[10px]">Stops: </span>
                <strong className="text-blue-400 font-bold">{enRouteStops.length}</strong>
              </div>
            </div>

            {/* Next Step / Maneuver Scroller Controls */}
            {activeRoute.maneuvers.length > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-[10px] font-telemetry text-slate-400">
                  Step {currentStepIndex + 1} of {activeRoute.maneuvers.length}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    disabled={currentStepIndex === 0}
                    onClick={() => setCurrentStepIndex(i => Math.max(0, i - 1))}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-slate-300 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={currentStepIndex >= activeRoute.maneuvers.length - 1}
                    onClick={() => setCurrentStepIndex(i => Math.min(activeRoute.maneuvers.length - 1, i + 1))}
                    className="px-2 py-1 rounded bg-blue-600 text-white text-xs font-semibold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Anchored Map Overlay Controls: Landmark Layer Toggle & Add Landmark */}
      <div className="absolute top-5 right-5 z-20 pointer-events-auto flex items-center gap-2">
        <button
          onClick={() => setShowLandmarkLayer(!showLandmarkLayer)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-display backdrop-blur-md shadow-2xl transition-all ${
            showLandmarkLayer
              ? 'bg-slate-900/95 text-white border-blue-500/70 shadow-blue-950/40 ring-1 ring-blue-500/30'
              : 'bg-slate-950/85 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title="Toggle Indian landmark markers on map"
        >
          <Layers className={`w-3.5 h-3.5 ${showLandmarkLayer ? 'text-blue-400' : 'text-slate-500'}`} />
          <span>Landmarks ({showLandmarkLayer ? landmarks.length : `${relevantLandmarksCount} on route`})</span>
          <span className={`w-1.5 h-1.5 rounded-full ${showLandmarkLayer ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
        </button>

        <button
          onClick={() => setIsAddingLandmark(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/25 hover:bg-blue-600/40 text-blue-300 border border-blue-500/50 text-xs font-display font-semibold backdrop-blur-md shadow-2xl transition-all active:scale-95"
          title="Crowdsource a new local Hyderabad landmark"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Landmark</span>
        </button>
      </div>

      {/* 5. Floating Top-Right: Conversational Voice Assistant */}
      <div className="absolute right-5 top-18 z-20 flex flex-col items-end gap-3 pointer-events-none w-96">
        {/* Voice Assistant Mic Button & Instant Query Chips */}
        <div className="pointer-events-auto p-3.5 rounded-xl glass-panel contain-panel border border-slate-800 shadow-2xl w-full flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-display font-bold text-slate-200 uppercase tracking-wider">
                Conversational Voice Assistant
              </span>
            </div>

            <button
              onClick={toggleSpeechRecognition}
              className={`p-2 rounded-full border transition-all ${
                isListening
                  ? 'bg-rose-600 border-rose-400 text-white animate-pulse shadow-lg shadow-rose-600/50 scale-105'
                  : 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/40'
              }`}
              title={isListening ? 'Listening... click to stop' : 'Click to Speak'}
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>

          {/* Spoken Query Display / Listening Wave */}
          {isListening && (
            <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Listening for Hyderabad voice command... speak now</span>
            </div>
          )}

          {isProcessingVoice && (
            <div className="text-[10px] font-telemetry text-emerald-400 animate-pulse flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800/50">
              <Sparkles className="w-3 h-3 text-emerald-400 animate-spin" />
              <span>Analyzing speech intent & corridor buffer...</span>
            </div>
          )}

          {voiceQueryText && !isListening && (
            <div className="text-[11px] font-body text-slate-400 italic">
              "{voiceQueryText}"
            </div>
          )}

          {assistantSpokenText && !isListening && (
            <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-[11px] font-body text-emerald-200 leading-relaxed">
              🗣️ {assistantSpokenText}
            </div>
          )}

          {/* Quick Real-World Voice Prompt Chips */}
          <div className="space-y-1">
            <span className="text-[10px] font-display text-slate-400 uppercase font-semibold">
              Try En-Route Queries
            </span>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => handleProcessVoiceQuery('Find me a petrol pump with a clean restroom on the way')}
                className="text-left px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white flex items-center justify-between group transition-all"
              >
                <span>⛽ "Petrol pump with clean restroom on the way"</span>
                <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
              </button>

              <button
                onClick={() => handleProcessVoiceQuery('Find an Irani chai stall on the route')}
                className="text-left px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white flex items-center justify-between group transition-all"
              >
                <span>☕ "Irani chai stall on the route"</span>
                <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
              </button>

              <button
                onClick={() => handleProcessVoiceQuery('Is there a pure vegetarian restaurant near Madhapur?')}
                className="text-left px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white flex items-center justify-between group transition-all"
              >
                <span>🥗 "Pure vegetarian restaurant near Madhapur"</span>
                <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
              </button>
            </div>
          </div>
        </div>

        {/* Assistant Action Card (e.g. En-Route POI with Clean Restroom + 1-Tap Add Stop) */}
        {assistantCard && (
          <div className="pointer-events-auto p-4 rounded-xl glass-panel contain-panel border border-emerald-500/60 shadow-2xl w-full flex flex-col gap-2.5 anim-stagger-1">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-telemetry uppercase tracking-wider text-emerald-400 font-bold">
                  {assistantCard.category}
                </span>
                <h3 className="text-sm font-display font-bold text-white leading-snug">
                  {assistantCard.title}
                </h3>
              </div>

              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-600/50 text-amber-300 text-xs font-bold font-telemetry">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{assistantCard.rating}</span>
              </div>
            </div>

            <div className="text-[11px] font-body text-slate-400 truncate">
              {assistantCard.address}
            </div>

            {/* Features/Amenities */}
            <div className="flex flex-wrap gap-1">
              {assistantCard.features.map(f => (
                <span
                  key={f}
                  className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 text-[9px] font-telemetry font-semibold"
                >
                  ✓ {f}
                </span>
              ))}
            </div>

            {/* Detour metrics & One-Tap Action */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-[11px] font-telemetry text-slate-300">
                Detour: <strong className="text-emerald-400">+{assistantCard.detour_minutes}m</strong> ({assistantCard.detour_meters}m)
              </span>

              <button
                onClick={handleAddAssistantStop}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-display text-xs font-bold shadow-md shadow-emerald-900/40 transition-all flex items-center gap-1 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add as Stop</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Collapsible Route Disruption Simulation & Debug Drawer */}
      <div className="absolute bottom-5 right-5 z-20 pointer-events-auto">
        {isSimulationDrawerOpen ? (
          <div className="p-3.5 rounded-xl glass-panel contain-panel border border-slate-700 shadow-2xl w-84 flex flex-col gap-2.5 anim-stagger-1">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-display font-bold text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Simulate Route Disruptions (AI)</span>
              </div>
              <button
                onClick={() => setIsSimulationDrawerOpen(false)}
                className="text-slate-400 hover:text-white p-0.5"
                title="Collapse drawer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] font-body text-slate-400 leading-snug">
              Trigger real-time incidents to test explainable dynamic rerouting:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => triggerExplainableReroute('accident')}
                className="px-2.5 py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900/80 border border-rose-600/60 text-[11px] font-display text-rose-200 flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Accident Ahead</span>
              </button>
              <button
                onClick={() => triggerExplainableReroute('waterlogging')}
                className="px-2.5 py-2 rounded-lg bg-blue-950/70 hover:bg-blue-900/80 border border-blue-600/60 text-[11px] font-display text-blue-200 flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md"
              >
                <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Waterlogging</span>
              </button>
            </div>
            {rerouteAlert && (
              <button
                onClick={() => {
                  setRerouteAlert(null);
                  calculateRoute();
                }}
                className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-telemetry text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition-all"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Reset to Standard Route</span>
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setIsSimulationDrawerOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass-panel contain-panel border border-slate-800 hover:border-slate-700 shadow-2xl text-xs font-display text-slate-300 hover:text-white transition-all group active:scale-95"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Simulate Disruptions</span>
            <span className="text-[9px] font-telemetry font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
              DEMO LAB
            </span>
          </button>
        )}
      </div>

      {/* 5. Selected Landmark Modal / Drawer */}
      {selectedLandmark && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-md px-4 anim-stagger-1">
          <div className="p-4 rounded-xl glass-panel contain-panel border border-blue-500/60 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-telemetry uppercase tracking-wider text-blue-400 font-bold">
                  {selectedLandmark.category}
                </span>
                <h3 className="text-base font-display font-bold text-white">
                  {selectedLandmark.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLandmark(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-2 p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
              <span className="text-[10px] font-telemetry text-amber-400 font-bold block uppercase">
                Visual Reference Cue
              </span>
              <span className="text-slate-200 font-body">"{selectedLandmark.visual_cue}"</span>
            </div>

            <p className="text-xs font-body text-slate-400 mt-2">
              {selectedLandmark.description}
            </p>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setDestination({
                    lat: selectedLandmark.lat,
                    lng: selectedLandmark.lng,
                    name: selectedLandmark.name
                  });
                  setSelectedLandmark(null);
                }}
                className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-display text-xs font-bold transition-all"
              >
                Navigate Here
              </button>

              <button
                onClick={() => {
                  setEnRouteStops(prev => [
                    ...prev,
                    { lat: selectedLandmark.lat, lng: selectedLandmark.lng, name: selectedLandmark.name }
                  ]);
                  setSelectedLandmark(null);
                }}
                className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-xs font-medium transition-all"
              >
                Add as Waypoint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Community Landmark Submission Modal */}
      {isAddingLandmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md p-5 rounded-2xl glass-panel contain-panel border border-slate-800 shadow-2xl anim-stagger-1">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-blue-400" />
                <h3 className="font-display font-bold text-sm text-white">
                  Add Local Hyderabad Landmark
                </h3>
              </div>
              <button onClick={() => setIsAddingLandmark(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLandmark} className="space-y-3">
              <div>
                <label className="text-[10px] font-telemetry uppercase text-slate-400 block mb-1">
                  Landmark Name (Shop, Temple, Gate, Junction)
                </label>
                <input
                  type="text"
                  required
                  value={newLandmarkForm.name}
                  onChange={e => setNewLandmarkForm({ ...newLandmarkForm, name: e.target.value })}
                  placeholder="e.g. Blue Gate Compound / Pista House"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-telemetry uppercase text-slate-400 block mb-1">
                  Category
                </label>
                <select
                  value={newLandmarkForm.category}
                  onChange={e => setNewLandmarkForm({ ...newLandmarkForm, category: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="tea_stall">Tea Stall / Irani Cafe</option>
                  <option value="gate">Gate / Compound</option>
                  <option value="temple">Temple / Place of Worship</option>
                  <option value="shop">Supermarket / Retail Shop</option>
                  <option value="junction">Junction / Roundabout</option>
                  <option value="food">Bakery / Restaurant</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-telemetry uppercase text-slate-400 block mb-1">
                  Visual Cue (What the driver sees)
                </label>
                <input
                  type="text"
                  required
                  value={newLandmarkForm.visual_cue}
                  onChange={e => setNewLandmarkForm({ ...newLandmarkForm, visual_cue: e.target.value })}
                  placeholder="e.g. Navy blue iron gate with yellow hazard stripes opposite Pillar 1222"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-telemetry uppercase text-slate-400 block mb-1">
                  Description & Context
                </label>
                <textarea
                  rows={2}
                  value={newLandmarkForm.description}
                  onChange={e => setNewLandmarkForm({ ...newLandmarkForm, description: e.target.value })}
                  placeholder="e.g. Prominent turn marker along Madhapur 100ft road corridor"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-telemetry uppercase text-slate-400 block mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newLandmarkForm.lat}
                    onChange={e => setNewLandmarkForm({ ...newLandmarkForm, lat: parseFloat(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-telemetry uppercase text-slate-400 block mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newLandmarkForm.lng}
                    onChange={e => setNewLandmarkForm({ ...newLandmarkForm, lng: parseFloat(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingLandmark(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-display text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-display text-xs font-bold"
                >
                  Save Landmark
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsumerNavigationView;
