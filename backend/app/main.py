import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .simulation.engine import SimulationEngine
from .api.routes import router as api_router, set_engine
from .api.websocket import ws_router, set_ws_engine, manager
from .config import TICK_INTERVAL_SEC

from .live.manager import LiveOperationsManager
from .api.live_routes import router as live_router, set_live_manager
from .api.live_websocket import live_ws_router, set_live_ws_engine, live_ws_manager
from .api.consumer_routes import router as consumer_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("MissionControl")

# Singleton simulation engine instance (Simulation Mode)
engine = SimulationEngine()
set_engine(engine)
set_ws_engine(engine)

# Singleton live operations manager (Live Operations Mode)
live_manager = LiveOperationsManager()
set_live_manager(live_manager, live_ws_manager)
set_live_ws_engine(live_manager)

# Background tasks
simulation_task = None
live_monitor_task = None


async def simulation_loop():
    logger.info("Simulation ticker loop started.")
    try:
        while True:
            await asyncio.sleep(TICK_INTERVAL_SEC)
            if not engine.is_paused:
                engine.update_tick()
                # Broadcast live state to all connected simulation clients
                state_dict = engine.get_state().model_dump()
                await manager.broadcast({
                    "type": "TICK",
                    "payload": state_dict
                })
    except asyncio.CancelledError:
        logger.info("Simulation ticker loop stopped.")


async def live_ping_monitor_loop():
    """Monitors live vehicle GPS ping timestamps. Enforces NO simulated movement in Live mode."""
    logger.info("Live GPS freshness monitor loop started.")
    try:
        while True:
            await asyncio.sleep(3.0)
            if live_manager:
                live_manager.evaluate_ping_freshness()
                # Periodically sync state to live dispatchers
                await live_ws_manager.broadcast({
                    "type": "LIVE_HEARTBEAT",
                    "state": live_manager.get_state()
                })
    except asyncio.CancelledError:
        logger.info("Live GPS freshness monitor stopped.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global simulation_task, live_monitor_task
    simulation_task = asyncio.create_task(simulation_loop())
    live_monitor_task = asyncio.create_task(live_ping_monitor_loop())
    yield
    if simulation_task:
        simulation_task.cancel()
    if live_monitor_task:
        live_monitor_task.cancel()


app = FastAPI(
    title="AI-Based Delivery Route Optimization Platform",
    description="Dual Mode Architecture — Simulation Engine & Live Operations Platform",
    version="3.0.0",
    lifespan=lifespan
)

# Allow CORS for local Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include both Simulation and Live Operations routes
app.include_router(api_router)
app.include_router(ws_router)
app.include_router(live_router)
app.include_router(live_ws_router)
app.include_router(consumer_router)


@app.get("/")
def root():
    return {
        "platform": "AI Delivery Route Optimization & Consumer Navigation Platform",
        "modes": {
            "consumer_navigation": "/navigation",
            "live_operations": "/live",
            "driver_companion": "/driver"
        },
        "status": "OPERATIONAL",
        "live_fleet": len(live_manager.vehicles),
        "live_orders": len(live_manager.orders),
        "docs": "/docs"
    }
