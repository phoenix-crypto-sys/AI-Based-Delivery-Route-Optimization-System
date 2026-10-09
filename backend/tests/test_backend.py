import pytest
from backend.app.models import Point, Order, Vehicle, OptimizationRequest, OrderStatus, VehicleStatus
from backend.app.simulation.road_network import RoadNetwork
from backend.app.simulation.engine import SimulationEngine
from backend.app.optimizer.vrp_solver import VRPSolver


def test_road_network():
    rn = RoadNetwork(width=500, height=400, grid_step=100)
    p1 = Point(x=50, y=50)
    p2 = Point(x=350, y=250)
    path = rn.get_shortest_path_points(p1, p2)
    assert len(path) >= 2
    dist_mat, dur_mat = rn.compute_distance_matrix([p1, p2])
    assert len(dist_mat) == 2
    assert dist_mat[0][1] > 0


def test_vrp_solver():
    solver = VRPSolver()
    depot = Point(x=500.0, y=400.0)
    vehicles = [
        Vehicle(id="V1", name="Alpha", color="#00F0FF", capacity=15, position=depot),
        Vehicle(id="V2", name="Beta", color="#FF2FD0", capacity=15, position=depot)
    ]
    orders = [
        Order(id="O1", customer_name="Cust 1", location=Point(x=300, y=200), demand=2),
        Order(id="O2", customer_name="Cust 2", location=Point(x=700, y=300), demand=3),
    ]
    dist_mat = [[0, 5, 6], [5, 0, 7], [6, 7, 0]]
    dur_mat = [[0, 10, 12], [10, 0, 14], [12, 14, 0]]

    res = solver.solve(depot, orders, vehicles, dist_mat, dur_mat, OptimizationRequest())
    assert res["success"] is True
    assert "V1" in res["routes"]
    assert "V2" in res["routes"]


def test_simulation_engine_flow():
    engine = SimulationEngine()
    initial_orders = len(engine.orders)
    assert initial_orders >= 5

    # Test tick progress
    engine.update_tick()
    assert engine.tick == 1
    assert engine.sim_seconds > 0

    # Test dynamic order addition
    new_ord = engine.add_order_dynamically(x=450.0, y=350.0, demand=2)
    assert len(engine.orders) == initial_orders + 1
    assert new_ord.id in [o.id for o in engine.orders]

    # Test vehicle breakdown
    v_id = engine.vehicles[0].id
    is_broken = engine.toggle_vehicle_breakdown(v_id)
    assert is_broken is True
    assert engine.vehicles[0].status == VehicleStatus.BROKEN

    # Test brain data generation
    brain = engine.get_brain_data()
    assert len(brain.decision_nodes) > 0
    assert len(brain.convergence_history) > 0


def test_live_operations_manager():
    from backend.app.live.manager import LiveOperationsManager
    from backend.app.models import VehicleStatus

    mgr = LiveOperationsManager()
    state = mgr.get_state()
    assert len(state["vehicles"]) == 4
    assert len(state["orders"]) >= 8
    assert len(state["traffic_segments"]) >= 4
    assert state["depot"]["lat"] == 17.4483
    assert state["depot"]["lng"] == 78.3808

    # Test real GPS ping around Hyderabad
    res = mgr.process_gps_ping("TRK-LIVE-01", 17.4490, 78.3810, heading=180.0, speed_kmh=35.0)
    assert res is not None
    assert res.current_lat == 17.4490
    assert res.status in [VehicleStatus.EN_ROUTE, VehicleStatus.IDLE]

    # Test manual vehicle failover & route redistribution
    is_offline = mgr.toggle_vehicle_failover("TRK-LIVE-02")
    assert is_offline is True
    veh2 = next(v for v in mgr.vehicles if v.id == "TRK-LIVE-02")
    assert veh2.status == VehicleStatus.OFFLINE
    # Restore
    is_offline_after = mgr.toggle_vehicle_failover("TRK-LIVE-02")
    assert is_offline_after is False

    # Test order intake and delivery
    new_order = mgr.add_order("Cyber Towers Hub", "Madhapur, Hyderabad", 17.4502, 78.3812, demand=2)
    assert new_order.id in [o.id for o in mgr.orders]

    delivered = mgr.mark_delivered(new_order.id, "TRK-LIVE-01")
    assert delivered is True
    ord_obj = next(o for o in mgr.orders if o.id == new_order.id)
    assert ord_obj.status.value == "delivered"

    # Test Live Mode Brain Data generation
    brain = mgr.get_brain_data()
    assert len(brain.decision_nodes) > 0
    assert len(brain.convergence_history) > 0
    assert len(brain.cost_matrix) > 0

    # Test Multi-objective weight optimization
    mgr.optimize_routes(fastest_weight=0.6, cheapest_weight=0.2, greenest_weight=0.2)
    assert mgr.current_weights["fastest"] == 0.6




