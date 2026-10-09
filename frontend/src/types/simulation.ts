export type OrderStatus = 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'delayed';
export type VehicleStatus = 'idle' | 'en_route' | 'broken' | 'returning';

export interface Point {
  x: number;
  y: number;
  lat?: number;
  lon?: number;
}

export interface Order {
  id: string;
  customer_name: string;
  location: Point;
  demand: number;
  time_window_start: number;
  time_window_end: number;
  service_time: number;
  status: OrderStatus;
  assigned_vehicle_id?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at_tick: number;
  delivered_at_tick?: number;
}

export interface Vehicle {
  id: string;
  name: string;
  color: string;
  capacity: number;
  current_load: number;
  position: Point;
  heading: number; // 0-360 degrees
  speed_kmh: number;
  status: VehicleStatus;
  route_points: Point[];
  completed_points: Point[];
  current_target_index: number;
  assigned_order_ids: string[];
  completed_order_ids: string[];
  distance_traveled_km: number;
  co2_emitted_kg: number;
  battery_level: number;
}

export interface TrafficZone {
  id: string;
  center: Point;
  radius: number;
  severity: number;
  name: string;
  active: boolean;
  pulse: number;
}

export interface SimulationMetrics {
  total_distance_km: number;
  naive_distance_km: number;
  distance_saved_percent: number;
  on_time_rate_percent: number;
  co2_saved_kg: number;
  fuel_used_liters: number;
  active_deliveries: number;
  completed_deliveries: number;
  solver_execution_time_ms: number;
  active_fleet_count: number;
  total_fleet_count: number;
}

export interface RoadEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  is_major: boolean;
  road_type: string;
  congestion: number;
}

export interface SimulationState {
  tick: number;
  sim_time_str: string;
  is_paused: boolean;
  speed_multiplier: number;
  depot: Point;
  vehicles: Vehicle[];
  orders: Order[];
  traffic_zones: TrafficZone[];
  road_edges?: RoadEdge[];
  metrics: SimulationMetrics;
  last_event: string | null;
  reroute_nonce: number;
}

export interface BrainData {
  decision_nodes: any[];
  decision_links: any[];
  cost_matrix: number[][];
  node_labels: string[];
  convergence_history: {
    iteration: number;
    temperature: number;
    cost: number;
    best_cost: number;
  }[];
  iterations_run: number;
  best_objective_value: number;
}
