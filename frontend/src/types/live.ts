export type LiveVehicleStatus = 'idle' | 'en_route' | 'offline' | 'signal_lost';
export type LiveOrderStatus = 'pending' | 'assigned' | 'en_route' | 'delivered';

export interface ManeuverStep {
  instruction: string;
  type?: string;
  modifier?: string;
  distance_meters: number;
  duration_seconds: number;
  street_name?: string;
  location: [number, number]; // [lng, lat]
}

export interface LiveVehicle {
  id: string;
  name: string;
  label?: string;
  color: string;
  capacity: number;
  current_load: number;
  current_lat?: number | null;
  current_lng?: number | null;
  last_ping_at?: number | null;
  heading: number;
  speed_kmh: number;
  status: LiveVehicleStatus;
  mode: 'live';
  assigned_order_ids: string[];
  completed_order_ids: string[];
  distance_traveled_km: number;
  battery_level: number;
}

export interface LiveOrder {
  id: string;
  customer_name: string;
  address?: string;
  lat: number;
  lng: number;
  demand: number;
  time_window_start: number; // minutes from 08:00
  time_window_end: number;
  service_time: number;
  status: LiveOrderStatus;
  assigned_vehicle_id?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  delivered_at?: number;
  notes?: string;
}

export interface LiveRoute {
  id: string;
  vehicle_id: string;
  ordered_stops: {
    order_id: string;
    customer_name: string;
    address?: string;
    lat: number;
    lng: number;
    arrival_time_min?: number;
  }[];
  total_distance: number; // km
  total_duration: number; // minutes
  created_at: number;
  superseded_by?: string | null;
  geometry_geojson?: {
    type: 'LineString';
    coordinates: [number, number][]; // [lng, lat]
  };
  maneuvers: ManeuverStep[];
}

export interface LiveTrafficSegment {
  id: string;
  road_ref: string;
  congestion_level: number; // 0.0 (clear) - 1.0 (severe)
  source: 'procedural' | 'live_api';
  updated_at: number;
  speed_multiplier: number;
  coordinates?: [number, number][]; // [lat, lng]
}

export interface LiveOperationsState {
  vehicles: LiveVehicle[];
  orders: LiveOrder[];
  routes: LiveRoute[];
  traffic_segments: LiveTrafficSegment[];
  depot: {
    name?: string;
    address: string;
    lat: number;
    lng: number;
  };
  metrics: {
    total_distance_km: number;
    naive_distance_km: number;
    distance_saved_percent: number;
    on_time_rate_percent: number;
    co2_saved_kg: number;
    fuel_used_liters?: number;
    active_deliveries: number;
    completed_deliveries: number;
    solver_execution_time_ms: number;
    active_fleet_count: number;
    total_fleet_count: number;
    last_traffic_sync_at?: number;
  };
  events?: {
    timestamp: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'alert';
  }[];
  history?: {
    timestamp: string;
    event: string;
    progress_percent: number;
    active_fleet: number;
  }[];
  objective_weights?: {
    fastest: number;
    cheapest: number;
    greenest: number;
  };
  last_event?: string | null;
  updated_at: number;
}
