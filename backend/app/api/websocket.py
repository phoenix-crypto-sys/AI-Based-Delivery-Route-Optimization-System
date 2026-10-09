import json
import logging
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("SimulationWebSocket")

ws_router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast(self, data: dict):
        if not self.active_connections:
            return
        msg = json.dumps(data)
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.discard(ws)


manager = ConnectionManager()
engine_ref = None


def set_ws_engine(eng):
    global engine_ref
    engine_ref = eng


@ws_router.websocket("/ws/simulation")
async def simulation_websocket(websocket: WebSocket):
    await manager.connect(websocket)
    # Send initial state immediately
    if engine_ref:
        await websocket.send_text(json.dumps({
            "type": "STATE_UPDATE",
            "payload": engine_ref.get_state().model_dump()
        }))

    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)
            action = data.get("action")

            if not engine_ref:
                continue

            if action == "PLAY":
                engine_ref.is_paused = False
            elif action == "PAUSE":
                engine_ref.is_paused = True
            elif action == "SET_SPEED":
                engine_ref.speed_multiplier = float(data.get("speed", 1.0))
            elif action == "ADD_ORDER":
                engine_ref.add_order_dynamically(
                    x=float(data.get("x", 500)),
                    y=float(data.get("y", 400)),
                    demand=int(data.get("demand", 2)),
                    priority=data.get("priority", "normal")
                )
            elif action == "TOGGLE_BREAKDOWN":
                engine_ref.toggle_vehicle_breakdown(data.get("vehicle_id"))
            elif action == "OPTIMIZE":
                from ..models import OptimizationRequest
                opts = OptimizationRequest(
                    fastest_weight=float(data.get("fastest_weight", 0.34)),
                    cheapest_weight=float(data.get("cheapest_weight", 0.33)),
                    greenest_weight=float(data.get("greenest_weight", 0.33)),
                    traffic_aware=bool(data.get("traffic_aware", True))
                )
                engine_ref.trigger_full_optimization(opts)

            # Broadcast updated state immediately on command
            await manager.broadcast({
                "type": "STATE_UPDATE",
                "payload": engine_ref.get_state().model_dump()
            })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
