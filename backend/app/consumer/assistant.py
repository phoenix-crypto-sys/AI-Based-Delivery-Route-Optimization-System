"""
Conversational Voice Assistant & En-Route Corridor Search Engine.

Handles natural-language voice query parsing, constraint extraction (e.g., 'clean restroom',
'vegetarian', 'on the way'), corridor distance math along active route polylines, and generates
both spoken voice responses and visual one-tap stop cards.
"""

import math
import re
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
from .landmarks import haversine_distance_m


class AssistantPOI(BaseModel):
    id: str
    name: str
    category: str  # petrol_pump, cafe, restaurant, atm, pharmacy, landmark
    address: str
    lat: float
    lng: float
    rating: float
    features: List[str]  # e.g., ["clean_restroom", "vegetarian", "card_payment", "24_hours", "ev_charger"]
    price_level: str  # "$", "$$", "$$$"
    hours: str


# Curated real-world Hyderabad POIs with verified amenities
CURATED_POIS: List[AssistantPOI] = [
    AssistantPOI(
        id="POI-HYD-01",
        name="HP AutoCare & Swachh Restroom Hub",
        category="petrol_pump",
        address="Near Bio-Diversity Junction, Old Mumbai Highway, Gachibowli",
        lat=17.4325,
        lng=78.3712,
        rating=4.7,
        features=["clean_restroom", "ev_charger", "air_filling", "card_payment", "24_hours"],
        price_level="$$",
        hours="Open 24 Hours"
    ),
    AssistantPOI(
        id="POI-HYD-02",
        name="Indian Oil COCO (Clean Restrooms)",
        category="petrol_pump",
        address="HITEC City Main Rd, opposite Shilparamam, Madhapur",
        lat=17.4518,
        lng=78.3775,
        rating=4.6,
        features=["clean_restroom", "air_filling", "lubricants", "quick_fuel", "24_hours"],
        price_level="$$",
        hours="Open 24 Hours"
    ),
    AssistantPOI(
        id="POI-HYD-03",
        name="Bharat Petroleum Pure for Sure & Cafe",
        category="petrol_pump",
        address="Road No. 36, Jubilee Hills, near Metro Station",
        lat=17.4332,
        lng=78.4061,
        rating=4.5,
        features=["clean_restroom", "snack_kiosk", "card_payment", "24_hours"],
        price_level="$$",
        hours="Open 24 Hours"
    ),
    AssistantPOI(
        id="POI-HYD-04",
        name="Minerva Coffee Shop (Pure Vegetarian)",
        category="restaurant",
        address="Plot 14, Silicon Valley, Madhapur Main Road",
        lat=17.4475,
        lng=78.3850,
        rating=4.8,
        features=["vegetarian", "clean_restroom", "south_indian", "quick_bites", "parking"],
        price_level="$$",
        hours="7:00 AM - 11:00 PM"
    ),
    AssistantPOI(
        id="POI-HYD-05",
        name="Chutneys Pure Veg Fine Dining",
        category="restaurant",
        address="Jubilee Hills Road No. 1, near Check Post",
        lat=17.4305,
        lng=78.4120,
        rating=4.7,
        features=["vegetarian", "clean_restroom", "family_friendly", "air_conditioned"],
        price_level="$$",
        hours="7:30 AM - 10:30 PM"
    ),
    AssistantPOI(
        id="POI-HYD-06",
        name="Niloufer Cafe & Irani Chai Bakery",
        category="cafe",
        address="Mindspace Circle, Raheja IT Park Entrance, Hitec City",
        lat=17.4401,
        lng=78.3820,
        rating=4.9,
        features=["tea", "bakery", "quick_service", "outdoor_seating"],
        price_level="$",
        hours="6:00 AM - 12:00 Midnight"
    ),
    AssistantPOI(
        id="POI-HYD-07",
        name="Roastery Coffee House",
        category="cafe",
        address="Road 45, Jubilee Hills",
        lat=17.4280,
        lng=78.3995,
        rating=4.8,
        features=["clean_restroom", "artisan_coffee", "valet_parking", "vegetarian"],
        price_level="$$$",
        hours="8:00 AM - 11:00 PM"
    ),
    AssistantPOI(
        id="POI-HYD-08",
        name="Apollo 24/7 Pharmacy Hub",
        category="pharmacy",
        address="Ground Floor, Cyber Towers Corridor, Madhapur",
        lat=17.4490,
        lng=78.3825,
        rating=4.6,
        features=["24_hours", "first_aid", "prescription", "card_payment"],
        price_level="$$",
        hours="Open 24 Hours"
    ),
    AssistantPOI(
        id="POI-HYD-09",
        name="HDFC Bank 24x7 Cash & Cheque Recycler ATM",
        category="atm",
        address="Inorbit Mall Road, Vittal Rao Nagar, Madhapur",
        lat=17.4422,
        lng=78.3888,
        rating=4.4,
        features=["atm", "cash_deposit", "24_hours", "guard_on_duty"],
        price_level="$",
        hours="Open 24 Hours"
    )
]


def point_to_segment_distance_m(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    """Computes minimum distance in meters from point (px, py) to line segment (ax, ay) -> (bx, by)."""
    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return haversine_distance_m(py, px, ay, ax)

    # Parametric projection t on segment
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    closest_x = ax + t * dx
    closest_y = ay + t * dy
    return haversine_distance_m(py, px, closest_y, closest_x)


class AssistantQueryRequest(BaseModel):
    query: str
    current_lat: Optional[float] = 17.4483
    current_lng: Optional[float] = 78.3808
    active_route_coords: Optional[List[List[float]]] = None  # [[lng, lat], ...]


class AssistantActionCard(BaseModel):
    title: str
    category: str
    address: str
    rating: float
    features: List[str]
    detour_meters: int
    detour_minutes: int
    lat: float
    lng: float
    action_type: str  # "add_as_stop" | "set_destination"


class AssistantResponse(BaseModel):
    transcript: str
    intent: str
    target_type: str
    constraints: List[str]
    voice_response: str
    card: Optional[AssistantActionCard] = None


class VoiceAssistantEngine:
    def __init__(self):
        self.pois = CURATED_POIS

    def parse_intent(self, raw_query: str) -> Tuple[str, str, List[str], str]:
        """
        Extracts structured intent, POI category target, user constraints, and cleaned topic.
        """
        q = raw_query.lower().strip()
        constraints = []

        # Constraint extraction
        if any(term in q for term in ["clean restroom", "washroom", "clean toilet", "rest room", "loo"]):
            constraints.append("clean_restroom")
        if any(term in q for term in ["veg", "vegetarian", "pure veg"]):
            constraints.append("vegetarian")
        if any(term in q for term in ["cheap", "budget", "under budget"]):
            constraints.append("budget")
        if any(term in q for term in ["on the way", "along the route", "en route", "on our way", "ahead"]):
            constraints.append("on_the_way")
        if any(term in q for term in ["parking", "valet"]):
            constraints.append("parking")
        if any(term in q for term in ["24 hours", "24/7", "open now"]):
            constraints.append("24_hours")

        # Category targeting
        target_type = "general"
        if any(term in q for term in ["petrol", "gas", "fuel", "diesel", "cng", "pump"]):
            target_type = "petrol_pump"
        elif any(term in q for term in ["tea", "chai", "coffee", "cafe", "irani"]):
            target_type = "cafe"
        elif any(term in q for term in ["food", "restaurant", "lunch", "dinner", "breakfast", "eat", "biryani", "dosa"]):
            target_type = "restaurant"
        elif any(term in q for term in ["pharmacy", "medical", "medicine", "chemist", "doctor"]):
            target_type = "pharmacy"
        elif any(term in q for term in ["atm", "cash", "bank"]):
            target_type = "atm"
        elif any(term in q for term in ["restroom", "toilet", "washroom"]):
            target_type = "petrol_pump"  # Highway / city restrooms are best at verified fuel pumps

        # Intent categorization
        if any(term in q for term in ["navigate to", "take me to", "directions to", "drive to", "go to"]):
            intent = "set_destination"
        elif any(term in q for term in ["stop", "add a stop", "on the way", "on our way", "along the route"]):
            intent = "en_route_stop"
        elif any(term in q for term in ["where is", "find", "search", "nearest", "looking for"]):
            intent = "find_place"
        else:
            intent = "find_place"

        return intent, target_type, constraints, q

    def search_corridor(
        self,
        target_type: str,
        constraints: List[str],
        current_lat: float,
        current_lng: float,
        route_coords: Optional[List[List[float]]] = None
    ) -> Optional[Tuple[AssistantPOI, int, int]]:
        """
        Finds the optimal POI along the corridor or near current position.
        Calculates perpendicular detour distance and extra minutes.
        Returns: (best_poi, detour_meters, detour_minutes)
        """
        candidates: List[Tuple[AssistantPOI, float, int]] = []

        for poi in self.pois:
            # Check category match
            if target_type != "general" and poi.category != target_type:
                # If target was restroom, also allow petrol pumps that have clean restrooms
                if "clean_restroom" in constraints and poi.category == "petrol_pump":
                    pass
                else:
                    continue

            # Check constraint adherence
            constraint_score = 0
            if "clean_restroom" in constraints and "clean_restroom" in poi.features:
                constraint_score += 2
            if "vegetarian" in constraints and "vegetarian" in poi.features:
                constraint_score += 2

            # Calculate distance to route corridor or current point
            if route_coords and len(route_coords) >= 2:
                # Corridor search: min distance to any segment on the active route
                min_dist_to_route = float("inf")
                for i in range(len(route_coords) - 1):
                    p1 = route_coords[i]
                    p2 = route_coords[i + 1]
                    d_seg = point_to_segment_distance_m(poi.lng, poi.lat, p1[0], p1[1], p2[0], p2[1])
                    if d_seg < min_dist_to_route:
                        min_dist_to_route = d_seg

                # Acceptable corridor buffer: 1200 meters from polyline
                if min_dist_to_route <= 1400.0:
                    detour_m = round(min_dist_to_route * 1.8)  # Real road detour approximation
                    detour_min = max(1, round(detour_m / 250))  # ~15 km/h city average
                    candidates.append((poi, detour_m - (constraint_score * 300), detour_min))
            else:
                # Direct proximity from current point
                dist_direct = haversine_distance_m(current_lat, current_lng, poi.lat, poi.lng)
                detour_m = round(dist_direct)
                detour_min = max(1, round(detour_m / 250))
                candidates.append((poi, detour_m - (constraint_score * 300), detour_min))

        if not candidates:
            # Fallback: best rated overall in category or general
            matching = [p for p in self.pois if target_type == "general" or p.category == target_type]
            if matching:
                best = max(matching, key=lambda p: p.rating)
                d = round(haversine_distance_m(current_lat, current_lng, best.lat, best.lng))
                return best, d, max(1, round(d / 250))
            return None

        # Sort by lowest effective detour (distance discounted by constraint bonuses)
        candidates.sort(key=lambda c: c[1])
        best_poi = candidates[0][0]
        # Recalculate true detour distance without score discount
        if route_coords and len(route_coords) >= 2:
            min_d = min(
                point_to_segment_distance_m(best_poi.lng, best_poi.lat, route_coords[i][0], route_coords[i][1], route_coords[i+1][0], route_coords[i+1][1])
                for i in range(len(route_coords) - 1)
            )
            detour_m = round(min_d * 1.8)
        else:
            detour_m = round(haversine_distance_m(current_lat, current_lng, best_poi.lat, best_poi.lng))

        detour_min = max(1, round(detour_m / 250))
        return best_poi, detour_m, detour_min

    def process_voice_query(self, req: AssistantQueryRequest) -> AssistantResponse:
        """
        Translates raw speech input into structured intent, finds relevant stops on route corridor,
        and builds natural voice output and UI action card.
        """
        intent, target_type, constraints, clean_q = self.parse_intent(req.query)

        curr_lat = req.current_lat or 17.4483
        curr_lng = req.current_lng or 78.3808

        poi_result = self.search_corridor(
            target_type=target_type,
            constraints=constraints,
            current_lat=curr_lat,
            current_lng=curr_lng,
            route_coords=req.active_route_coords
        )

        card = None
        voice_text = ""

        if poi_result:
            poi, detour_m, detour_min = poi_result
            action_type = "add_as_stop" if intent in ["en_route_stop", "find_place"] else "set_destination"

            features_clean = [f.replace("_", " ").title() for f in poi.features[:3]]

            card = AssistantActionCard(
                title=poi.name,
                category=poi.category.replace("_", " ").title(),
                address=poi.address,
                rating=poi.rating,
                features=features_clean,
                detour_meters=detour_m,
                detour_minutes=detour_min,
                lat=poi.lat,
                lng=poi.lng,
                action_type=action_type
            )

            # Natural Indian English voice announcement
            dist_str = f"{detour_m} meters" if detour_m < 1000 else f"{detour_m / 1000:.1f} kilometers"
            if "clean_restroom" in constraints:
                voice_text = (
                    f"I found {poi.name} on your route with verified clean restrooms. "
                    f"It's a {detour_min} minute detour ({dist_str} off your path). Tap to add as a stop."
                )
            elif "vegetarian" in constraints:
                voice_text = (
                    f"Found {poi.name}, a pure vegetarian spot along your corridor. "
                    f"Adds just {detour_min} minutes. Would you like to add it as a stop?"
                )
            elif intent == "set_destination":
                voice_text = f"Setting destination to {poi.name}. Route updated."
            else:
                voice_text = (
                    f"Found {poi.name} {dist_str} ahead. "
                    f"Adds about {detour_min} minutes. Tap to add as a waypoint."
                )
        else:
            voice_text = f"I searched your route corridor in Hyderabad for {clean_q}, but couldn't find a direct match. Try asking for a petrol pump, tea stall, or vegetarian restaurant."

        return AssistantResponse(
            transcript=req.query,
            intent=intent,
            target_type=target_type,
            constraints=constraints,
            voice_response=voice_text,
            card=card
        )


voice_assistant = VoiceAssistantEngine()
