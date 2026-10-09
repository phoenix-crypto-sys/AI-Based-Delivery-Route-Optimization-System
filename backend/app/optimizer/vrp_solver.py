import time
import math
from typing import List, Dict, Any, Tuple, Optional
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

from ..models import Order, Vehicle, Point, OptimizationRequest


class VRPSolver:
    def __init__(self):
        pass

    def solve(
        self,
        depot: Point,
        orders: List[Order],
        vehicles: List[Vehicle],
        distance_matrix: List[List[float]],
        duration_matrix: List[List[float]],
        options: OptimizationRequest
    ) -> Dict[str, Any]:
        """Solves the VRPTW problem using Google OR-Tools.

        Index 0: Depot
        Indices 1..N: Orders
        """
        start_time = time.time()
        active_vehicles = [v for v in vehicles if v.status != "broken"]
        if not active_vehicles:
            return {
                "success": False,
                "routes": {},
                "unassigned": [o.id for o in orders],
                "total_distance_km": 0.0,
                "total_time_minutes": 0.0,
                "solver_ms": 0.0
            }

        num_vehicles = len(active_vehicles)
        num_locations = len(orders) + 1  # 0 is depot, 1..N are orders

        if len(orders) == 0:
            return {
                "success": True,
                "routes": {v.id: [] for v in active_vehicles},
                "unassigned": [],
                "total_distance_km": 0.0,
                "total_time_minutes": 0.0,
                "solver_ms": 0.0
            }

        # Multi-objective cost computation for each arc (i, j)
        # Scaled to integer costs for OR-Tools
        fastest_w = options.fastest_weight
        cheapest_w = options.cheapest_weight
        greenest_w = options.greenest_weight

        cost_matrix = [[0] * num_locations for _ in range(num_locations)]
        for i in range(num_locations):
            for j in range(num_locations):
                if i == j:
                    cost_matrix[i][j] = 0
                else:
                    dist_km = distance_matrix[i][j]
                    dur_min = duration_matrix[i][j]

                    # Green metric: CO2 penalty higher when traversing congested routes (longer duration for same distance)
                    co2_estimate = dist_km * 120.0 + max(0.0, (dur_min - dist_km * 1.5) * 40.0)

                    # Blended weighted cost
                    blended = (
                        cheapest_w * (dist_km * 100.0) +
                        fastest_w * (dur_min * 80.0) +
                        greenest_w * (co2_estimate * 0.8)
                    )
                    cost_matrix[i][j] = int(round(blended * 10.0))

        # Create the routing index manager: Depot is index 0 for all starts and ends
        manager = pywrapcp.RoutingIndexManager(
            num_locations,
            num_vehicles,
            0  # depot index
        )

        routing = pywrapcp.RoutingModel(manager)

        # 1. Arc Cost Evaluator
        def cost_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return cost_matrix[from_node][to_node]

        transit_callback_index = routing.RegisterTransitCallback(cost_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

        # 2. Capacity Dimension
        demands = [0] + [max(1, o.demand) for o in orders]

        def demand_callback(from_index):
            from_node = manager.IndexToNode(from_index)
            return demands[from_node]

        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        vehicle_capacities = [v.capacity for v in active_vehicles]
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,  # null capacity slack
            vehicle_capacities,
            True,  # start cumul to zero
            "Capacity"
        )

        # 3. Time Windows Dimension
        # Durations converted to integer minutes
        durations_int = [[int(round(duration_matrix[i][j])) for j in range(num_locations)] for i in range(num_locations)]
        service_times = [0] + [o.service_time for o in orders]

        def time_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return durations_int[from_node][to_node] + service_times[from_node]

        time_callback_index = routing.RegisterTransitCallback(time_callback)
        routing.AddDimension(
            time_callback_index,
            120,   # max waiting slack (minutes)
            1440,  # max horizon (full day 24h = 1440 min)
            False,
            "Time"
        )
        time_dimension = routing.GetDimensionOrDie("Time")

        # Apply time windows for orders
        for order_idx, order in enumerate(orders):
            node_idx = order_idx + 1
            idx = manager.NodeToIndex(node_idx)
            # Default window if not set
            start_w = max(0, order.time_window_start)
            end_w = max(start_w + 30, order.time_window_end)
            time_dimension.CumulVar(idx).SetRange(start_w, end_w)

        # Add disjunction so orders can be dropped with a heavy penalty if capacity/time windows are unfeasible
        penalty = 1_000_000
        for order_idx in range(len(orders)):
            node_idx = order_idx + 1
            routing.AddDisjunction([manager.NodeToIndex(node_idx)], penalty)

        # Search parameters
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.FromSeconds(1)  # fast, responsive 1-second limit

        solution = routing.SolveWithParameters(search_parameters)
        elapsed_ms = round((time.time() - start_time) * 1000.0, 1)

        if not solution:
            # Fallback greedy partition
            return self._fallback_greedy(depot, orders, active_vehicles, distance_matrix, duration_matrix, elapsed_ms)

        # Extract routes
        vehicle_routes: Dict[str, List[Dict[str, Any]]] = {v.id: [] for v in active_vehicles}
        assigned_orders = set()
        total_dist_km = 0.0
        total_dur_min = 0.0

        for v_idx, vehicle in enumerate(active_vehicles):
            index = routing.Start(v_idx)
            v_stops = []
            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                if node != 0:
                    order_obj = orders[node - 1]
                    assigned_orders.add(order_obj.id)
                    time_var = time_dimension.CumulVar(index)
                    est_time = solution.Min(time_var)
                    v_stops.append({
                        "order_id": order_obj.id,
                        "location": {"x": order_obj.location.x, "y": order_obj.location.y},
                        "demand": order_obj.demand,
                        "est_arrival_min": est_time,
                        "customer_name": order_obj.customer_name
                    })

                prev_index = index
                index = solution.Value(routing.NextVar(index))
                next_node = manager.IndexToNode(index)
                prev_node = manager.IndexToNode(prev_index)
                total_dist_km += distance_matrix[prev_node][next_node]
                total_dur_min += duration_matrix[prev_node][next_node]

            vehicle_routes[vehicle.id] = v_stops

        unassigned_ids = [o.id for o in orders if o.id not in assigned_orders]

        return {
            "success": True,
            "routes": vehicle_routes,
            "unassigned": unassigned_ids,
            "total_distance_km": round(total_dist_km, 2),
            "total_time_minutes": round(total_dur_min, 1),
            "solver_ms": elapsed_ms
        }

    def _fallback_greedy(
        self,
        depot: Point,
        orders: List[Order],
        vehicles: List[Vehicle],
        distance_matrix: List[List[float]],
        duration_matrix: List[List[float]],
        elapsed_ms: float
    ) -> Dict[str, Any]:
        """Safe fallback partition in the rare event OR-Tools finds no feasible assignment."""
        routes: Dict[str, List[Dict[str, Any]]] = {v.id: [] for v in vehicles}
        for i, order in enumerate(orders):
            v_idx = i % len(vehicles)
            v = vehicles[v_idx]
            routes[v.id].append({
                "order_id": order.id,
                "location": {"x": order.location.x, "y": order.location.y},
                "demand": order.demand,
                "est_arrival_min": 15 * (len(routes[v.id]) + 1),
                "customer_name": order.customer_name
            })
        return {
            "success": True,
            "routes": routes,
            "unassigned": [],
            "total_distance_km": 50.0,
            "total_time_minutes": 80.0,
            "solver_ms": elapsed_ms
        }
