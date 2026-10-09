import math
from typing import List, Dict, Any, Tuple, Optional
from ..models import Order, Vehicle, Point, OrderStatus, VehicleStatus


class PartialReOptimizer:
    """Provides rapid sub-second re-optimization for dynamic events:

    1. Live Order Insertion (inserts into lowest-cost vehicle route)
    2. Vehicle Breakdown Reassignment (re-allocates broken truck orders to nearest active fleet)
    """

    def insert_new_order(
        self,
        new_order: Order,
        vehicles: List[Vehicle],
        current_routes: Dict[str, List[Dict[str, Any]]],
        road_network
    ) -> Tuple[str, int]:
        """Finds the vehicle and stop index where inserting new_order incurs minimal additional distance."""
        active_vehicles = [v for v in vehicles if v.status != VehicleStatus.BROKEN]
        if not active_vehicles:
            return None, -1

        best_vehicle_id = None
        best_index = 0
        min_extra_dist = float("inf")

        order_loc = (new_order.location.x, new_order.location.y)

        for v in active_vehicles:
            # Check capacity
            if v.current_load + new_order.demand > v.capacity:
                continue

            stops = current_routes.get(v.id, [])
            # Route points: from current vehicle position -> stop 0 -> stop 1 ...
            route_points = [(v.position.x, v.position.y)] + [
                (s["location"]["x"], s["location"]["y"]) for s in stops
            ]

            for i in range(len(route_points)):
                # Cost of inserting after route_points[i]
                p_curr = route_points[i]
                p_next = route_points[i + 1] if i + 1 < len(route_points) else None

                if p_next is None:
                    # Append at end
                    extra_dist = math.dist(p_curr, order_loc)
                else:
                    orig_leg = math.dist(p_curr, p_next)
                    new_legs = math.dist(p_curr, order_loc) + math.dist(order_loc, p_next)
                    extra_dist = new_legs - orig_leg

                if extra_dist < min_extra_dist:
                    min_extra_dist = extra_dist
                    best_vehicle_id = v.id
                    best_index = i

        if best_vehicle_id is None:
            # Fallback to least loaded vehicle
            least_loaded = min(active_vehicles, key=lambda v: len(current_routes.get(v.id, [])))
            best_vehicle_id = least_loaded.id
            best_index = len(current_routes.get(best_vehicle_id, []))

        return best_vehicle_id, best_index

    def redistribute_broken_vehicle(
        self,
        broken_vehicle_id: str,
        vehicles: List[Vehicle],
        current_routes: Dict[str, List[Dict[str, Any]]],
        orders_map: Dict[str, Order]
    ) -> List[Tuple[str, str]]:
        """Redistributes remaining stops from the broken vehicle to the closest active vehicles.

        Returns list of (order_id, assigned_vehicle_id).
        """
        active_vehicles = [v for v in vehicles if v.id != broken_vehicle_id and v.status != VehicleStatus.BROKEN]
        if not active_vehicles:
            return []

        broken_stops = current_routes.get(broken_vehicle_id, [])
        reassignments = []

        for stop in broken_stops:
            order_id = stop["order_id"]
            order = orders_map.get(order_id)
            if not order or order.status == OrderStatus.DELIVERED:
                continue

            # Pick active vehicle whose current position or last stop is nearest
            best_v = None
            min_dist = float("inf")
            stop_loc = (stop["location"]["x"], stop["location"]["y"])

            for v in active_vehicles:
                v_stops = current_routes.get(v.id, [])
                ref_point = (v.position.x, v.position.y) if not v_stops else (v_stops[-1]["location"]["x"], v_stops[-1]["location"]["y"])
                d = math.dist(ref_point, stop_loc)
                if d < min_dist:
                    min_dist = d
                    best_v = v

            if best_v:
                reassignments.append((order_id, best_v.id))
                # Add to routes for subsequent calculation
                current_routes[best_v.id].append(stop)

        current_routes[broken_vehicle_id] = []
        return reassignments
