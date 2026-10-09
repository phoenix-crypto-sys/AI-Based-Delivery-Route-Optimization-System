# AI-Based Delivery Route Optimization System
### "Mission Control" Edition — Live Simulation & Dynamic OR-Tools VRP

A full-stack, AI-driven delivery route optimization platform with a **SpaceX launch control / Palantir ops center** aesthetic. Powered by **Google OR-Tools VRPTW**, live tick-based simulation over **WebSockets**, **D3.js analytics & Brain View**, and a **60 FPS HTML5 Canvas engine** with smooth vehicle interpolation and route pen-drawing animations.

---

## ⚡ Key Capabilities

1. **Real Google OR-Tools Optimization**: Solves Capacitated Vehicle Routing Problem with Time Windows (CVRPTW) with multi-objective balancing (*Fastest*, *Cheapest*, *Greenest*).
2. **60 FPS Animated Simulation Canvas**:
   - Continuous vehicle interpolation without snapping or teleporting.
   - Dynamic heading angle rotation matching movement direction.
   - Animated route pen-drawing (~800ms) with old routes cross-fading.
   - 15% opacity fading trails and pulsing radar waypoint markers.
   - Glowing traffic congestion zones with animated flow rings.
3. **Interactive Scenario Controls**:
   - **Click-to-Add Order**: Click anywhere on the city canvas mid-simulation to deploy a priority delivery and watch routes re-draw live.
   - **Vehicle Breakdown / Failover**: Disable any truck to instantly transfer remaining orders across the active fleet.
   - **Multi-Objective Slider**: Dynamically re-weight solver priorities between Fastest, Cheapest, and Greenest.
   - **Time Controls**: Play, pause, 1x / 2x / 5x / 10x speeds, and timeline scrub bar.
4. **"Brain View" Optimizer Visualization**:
   - Interactive D3 Force-Directed Decision Graph.
   - Real Simulated Annealing / OR-Tools Cost Convergence Trajectory Chart.
   - Distance and Duration Cost Matrix Heatmap.

---

## 🚀 Quick Start

### 1. Backend Setup & Launch
```powershell
# Virtual environment is already configured in .venv
.venv\Scripts\python.exe backend\run.py
```
Backend runs on `http://127.0.0.1:8000` (FastAPI REST & WebSockets).
Interactive API docs available at `http://127.0.0.1:8000/docs`.

### 2. Frontend Launch
```powershell
cd frontend
npm run dev
```
Frontend runs on `http://127.0.0.1:5173`.

---

## 🧪 Testing
```powershell
.venv\Scripts\python.exe -m pytest backend/tests/test_backend.py -v
```
All automated unit tests cover road network pathfinding, OR-Tools VRPTW solver assignments, and tick-based simulation state updates.
