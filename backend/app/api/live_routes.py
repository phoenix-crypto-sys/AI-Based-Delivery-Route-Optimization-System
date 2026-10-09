from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import urllib.request
import urllib.parse
import json

from ..models import OptimizationRequest, BrainData

router = APIRouter(prefix="/api/live")

# Global reference to live manager
live_manager = None
live_ws_manager = None


class OptimizeWeightsPayload(BaseModel):
    fastest: Optional[float] = None
    cheapest: Optional[float] = None
    greenest: Optional[float] = None


def set_live_manager(mgr, ws_mgr=None):
    global live_manager, live_ws_manager
    live_manager = mgr
    live_ws_manager = ws_mgr


class GPSPingRequest(BaseModel):
    lat: float
    lng: float
    heading: Optional[float] = 0.0
    speed_kmh: Optional[float] = 0.0


class LiveOrderRequest(BaseModel):
    customer_name: str
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    demand: int = 1
    priority: str = "normal"
    time_window_start: int = 30
    time_window_end: int = 240


class CSVTextRequest(BaseModel):
    csv_content: str


class WebhookOrderPayload(BaseModel):
    order_id: Optional[str] = None
    customer: str
    delivery_address: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    packages: int = 1
    priority: Optional[str] = "normal"


@router.get("/state")
def get_live_state():
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")
    return live_manager.get_state()


@router.post("/vehicles/{vehicle_id}/ping")
async def receive_gps_ping(vehicle_id: str, ping: GPSPingRequest):
    """Processes real GPS ping from driver companion phone watchPosition."""
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")

    v = live_manager.process_gps_ping(
        vehicle_id=vehicle_id,
        lat=ping.lat,
        lng=ping.lng,
        heading=ping.heading or 0.0,
        speed_kmh=ping.speed_kmh or 0.0
    )

    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Broadcast real-time GPS update via WebSocket
    if live_ws_manager:
        await live_ws_manager.broadcast({
            "type": "GPS_PING",
            "vehicle_id": vehicle_id,
            "lat": ping.lat,
            "lng": ping.lng,
            "heading": ping.heading,
            "speed_kmh": ping.speed_kmh,
            "state": live_manager.get_state()
        })

    return {"status": "ok", "vehicle": v}


@router.post("/orders")
async def create_live_order(req: LiveOrderRequest):
    """Manual order intake with address geocoding fallback."""
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")

    lat = req.lat
    lng = req.lng

    # Geocode if lat/lng not provided
    if lat is None or lng is None:
        geo = geocode_address(req.address)
        lat = geo[0]
        lng = geo[1]

    order = live_manager.add_order(
        customer_name=req.customer_name,
        address=req.address,
        lat=lat,
        lng=lng,
        demand=req.demand,
        priority=req.priority,
        tw_s=req.time_window_start,
        tw_e=req.time_window_end
    )

    if live_ws_manager:
        await live_ws_manager.broadcast({
            "type": "ORDER_CREATED",
            "order": order.model_dump(),
            "state": live_manager.get_state()
        })

    return {"status": "created", "order": order, "state": live_manager.get_state()}


@router.post("/orders/csv")
async def import_csv_orders(req: CSVTextRequest):
    """Imports batch of delivery orders from CSV text."""
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")

    count = live_manager.import_csv_orders(req.csv_content)

    if live_ws_manager:
        await live_ws_manager.broadcast({
            "type": "CSV_IMPORTED",
            "count": count,
            "state": live_manager.get_state()
        })

    return {"status": "imported", "count": count, "state": live_manager.get_state()}


@router.post("/webhook/order")
async def webhook_order_intake(payload: WebhookOrderPayload):
    """E-Commerce / WMS Webhook integration endpoint."""
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")

    lat = payload.lat
    lng = payload.lng

    if lat is None or lng is None:
        lat, lng = geocode_address(payload.delivery_address)

    order = live_manager.add_order(
        customer_name=payload.customer,
        address=payload.delivery_address,
        lat=lat,
        lng=lng,
        demand=payload.packages,
        priority=payload.priority or "normal"
    )

    if live_ws_manager:
        await live_ws_manager.broadcast({
            "type": "WEBHOOK_ORDER",
            "order": order.model_dump(),
            "state": live_manager.get_state()
        })

    return {"status": "received", "order_id": order.id, "state": live_manager.get_state()}


class DeliverOrderPayload(BaseModel):
    vehicle_id: Optional[str] = None


@router.post("/orders/{order_id}/deliver")
async def mark_delivered(order_id: str, payload: Optional[DeliverOrderPayload] = None):
    """Driver marks stop delivered in companion app."""
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")

    veh_id = payload.vehicle_id if payload else None
    success = live_manager.mark_delivered(order_id, veh_id)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found")

    if live_ws_manager:
        await live_ws_manager.broadcast({
            "type": "ORDER_DELIVERED",
            "order_id": order_id,
            "vehicle_id": veh_id,
            "state": live_manager.get_state()
        })

    return {"status": "delivered", "order_id": order_id, "state": live_manager.get_state()}


@router.post("/vehicles/{vehicle_id}/failover")
async def toggle_vehicle_failover(vehicle_id: str):
    """Marks vehicle unavailable / driver issue and instantly redistributes stops to remaining fleet."""
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")

    is_offline = live_manager.toggle_vehicle_failover(vehicle_id)

    if live_ws_manager:
        await live_ws_manager.broadcast({
            "type": "VEHICLE_FAILOVER",
            "vehicle_id": vehicle_id,
            "is_offline": is_offline,
            "state": live_manager.get_state()
        })

    return {"vehicle_id": vehicle_id, "is_offline": is_offline, "state": live_manager.get_state()}


@router.post("/optimize")
async def trigger_live_optimization(payload: Optional[OptimizeWeightsPayload] = None):
    """Forces OR-Tools solver re-calculation with optional multi-objective weights."""
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")

    fastest = payload.fastest if payload else None
    cheapest = payload.cheapest if payload else None
    greenest = payload.greenest if payload else None

    live_manager.optimize_routes(fastest_weight=fastest, cheapest_weight=cheapest, greenest_weight=greenest)

    if live_ws_manager:
        await live_ws_manager.broadcast({
            "type": "ROUTES_OPTIMIZED",
            "state": live_manager.get_state()
        })

    return {"status": "optimized", "state": live_manager.get_state()}


@router.get("/brain", response_model=BrainData)
def get_live_brain():
    """Live Mode counterpart to Brain View: Decision graph, cost matrix, and convergence telemetry computed from real orders."""
    if not live_manager:
        raise HTTPException(status_code=500, detail="Live manager not initialized")
    return live_manager.get_brain_data()


@router.get("/geocode")
def api_geocode(address: str):
    lat, lng = geocode_address(address)
    return {"address": address, "lat": lat, "lng": lng}


GEOCODE_CACHE: Dict[str, tuple[float, float]] = {}


def geocode_address(address: str) -> tuple[float, float]:
    """Geocodes an address string using Nominatim with countrycodes=in and Hyderabad viewbox bias."""
    clean_addr = address.strip().lower()
    if clean_addr in GEOCODE_CACHE:
        return GEOCODE_CACHE[clean_addr]

    try:
        encoded = urllib.parse.quote(address)
        # Bounded viewbox around Hyderabad metropolitan area with countrycodes=in
        url = f"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&limit=1&countrycodes=in&viewbox=78.20,17.60,78.65,17.20"
        req = urllib.request.Request(url, headers={"User-Agent": "VanguardDeliveryPlatform/3.0"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode())
            if data and len(data) > 0:
                coords = (float(data[0]["lat"]), float(data[0]["lon"]))
                GEOCODE_CACHE[clean_addr] = coords
                return coords
    except Exception:
        pass

    # Deterministic fallback offset around HITEC City / Hyderabad dispatch hub
    hash_val = sum(ord(c) for c in address)
    lat_offset = ((hash_val % 40) - 20) * 0.0015
    lng_offset = (((hash_val * 7) % 40) - 20) * 0.0015
    coords = (17.4483 + lat_offset, 78.3808 + lng_offset)
    GEOCODE_CACHE[clean_addr] = coords
    return coords

