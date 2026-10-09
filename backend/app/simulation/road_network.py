import math
import networkx as nx
from typing import List, Tuple, Dict, Any, Optional
from ..models import Point


class RoadNetwork:
    def __init__(self, width: float = 1000.0, height: float = 800.0, grid_step: float = 100.0):
        self.width = width
        self.height = height
        self.grid_step = grid_step
        self.graph = nx.Graph()
        self._build_network()

    def _build_network(self):
        """Constructs an authentic Manhattan-style urban grid with major avenues and cross streets."""
        x_steps = int(self.width / self.grid_step) + 1
        y_steps = int(self.height / self.grid_step) + 1

        # Real urban blocks: clean orthogonal coordinate axes
        for i in range(x_steps):
            for j in range(y_steps):
                node_id = f"N_{i}_{j}"
                pos_x = i * self.grid_step
                pos_y = j * self.grid_step
                is_avenue = (i % 2 == 0)
                is_cross_street = (j % 2 == 0)

                self.graph.add_node(
                    node_id,
                    pos=(pos_x, pos_y),
                    x=pos_x,
                    y=pos_y,
                    is_major=(is_avenue or is_cross_street)
                )

        # Connect horizontal cross streets and vertical avenues
        for i in range(x_steps):
            for j in range(y_steps):
                curr = f"N_{i}_{j}"
                curr_pos = self.graph.nodes[curr]["pos"]

                if i < x_steps - 1:
                    right = f"N_{i+1}_{j}"
                    dist = math.dist(curr_pos, self.graph.nodes[right]["pos"])
                    is_major = (j % 2 == 0)
                    speed_limit = 50.0 if is_major else 35.0
                    self.graph.add_edge(
                        curr, right,
                        weight=dist,
                        length=dist,
                        speed_limit=speed_limit,
                        is_major=is_major,
                        road_type="cross_street"
                    )

                if j < y_steps - 1:
                    bottom = f"N_{i}_{j+1}"
                    dist = math.dist(curr_pos, self.graph.nodes[bottom]["pos"])
                    is_major = (i % 2 == 0)
                    speed_limit = 60.0 if is_major else 35.0
                    self.graph.add_edge(
                        curr, bottom,
                        weight=dist,
                        length=dist,
                        speed_limit=speed_limit,
                        is_major=is_major,
                        road_type="avenue"
                    )

    def find_nearest_node(self, p: Point) -> str:
        """Find the nearest graph intersection node for any arbitrary coordinate."""
        best_node = None
        min_dist = float("inf")
        target = (p.x, p.y)
        for node, data in self.graph.nodes(data=True):
            d = math.dist(target, data["pos"])
            if d < min_dist:
                min_dist = d
                best_node = node
        return best_node

    def get_network_edges(self, traffic_zones: List[Any] = None) -> List[Dict[str, Any]]:
        """Returns structured road network segments with real-time congestion scores."""
        edges_data = []
        for u, v, data in self.graph.edges(data=True):
            u_pos = self.graph.nodes[u]["pos"]
            v_pos = self.graph.nodes[v]["pos"]
            mid_x = (u_pos[0] + v_pos[0]) / 2.0
            mid_y = (u_pos[1] + v_pos[1]) / 2.0

            congestion = 1.0
            if traffic_zones:
                for tz in traffic_zones:
                    if getattr(tz, "active", True):
                        d = math.dist((mid_x, mid_y), (tz.center.x, tz.center.y))
                        if d < tz.radius:
                            proximity = 1.0 - (d / tz.radius)
                            congestion = max(congestion, 1.0 + (tz.severity - 1.0) * proximity)

            edges_data.append({
                "x1": u_pos[0],
                "y1": u_pos[1],
                "x2": v_pos[0],
                "y2": v_pos[1],
                "is_major": data.get("is_major", False),
                "road_type": data.get("road_type", "avenue"),
                "congestion": round(congestion, 2)
            })
        return edges_data

    def get_shortest_path_points(self, start: Point, end: Point, traffic_zones: List[Any] = None) -> List[Point]:
        """Calculates smooth path coordinates along the road network between two points."""
        start_node = self.find_nearest_node(start)
        end_node = self.find_nearest_node(end)

        if start_node == end_node:
            return [start, end]

        # Weight function dynamically factoring in distance and traffic zones
        def edge_weight(u, v, d):
            base_dist = d.get("length", 1.0)
            u_pos = self.graph.nodes[u]["pos"]
            v_pos = self.graph.nodes[v]["pos"]
            mid_x = (u_pos[0] + v_pos[0]) / 2.0
            mid_y = (u_pos[1] + v_pos[1]) / 2.0

            multiplier = 1.0
            if traffic_zones:
                for tz in traffic_zones:
                    if getattr(tz, "active", True):
                        dist_to_zone = math.dist((mid_x, mid_y), (tz.center.x, tz.center.y))
                        if dist_to_zone < tz.radius:
                            # Higher penalty inside the zone
                            severity = getattr(tz, "severity", 2.0)
                            proximity = 1.0 - (dist_to_zone / tz.radius)
                            multiplier += (severity - 1.0) * proximity

            return base_dist * multiplier

        try:
            node_path = nx.astar_path(self.graph, start_node, end_node, weight=edge_weight)
            points = [start]
            for n in node_path:
                node_data = self.graph.nodes[n]
                points.append(Point(x=node_data["x"], y=node_data["y"]))
            points.append(end)
            return points
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return [start, end]

    def compute_distance_matrix(self, locations: List[Point], traffic_zones: List[Any] = None) -> Tuple[List[List[float]], List[List[float]]]:
        """Computes distance matrix (km) and travel duration matrix (minutes) across a list of points."""
        n = len(locations)
        dist_matrix = [[0.0] * n for _ in range(n)]
        duration_matrix = [[0.0] * n for _ in range(n)]

        # Map each location to nearest network node
        nodes = [self.find_nearest_node(loc) for loc in locations]

        for i in range(n):
            for j in range(n):
                if i == j:
                    dist_matrix[i][j] = 0.0
                    duration_matrix[i][j] = 0.0
                else:
                    path_points = self.get_shortest_path_points(locations[i], locations[j], traffic_zones)
                    # Compute path length in pixels -> convert to km (100 px = 1 km)
                    path_px = 0.0
                    for k in range(len(path_points) - 1):
                        p1, p2 = path_points[k], path_points[k + 1]
                        path_px += math.dist((p1.x, p1.y), (p2.x, p2.y))

                    dist_km = path_px / 100.0  # 100 px virtual = 1.0 km

                    # Estimate duration based on average urban speed 40km/h with congestion check
                    speed = 40.0
                    mid_x = (locations[i].x + locations[j].x) / 2.0
                    mid_y = (locations[i].y + locations[j].y) / 2.0
                    if traffic_zones:
                        for tz in traffic_zones:
                            if getattr(tz, "active", True):
                                if math.dist((mid_x, mid_y), (tz.center.x, tz.center.y)) < tz.radius:
                                    speed /= tz.severity

                    duration_minutes = (dist_km / max(speed, 5.0)) * 60.0
                    dist_matrix[i][j] = round(dist_km, 2)
                    duration_matrix[i][j] = round(duration_minutes, 2)

        return dist_matrix, duration_matrix
