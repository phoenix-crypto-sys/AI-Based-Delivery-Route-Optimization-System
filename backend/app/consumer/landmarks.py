"""
Hyderabad Landmark Knowledge Base for Landmark-Based Navigation.

In Indian cities, drivers and citizens navigate by visible, memorable reference points:
prominent chai stalls, colorful gates, temples, flyover pillars, and brand hoardings,
not just street names. This module seeds and manages local Hyderabad landmarks and provides
proximity-based instruction blending on top of OSRM turn maneuvers.
"""

import math
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class Landmark(BaseModel):
    id: str
    name: str
    category: str  # temple, shop, tea_stall, gate, junction, transit, food
    visual_cue: str  # e.g., "Bright yellow hoarding", "Blue painted compound gate"
    description: str
    lat: float
    lng: float
    tags: List[str] = []
    is_user_submitted: bool = False


# Seed database of verified Hyderabad local landmarks across major corridors:
# HITEC City, Madhapur, Jubilee Hills, Banjara Hills, Gachibowli, Kondapur, Durgam Cheruvu
SEED_LANDMARKS: List[Landmark] = [
    Landmark(
        id="LM-HYD-01",
        name="Karachi Bakery & Tea Kiosk",
        category="tea_stall",
        visual_cue="Iconic blue & white signboard with steaming Irani chai samovar",
        description="Famous landmark right before Cyber Towers junction. High footfall tea stall.",
        lat=17.4504,
        lng=78.3811,
        tags=["tea", "bakery", "meeting_point", "landmark"]
    ),
    Landmark(
        id="LM-HYD-02",
        name="The Blue Iron Gate Compound",
        category="gate",
        visual_cue="Large navy blue double iron gate with yellow caution stripes",
        description="Prominent landmark opposite Metro Pillar 1222 on Madhapur Main Road.",
        lat=17.4478,
        lng=78.3885,
        tags=["gate", "waypoint", "turn_reference"]
    ),
    Landmark(
        id="LM-HYD-03",
        name="Ratnadeep Supermarket (Green Facade)",
        category="shop",
        visual_cue="Glowing emerald green neon facade and wide glass sliding entrance",
        description="Major retail landmark opposite Mindspace Gate 2 near Inorbit Mall link road.",
        lat=17.4392,
        lng=78.3802,
        tags=["grocery", "parking", "landmark"]
    ),
    Landmark(
        id="LM-HYD-04",
        name="Sri Venkateshwara Swamy Temple",
        category="temple",
        visual_cue="Golden tiered Gopuram tower with saffron flags and brass bells",
        description="Spiritual and traffic junction anchor near Jubilee Hills Check Post.",
        lat=17.4318,
        lng=78.4072,
        tags=["temple", "junction", "landmark"]
    ),
    Landmark(
        id="LM-HYD-05",
        name="Pista House Haleem & Bakery",
        category="food",
        visual_cue="Crimson red canopy with glowing Arabic script & large tandoor ovens",
        description="Key landmark right at the Gachibowli flyover exit ramp.",
        lat=17.4412,
        lng=78.3585,
        tags=["food", "bakery", "landmark"]
    ),
    Landmark(
        id="LM-HYD-06",
        name="Cyber Towers Central Fountain Roundabout",
        category="junction",
        visual_cue="High circular terracotta tower with glass dome and multi-tier fountain",
        description="The architectural epicenter of Hyderabad's IT corridor.",
        lat=17.4507,
        lng=78.3809,
        tags=["junction", "roundabout", "landmark"]
    ),
    Landmark(
        id="LM-HYD-07",
        name="Chai Point & Irani Chai Point (Yellow Stall)",
        category="tea_stall",
        visual_cue="Bright mustard-yellow shipping container stall with wooden benches",
        description="Near Durgam Cheruvu Cable Bridge entrance; crowded waypoint.",
        lat=17.4354,
        lng=78.3879,
        tags=["tea", "cafe", "bridge_entry"]
    ),
    Landmark(
        id="LM-HYD-08",
        name="Apollo 24/7 Pharmacy & MedPlus",
        category="shop",
        visual_cue="Twin illuminated bright green medical crosses and 24hr LED display",
        description="Situated at Madhapur 100 Feet Road Y-junction.",
        lat=17.4445,
        lng=78.3932,
        tags=["pharmacy", "medical", "junction"]
    ),
    Landmark(
        id="LM-HYD-09",
        name="Metro Pillar 1218 (Yellow Striped Base)",
        category="transit",
        visual_cue="Concrete elevated metro pillar with high-vis yellow and black hazard bands",
        description="Official U-turn spot under Hitec City Metro Station.",
        lat=17.4491,
        lng=78.3789,
        tags=["metro", "pillar", "u_turn"]
    ),
    Landmark(
        id="LM-HYD-10",
        name="Indian Oil Petrol Pump & Auto Gas",
        category="shop",
        visual_cue="Orange and blue canopy with digital price totem and air tower",
        description="Fuel station with clean 24hr public restrooms on Gachibowli-Miyapur road.",
        lat=17.4612,
        lng=78.3695,
        tags=["petrol", "restroom", "fuel", "air"]
    ),
    Landmark(
        id="LM-HYD-11",
        name="HP AutoCare & Swachh Restroom Hub",
        category="shop",
        visual_cue="Bright blue HP canopy with green Swachh Bharat restroom certified seal",
        description="Popular highway fuel station with verified clean restrooms and EV fast chargers.",
        lat=17.4265,
        lng=78.3721,
        tags=["petrol", "clean_restroom", "ev_charger", "fuel"]
    ),
    Landmark(
        id="LM-HYD-12",
        name="Shilparamam Crafts Village Arch",
        category="gate",
        visual_cue="Huge terracotta ethnic arched gateway with carved clay figurines",
        description="Opposite Cyber Towers back gate; clear visual waypoint for U-turns.",
        lat=17.4526,
        lng=78.3768,
        tags=["arch", "gate", "tourist", "waypoint"]
    ),
]


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in meters."""
    r = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) *
         math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


class LandmarkRepository:
    def __init__(self):
        self._landmarks: Dict[str, Landmark] = {lm.id: lm for lm in SEED_LANDMARKS}

    def list_all(self) -> List[Landmark]:
        return list(self._landmarks.values())

    def get_by_id(self, lm_id: str) -> Optional[Landmark]:
        return self._landmarks.get(lm_id)

    def add_landmark(
        self,
        name: str,
        category: str,
        visual_cue: str,
        description: str,
        lat: float,
        lng: float,
        tags: Optional[List[str]] = None
    ) -> Landmark:
        lm_id = f"LM-USER-{len(self._landmarks) + 1:03d}"
        lm = Landmark(
            id=lm_id,
            name=name,
            category=category,
            visual_cue=visual_cue,
            description=description,
            lat=lat,
            lng=lng,
            tags=tags or [],
            is_user_submitted=True
        )
        self._landmarks[lm_id] = lm
        return lm

    def find_nearest_landmark(self, lat: float, lng: float, max_radius_m: float = 350.0) -> Optional[Dict[str, Any]]:
        """Finds the closest landmark to a given location within max_radius_m."""
        best_lm = None
        best_dist = float("inf")

        for lm in self._landmarks.values():
            d = haversine_distance_m(lat, lng, lm.lat, lm.lng)
            if d < best_dist and d <= max_radius_m:
                best_dist = d
                best_lm = lm

        if best_lm:
            return {
                "landmark": best_lm.model_dump(),
                "distance_m": round(best_dist)
            }
        return None

    def blend_landmarks_into_maneuvers(self, maneuvers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Enhances raw OSRM/routing maneuvers with intuitive Indian-style landmark references.
        Transforms:
            'Turn left onto Madhapur Main Rd'
        Into:
            'Turn left after the Blue Iron Gate near Metro Pillar 1222 onto Madhapur Main Rd'
        """
        enriched_maneuvers = []

        for idx, step in enumerate(maneuvers):
            step_copy = dict(step)
            loc = step.get("location", [0, 0])
            # OSRM location is [lng, lat]
            step_lng = loc[0] if len(loc) > 0 else 0
            step_lat = loc[1] if len(loc) > 1 else 0

            nearest = self.find_nearest_landmark(step_lat, step_lng, max_radius_m=320.0)
            if nearest:
                lm = nearest["landmark"]
                dist = nearest["distance_m"]
                step_type = step.get("type", "turn")
                step_mod = step.get("modifier", "")
                st_name = step.get("street_name") or "Main Road"

                # Indian phrasing based on distance and maneuver
                if step_type == "arrive":
                    landmark_text = f"Destination is right past {lm['name']} ({lm['visual_cue']})"
                elif "left" in step_mod.lower():
                    if dist < 80:
                        landmark_text = f"Turn left right at {lm['name']} ({lm['visual_cue']}) onto {st_name}"
                    else:
                        landmark_text = f"Turn left after {lm['name']} onto {st_name} (look for {lm['visual_cue']})"
                elif "right" in step_mod.lower():
                    if dist < 80:
                        landmark_text = f"Turn right immediately at {lm['name']} ({lm['visual_cue']}) onto {st_name}"
                    else:
                        landmark_text = f"Turn right past {lm['name']} onto {st_name}"
                elif step_type == "depart":
                    landmark_text = f"Head out towards {lm['name']} on {st_name}"
                else:
                    landmark_text = f"Continue past {lm['name']} ({lm['visual_cue']}) along {st_name}"

                step_copy["instruction"] = landmark_text
                step_copy["landmark"] = {
                    "id": lm["id"],
                    "name": lm["name"],
                    "visual_cue": lm["visual_cue"],
                    "category": lm["category"],
                    "distance_m": dist
                }
            else:
                step_copy["landmark"] = None

            enriched_maneuvers.append(step_copy)

        return enriched_maneuvers


landmark_repo = LandmarkRepository()
