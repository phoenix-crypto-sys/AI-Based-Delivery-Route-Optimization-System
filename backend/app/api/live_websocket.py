import json
import logging
from typing import List, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("LiveWebSocket")

live_ws_router = APIRouter()


class LiveConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Live WebSocket client connected. Active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"Live WebSocket client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        payload = json.dumps(message)
        dead = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Error broadcasting to live WS client: {e}")
                dead.append(connection)
        for d in dead:
            self.disconnect(d)


live_manager_instance = None
live_ws_manager = LiveConnectionManager()


def set_live_ws_engine(mgr):
    global live_manager_instance
    live_manager_instance = mgr


@live_ws_router.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await live_ws_manager.connect(websocket)

    # Immediately send current live operations state
    if live_manager_instance:
        await websocket.send_text(json.dumps({
            "type": "INIT_STATE",
            "payload": live_manager_instance.get_state()
        }))

    try:
        while True:
            # Client can ping or send messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                # Handle client actions if any
                if msg.get("action") == "PING_LOCATION" and live_manager_instance:
                    p = msg.get("payload", {})
                    v = live_manager_instance.process_gps_ping(
                        vehicle_id=p.get("vehicle_id"),
                        lat=p.get("lat"),
                        lng=p.get("lng"),
                        heading=p.get("heading", 0.0),
                        speed_kmh=p.get("speed_kmh", 0.0)
                    )
                    if v:
                        await live_ws_manager.broadcast({
                            "type": "GPS_PING",
                            "vehicle_id": p.get("vehicle_id"),
                            "state": live_manager_instance.get_state()
                        })
            except Exception as e:
                logger.error(f"Error processing live client WS payload: {e}")
    except WebSocketDisconnect:
        live_ws_manager.disconnect(websocket)
