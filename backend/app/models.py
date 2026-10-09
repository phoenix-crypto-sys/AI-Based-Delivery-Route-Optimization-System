from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple
from enum import Enum
import time


class OrderStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    DELAYED = "delayed"


class VehicleStatus(str, Enum):
    IDLE = "idle"
    EN_ROUTE = "en_route"
    OFFLINE = "offline"
    SIGNAL_LOST = "signal_lost"
    BROKEN = "broken"  # in sim
    RETURNING = "returning"


class VehicleMode(str, Enum):
    SIM = "sim"
    LIVE = "live"


class Point(BaseModel):
    x: float = 0.0
    y: float = 0.0
    lat: Optional[float] = None
    lon: Optional[float] = None


class Order(BaseModel):
    id: str
    customer_name: str = "Customer"
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    location: Point = Field(default_factory=Point)
    demand: int = Field(default=1, description="Weight/Packages count")
    time_window_start: int = Field(default=0, description="Start minute of delivery window")
    time_window_end: int = Field(default=480, description="End minute of delivery window")
    service_time: int = Field(default=5, description="Minutes needed at stop")
    status: OrderStatus = OrderStatus.PENDING
    assigned_vehicle_id: Optional[str] = None
    priority: str = Field(default="normal", description="low, normal, high, urgent")
    created_at_tick: int = 0
    delivered_at_tick: Optional[int] = None
    notes: Optional[str] = None


class Vehicle(BaseModel):
    id: str
    name: str
    label: Optional[str] = None
    color: str = "#3B82F6"  # Curated family: #5EEAD4, #A78BFA, #FBBF24, #FB7185, #3B82F6
    capacity: int = 20
    current_load: int = 0
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    last_ping_at: Optional[float] = None
    position: Point = Field(default_factory=Point)
    heading: float = 0.0  # angle in degrees 0-360
    speed_kmh: float = 40.0
    status: VehicleStatus = VehicleStatus.IDLE
    mode: VehicleMode = VehicleMode.SIM
    route_points: List[Point] = []
    completed_points: List[Point] = []
    current_target_index: int = 0
    assigned_order_ids: List[str] = []
    completed_order_ids: List[str] = []
    distance_traveled_km: float = 0.0
    co2_emitted_kg: float = 0.0
    battery_level: float = 100.0  # Percentage


class Route(BaseModel):
    id: str
    vehicle_id: str
    ordered_stops: List[Dict[str, Any]] = []
    total_distance: float = 0.0  # km
    total_duration: float = 0.0  # minutes
    created_at: float = Field(default_factory=time.time)
    superseded_by: Optional[str] = None
    geometry_geojson: Optional[Dict[str, Any]] = None  # GeoJSON LineString coordinates
    maneuvers: List[Dict[str, Any]] = []  # Step-by-step turn maneuvers for driver


class TrafficSegment(BaseModel):
    id: str
    road_ref: str
    congestion_level: float = Field(default=0.0, ge=0.0, le=1.0)
    source: str = "procedural"  # "procedural" or "live_api"
    updated_at: float = Field(default_factory=time.time)
    speed_multiplier: float = 1.0  # e.g. 1.0 = normal, 2.0 = 2x travel time
    coordinates: Optional[List[List[float]]] = None


class TrafficZone(BaseModel):
    id: str
    center: Point
    radius: float = 50.0  # units in simulation space
    severity: float = 2.0  # travel time slowdown multiplier (e.g. 2.0 = 2x slower)
    name: str = "Congestion Zone"
    active: bool = True
    pulse: float = 0.0


class SimulationMetrics(BaseModel):
    total_distance_km: float = 0.0
    naive_distance_km: float = 0.0
    distance_saved_percent: float = 0.0
    on_time_rate_percent: float = 100.0
    co2_saved_kg: float = 0.0
    fuel_used_liters: float = 0.0
    active_deliveries: int = 0
    completed_deliveries: int = 0
    solver_execution_time_ms: float = 0.0
    active_fleet_count: int = 4
    total_fleet_count: int = 4


class SimulationState(BaseModel):
    tick: int = 0
    sim_time_str: str = "08:00:00 AM"
    is_paused: bool = False
    speed_multiplier: float = 1.0
    depot: Point
    vehicles: List[Vehicle]
    orders: List[Order]
    traffic_zones: List[TrafficZone]
    road_edges: List[Dict[str, Any]] = []
    metrics: SimulationMetrics
    last_event: Optional[str] = None
    reroute_nonce: int = 0  # incremented on re-optimization to trigger frontend redraw animation


class LiveOperationsState(BaseModel):
    vehicles: List[Vehicle]
    orders: List[Order]
    routes: List[Route]
    traffic_segments: List[TrafficSegment]
    depot: Dict[str, Any]
    metrics: Dict[str, Any]
    last_event: Optional[str] = None
    updated_at: float = Field(default_factory=time.time)


class OptimizationRequest(BaseModel):
    fastest_weight: float = Field(default=0.34, ge=0.0, le=1.0)
    cheapest_weight: float = Field(default=0.33, ge=0.0, le=1.0)
    greenest_weight: float = Field(default=0.33, ge=0.0, le=1.0)
    traffic_aware: bool = True
    active_vehicle_ids: Optional[List[str]] = None


class BrainData(BaseModel):
    decision_nodes: List[Dict[str, Any]]
    decision_links: List[Dict[str, Any]]
    cost_matrix: List[List[float]]
    node_labels: List[str]
    convergence_history: List[Dict[str, Any]]
    iterations_run: int
    best_objective_value: float
