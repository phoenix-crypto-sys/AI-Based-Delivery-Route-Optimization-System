from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from ..models import SimulationState, OptimizationRequest, Order, BrainData


class ControlRequest(BaseModel):
    action: str  # "play", "pause", "step", "reset", "speed"
    speed_multiplier: Optional[float] = None


class NewOrderRequest(BaseModel):
    x: float
    y: float
    demand: int = 2
    priority: str = "normal"


class TrafficToggleRequest(BaseModel):
    zone_id: str


router = APIRouter(prefix="/api")

# Reference to engine set by main.py
engine = None


def set_engine(eng):
    global engine
    engine = eng


@router.get("/state", response_model=SimulationState)
@router.get("/simulation/state", response_model=SimulationState)
def get_simulation_state():
    if not engine:
        raise HTTPException(status_code=500, detail="Engine not initialized")
    return engine.get_state()



@router.post("/optimize")
def trigger_optimization(req: OptimizationRequest):
    if not engine:
        raise HTTPException(status_code=500, detail="Engine not initialized")
    result = engine.trigger_full_optimization(req)
    return {"status": "optimized", "result": result, "state": engine.get_state()}


@router.post("/orders")
def add_delivery_order(req: NewOrderRequest):
    if not engine:
        raise HTTPException(status_code=500, detail="Engine not initialized")
    order = engine.add_order_dynamically(x=req.x, y=req.y, demand=req.demand, priority=req.priority)
    return {"status": "created", "order": order, "state": engine.get_state()}


@router.post("/vehicles/{vehicle_id}/breakdown")
def toggle_breakdown(vehicle_id: str):
    if not engine:
        raise HTTPException(status_code=500, detail="Engine not initialized")
    is_broken = engine.toggle_vehicle_breakdown(vehicle_id)
    return {"vehicle_id": vehicle_id, "is_broken": is_broken, "state": engine.get_state()}


@router.post("/simulation/control")
def control_simulation(req: ControlRequest):
    if not engine:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    if req.action == "play":
        engine.is_paused = False
    elif req.action == "pause":
        engine.is_paused = True
    elif req.action == "step":
        engine.update_tick()
    elif req.action == "speed" and req.speed_multiplier is not None:
        engine.speed_multiplier = max(0.5, min(10.0, req.speed_multiplier))
    elif req.action == "reset":
        engine._init_defaults()
        engine.trigger_full_optimization()

    return {"status": "updated", "state": engine.get_state()}


@router.get("/brain", response_model=BrainData)
def get_brain_view():
    if not engine:
        raise HTTPException(status_code=500, detail="Engine not initialized")
    return engine.get_brain_data()


@router.post("/traffic/toggle")
def toggle_traffic(req: TrafficToggleRequest):
    if not engine:
        raise HTTPException(status_code=500, detail="Engine not initialized")
    active = engine.traffic_manager.toggle_zone(req.zone_id)
    engine.trigger_full_optimization()
    return {"zone_id": req.zone_id, "active": active, "state": engine.get_state()}
