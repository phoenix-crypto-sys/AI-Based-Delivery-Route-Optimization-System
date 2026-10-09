"""
Explainable Rerouting Engine for Consumer Navigation.

Computes the exact 'why' behind route changes and generates factual, specific natural-language
explanations tied to real triggers (traffic spikes, accidents, waterlogging, or detours),
preventing generic 'finding a better route' messages.
"""

import time
from typing import Dict, Any, Optional
from pydantic import BaseModel


class RerouteTrigger(BaseModel):
    trigger_type: str  # "accident", "traffic_surge", "road_closure", "waterlogging", "en_route_stop", "faster_path"
    location_name: str
    distance_ahead_m: int
    delay_added_sec: int
    time_saved_sec: int
    alternative_corridor: str
    custom_note: Optional[str] = None


class RerouteExplanation(BaseModel):
    trigger_type: str
    explanation: str
    spoken_announcement: str
    time_saved_min: int
    delay_avoided_min: int
    trigger_distance_m: int
    timestamp: float


class ExplainableReroutingEngine:
    def __init__(self):
        self.last_explanation: Optional[RerouteExplanation] = None

    def generate_explanation(self, trigger: RerouteTrigger) -> RerouteExplanation:
        """
        Synthesizes a short, punchy, factual natural-language explanation
        and speech utterance based on the specific incident and saved time.
        """
        saved_min = max(1, round(trigger.time_saved_sec / 60))
        delay_min = max(2, round(trigger.delay_added_sec / 60))
        dist_desc = f"{trigger.distance_ahead_m}m ahead" if trigger.distance_ahead_m < 1000 else f"{trigger.distance_ahead_m / 1000:.1f}km ahead"

        if trigger.trigger_type == "accident":
            explanation = f"Rerouting — accident reported {dist_desc} on {trigger.location_name}; taking {trigger.alternative_corridor} saves {saved_min} minutes."
            spoken = f"Rerouting. Accident reported {dist_desc}. Taking {trigger.alternative_corridor} saves {saved_min} minutes."
        elif trigger.trigger_type == "waterlogging":
            explanation = f"Rerouting — monsoon waterlogging detected {dist_desc} near {trigger.location_name}; detour via {trigger.alternative_corridor} saves {saved_min} minutes."
            spoken = f"Rerouting due to waterlogging ahead. Bypassing via {trigger.alternative_corridor} to save {saved_min} minutes."
        elif trigger.trigger_type == "traffic_surge":
            explanation = f"Rerouting — sudden congestion spike (+{delay_min}m) on {trigger.location_name}; switching to {trigger.alternative_corridor} saves {saved_min} minutes."
            spoken = f"Heavy traffic detected on {trigger.location_name}. Rerouting via {trigger.alternative_corridor}, saving {saved_min} minutes."
        elif trigger.trigger_type == "road_closure":
            explanation = f"Rerouting — road barricaded for VIP convoy near {trigger.location_name}; diverted via {trigger.alternative_corridor} (saves {saved_min}m)."
            spoken = f"Road closed ahead at {trigger.location_name}. Diverting via {trigger.alternative_corridor}."
        elif trigger.trigger_type == "en_route_stop":
            explanation = f"Stop added — {trigger.location_name} included along route; adds {max(1, round(trigger.delay_added_sec/60))} min detour."
            spoken = f"Added stop at {trigger.location_name}. Resuming route with a minor detour."
        else:
            explanation = f"Rerouting — faster arterial corridor found via {trigger.alternative_corridor}; saves about {saved_min} minutes."
            spoken = f"Found a faster route via {trigger.alternative_corridor}, saving {saved_min} minutes."

        exp = RerouteExplanation(
            trigger_type=trigger.trigger_type,
            explanation=explanation,
            spoken_announcement=spoken,
            time_saved_min=saved_min,
            delay_avoided_min=delay_min,
            trigger_distance_m=trigger.distance_ahead_m,
            timestamp=time.time()
        )
        self.last_explanation = exp
        return exp


reroute_engine = ExplainableReroutingEngine()
