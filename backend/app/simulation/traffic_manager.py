import math
import random
import time
from typing import List, Optional, Tuple, Dict, Any
from ..models import TrafficZone, Point


class TrafficManager:
    def __init__(self):
        # Default preset congestion zones around central avenues
        self.zones: List[TrafficZone] = [
            TrafficZone(
                id="TZ-CORE-1",
                center=Point(x=420.0, y=360.0),
                radius=110.0,
                severity=2.6,
                name="Downtown Core Arterial",
                active=True,
                pulse=0.0
            ),
            TrafficZone(
                id="TZ-HIGHWAY-2",
                center=Point(x=700.0, y=550.0),
                radius=90.0,
                severity=2.1,
                name="East Midtown Expressway",
                active=True,
                pulse=0.0
            ),
            TrafficZone(
                id="TZ-COMMERCE-3",
                center=Point(x=250.0, y=600.0),
                radius=95.0,
                severity=1.8,
                name="Industrial District Corridor",
                active=False,
                pulse=0.0
            )
        ]
        self.active_incidents: List[Dict[str, Any]] = []
        self.last_incident_check = 0

    def get_time_of_day_multiplier(self, sim_seconds_elapsed: int) -> float:
        """Computes time-of-day rush hour multiplier from 08:00 AM start time."""
        # 0 seconds = 08:00 AM. 1 hour = 3600 sim seconds
        hour_of_day = 8.0 + (sim_seconds_elapsed / 3600.0) % 24.0

        # Morning Rush: 8:00 AM - 10:00 AM
        if 8.0 <= hour_of_day <= 10.0:
            progress = (hour_of_day - 8.0) / 2.0
            peak = math.sin(progress * math.pi)
            return 1.6 + 0.9 * peak  # Peaks at 2.5x
        # Evening Rush: 5:00 PM (17:00) - 7:00 PM (19:00)
        elif 17.0 <= hour_of_day <= 19.0:
            progress = (hour_of_day - 17.0) / 2.0
            peak = math.sin(progress * math.pi)
            return 1.7 + 0.9 * peak  # Peaks at 2.6x
        # Midday Lull: 11:00 AM - 3:00 PM
        elif 11.0 <= hour_of_day <= 15.0:
            return 1.2
        # Late Night / Early Morning
        elif hour_of_day >= 22.0 or hour_of_day < 6.0:
            return 1.0
        else:
            return 1.35

    def update_tick(self, tick: int, sim_seconds_elapsed: int) -> Optional[str]:
        """Dynamic traffic fluctuation: pulses radius, evaluates rush hour, and manages incidents."""
        rush_multiplier = self.get_time_of_day_multiplier(sim_seconds_elapsed)
        event_message = None

        # Clean expired incidents
        self.active_incidents = [
            inc for inc in self.active_incidents
            if inc["expires_at_sec"] > sim_seconds_elapsed
        ]

        # Check random incident injection periodically (every ~180 sim seconds)
        if sim_seconds_elapsed - self.last_incident_check > 180 and len(self.active_incidents) < 2:
            self.last_incident_check = sim_seconds_elapsed
            if random.random() < 0.45:
                # Spawn a temporary incident
                rx = random.uniform(200, 800)
                ry = random.uniform(200, 700)
                inc_id = f"INC-{random.randint(100, 999)}"
                duration = random.randint(60, 120)
                self.active_incidents.append({
                    "id": inc_id,
                    "x": rx,
                    "y": ry,
                    "radius": random.uniform(70, 95),
                    "severity": random.uniform(3.0, 4.2),
                    "name": f"Road Closure/Accident #{inc_id}",
                    "expires_at_sec": sim_seconds_elapsed + duration
                })
                event_message = f"🚨 Traffic Incident Reported: Temporary blockage near [{int(rx)}, {int(ry)}]"

        # Update zone parameters
        for i, zone in enumerate(self.zones):
            if not zone.active:
                continue
            # Directional slow pulse for visualization
            zone.pulse = (math.sin(tick * 0.08 + i * 1.5) + 1.0) / 2.0
            base_severity = 2.0 if i == 0 else 1.8
            zone.severity = round(base_severity * rush_multiplier, 2)

        return event_message

    def get_slowdown_at(self, x: float, y: float) -> float:
        """Returns the highest slowdown multiplier at coordinate (x, y). Default 1.0."""
        max_multiplier = 1.0

        for zone in self.zones:
            if not zone.active:
                continue
            dist = math.hypot(x - zone.center.x, y - zone.center.y)
            if dist < zone.radius:
                # Smooth quadratic falloff towards edge
                factor = 1.0 - (dist / zone.radius)
                effective_severity = 1.0 + (zone.severity - 1.0) * factor
                if effective_severity > max_multiplier:
                    max_multiplier = effective_severity

        for inc in self.active_incidents:
            dist = math.hypot(x - inc["x"], y - inc["y"])
            if dist < inc["radius"]:
                factor = 1.0 - (dist / inc["radius"])
                effective_severity = 1.0 + (inc["severity"] - 1.0) * factor
                if effective_severity > max_multiplier:
                    max_multiplier = effective_severity

        return max_multiplier

    def toggle_zone(self, zone_id: str) -> bool:
        for z in self.zones:
            if z.id == zone_id:
                z.active = not z.active
                return z.active
        return False

    def trigger_surge(self) -> str:
        """Manually spikes downtown traffic surge for interactive demo."""
        for z in self.zones:
            z.active = True
            z.severity = 3.5
        return "Surge triggered: Downtown core congestion spiked to 3.5x."
