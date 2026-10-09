"""
Consumer Navigation API Router.
Dedicated endpoints for Hyderabad consumer navigation, landmark layer management,
explainable rerouting, and conversational voice assistant.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Tuple
import urllib.request
import urllib.parse
import json
import time

from ..consumer.landmarks import landmark_repo, Landmark, haversine_distance_m
from ..consumer.rerouting import reroute_engine, RerouteTrigger, RerouteExplanation
from ..consumer.assistant import voice_assistant, AssistantQueryRequest, AssistantResponse

router = APIRouter(prefix="/api/consumer", tags=["Consumer Navigation"])


class RouteCalculationRequest(BaseModel):
    origin: Dict[str, float]  # {"lat": float, "lng": float}
    destination: Dict[str, float]  # {"lat": float, "lng": float}
    stops: Optional[List[Dict[str, float]]] = None  # [{"lat": float, "lng": float}, ...]
    vehicle_type: Optional[str] = "car"  # car, motorcycle, auto


class AddLandmarkRequest(BaseModel):
    name: str
    category: str
    visual_cue: str
    description: str
    lat: float
    lng: float
    tags: Optional[List[str]] = None


class SimulateRerouteRequest(BaseModel):
    trigger_type: str  # "accident" | "traffic_surge" | "waterlogging" | "road_closure"
    location_name: Optional[str] = None
    corridor_name: Optional[str] = None


@router.get("/landmarks", response_model=List[Landmark])
def get_landmarks():
    """Returns all verified and community-submitted landmarks in Hyderabad."""
    return landmark_repo.list_all()


@router.post("/landmarks", response_model=Landmark)
def create_landmark(req: AddLandmarkRequest):
    """Submits a new local landmark reference point."""
    lm = landmark_repo.add_landmark(
        name=req.name,
        category=req.category,
        visual_cue=req.visual_cue,
        description=req.description,
        lat=req.lat,
        lng=req.lng,
        tags=req.tags
    )
    return lm


def query_osrm_route(waypoints: List[List[float]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]], float, float]:
    """
    Queries public OSRM for true road path and maneuvers.
    waypoints is [[lng, lat], ...]
    """
    coords_str = ";".join([f"{p[0]:.6f},{p[1]:.6f}" for p in waypoints])
    url = f"http://router.project-osrm.org/route/v1/driving/{coords_str}?overview=full&geometries=geojson&steps=true"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VanguardConsumerNavigator/3.0"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                if data.get("code") == "Ok" and len(data.get("routes", [])) > 0:
                    r = data["routes"][0]
                    geojson = r.get("geometry", {})
                    distance_km = round(r.get("distance", 0) / 1000.0, 2)
                    duration_min = round(r.get("duration", 0) / 60.0, 1)

                    raw_maneuvers = []
                    for leg in r.get("legs", []):
                        for step in leg.get("steps", []):
                            man = step.get("maneuver", {})
                            step_loc = man.get("location", [0, 0])
                            step_type = man.get("type", "turn")
                            step_mod = man.get("modifier", "")
                            raw_street = step.get("name")
                            street = raw_street.strip() if raw_street and raw_street.strip() else "Hyderabad Arterial Rd"
                            dist_m = step.get("distance", 0)
                            dur_s = step.get("duration", 0)

                            if step_type == "depart":
                                instruction = f"Head out onto {street}"
                            elif step_type == "arrive":
                                instruction = "You have arrived at your destination"
                            elif step_mod:
                                instruction = f"Turn {step_mod} onto {street}"
                            else:
                                instruction = f"Continue on {street}"

                            raw_maneuvers.append({
                                "instruction": instruction,
                                "type": step_type,
                                "modifier": step_mod,
                                "distance_meters": round(dist_m),
                                "duration_seconds": round(dur_s),
                                "street_name": street,
                                "location": step_loc
                            })

                    return geojson, raw_maneuvers, distance_km, duration_min
    except Exception:
        pass

    # Fallback procedural path across Hyderabad arterial corridors
    coords = []
    maneuvers = []
    total_dist = 0.0

    corridors = [
        "HITEC City Main Road",
        "Madhapur 100ft Road",
        "Jubilee Hills Road No. 36",
        "Durgam Cheruvu Cable Bridge",
        "Mindspace Junction Road"
    ]

    for i in range(len(waypoints) - 1):
        p1 = waypoints[i]
        p2 = waypoints[i + 1]
        mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + 0.002]
        coords.extend([p1, mid, p2])
        d_km = haversine_distance_m(p1[1], p1[0], p2[1], p2[0]) / 1000.0
        total_dist += d_km
        st = corridors[i % len(corridors)]
        maneuvers.append({
            "instruction": f"Turn towards destination on {st}",
            "type": "turn",
            "modifier": "right" if i % 2 == 0 else "left",
            "distance_meters": round(d_km * 1000),
            "duration_seconds": round(d_km * 130),
            "street_name": st,
            "location": p1
        })

    geojson = {"type": "LineString", "coordinates": coords}
    return geojson, maneuvers, round(total_dist, 2), round(total_dist * 2.8, 1)


@router.post("/route")
def calculate_consumer_route(req: RouteCalculationRequest):
    """
    Computes road path, applies landmark-based instruction blending,
    and returns geometry and enriched directions.
    """
    waypoints = [[req.origin["lng"], req.origin["lat"]]]
    if req.stops:
        for s in req.stops:
            waypoints.append([s["lng"], s["lat"]])
    waypoints.append([req.destination["lng"], req.destination["lat"]])

    geojson, raw_maneuvers, dist_km, dur_min = query_osrm_route(waypoints)

    # Blend Hyderabad landmarks into maneuver steps
    enriched_maneuvers = landmark_repo.blend_landmarks_into_maneuvers(raw_maneuvers)

    return {
        "status": "success",
        "distance_km": dist_km,
        "duration_min": dur_min,
        "geometry": geojson,
        "maneuvers": enriched_maneuvers,
        "origin": req.origin,
        "destination": req.destination,
        "stops": req.stops or []
    }


@router.post("/assistant/query", response_model=AssistantResponse)
def handle_assistant_query(req: AssistantQueryRequest):
    """
    Processes spoken natural language query, performs intent parsing,
    checks en-route corridor search, and produces voice announcement and action card.
    """
    return voice_assistant.process_voice_query(req)


@router.post("/simulate-reroute", response_model=RerouteExplanation)
def trigger_simulate_reroute(req: SimulateRerouteRequest):
    """
    Simulates a live traffic incident or road condition trigger, generating
    a factual natural-language explanation and time-saved metrics.
    """
    trigger_type = req.trigger_type
    loc_name = req.location_name or "HITEC City Main Road"
    alt_corridor = req.corridor_name or "Mindspace Cable Bridge Bypass"

    trigger = RerouteTrigger(
        trigger_type=trigger_type,
        location_name=loc_name,
        distance_ahead_m=650,
        delay_added_sec=720,  # +12 mins delay
        time_saved_sec=420,   # saves 7 mins
        alternative_corridor=alt_corridor
    )

    return reroute_engine.generate_explanation(trigger)


@router.get("/geocode")
def geocode_location(q: str):
    """
    Geocodes a search string using Hyderabad-biased Nominatim search,
    with fast fallback and enrichment from the local landmark repository.
    """
    q_clean = q.strip()
    if not q_clean or len(q_clean) < 2:
        return []

    results = []
    q_lower = q_clean.lower()

    # 1. Search local landmark repository first (instant 0ms response)
    for lm in landmark_repo.list_all():
        if (
            q_lower in lm.name.lower()
            or q_lower in lm.description.lower()
            or q_lower in lm.visual_cue.lower()
            or any(q_lower in t.lower() for t in lm.tags)
        ):
            results.append({
                "name": lm.name,
                "display_name": f"{lm.name} ({lm.visual_cue})",
                "lat": lm.lat,
                "lng": lm.lng,
                "type": "landmark",
                "category": lm.category
            })

    # 2. Query Nominatim biased to Greater Hyderabad / Telangana region
    try:
        query_param = urllib.parse.quote(q_clean)
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={query_param}&countrycodes=in&viewbox=77.5,18.2,79.2,16.8&bounded=0&limit=6"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "VanguardConsumerNavigator/3.0 (hyderabad-route-optimizer)"}
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            if resp.status == 200:
                raw_osm = json.loads(resp.read().decode())
                
                # If direct query returned 0, try regional suffix fallback
                if not raw_osm and "hyderabad" not in q_lower and "telangana" not in q_lower:
                    fb_param = urllib.parse.quote(f"{q_clean}, Telangana")
                    fb_url = f"https://nominatim.openstreetmap.org/search?format=json&q={fb_param}&countrycodes=in&limit=4"
                    fb_req = urllib.request.Request(fb_url, headers={"User-Agent": "VanguardConsumerNavigator/3.0"})
                    with urllib.request.urlopen(fb_req, timeout=2.5) as fb_resp:
                        if fb_resp.status == 200:
                            raw_osm = json.loads(fb_resp.read().decode())

                for item in raw_osm:
                    item_lat = float(item["lat"])
                    item_lng = float(item["lon"])
                    # De-duplicate if coordinate is virtually identical
                    if not any(abs(r["lat"] - item_lat) < 0.0005 and abs(r["lng"] - item_lng) < 0.0005 for r in results):
                        display_name = item.get("display_name", "")
                        parts = [p.strip() for p in display_name.split(",")]
                        short_name = parts[0]
                        short_desc = ", ".join(parts[1:3]) if len(parts) > 1 else "Telangana, India"
                        results.append({
                            "name": short_name,
                            "display_name": f"{short_name}, {short_desc}",
                            "lat": item_lat,
                            "lng": item_lng,
                            "type": "osm",
                            "category": item.get("type", "location")
                        })
    except Exception:
        # Graceful fallback to local landmark results
        pass

    return results[:8]
