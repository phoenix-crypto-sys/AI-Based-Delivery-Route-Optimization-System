# MASTER BUILD PROMPT: AI-Based Delivery Route Optimization System

### "Mission Control" Edition — Next-Level UI & Live Simulation

Copy this entire document into Antigravity as your project brief. It's structured so you can also feed individual sections in as you move through phases.

---

## 1. PROJECT VISION (give this to the agent first, always)

Build a full-stack **AI-powered delivery route optimization platform** with a "mission control" aesthetic — think SpaceX launch control / Palantir ops center, not a generic admin dashboard. The centerpiece is a **live, animated simulation** of a delivery fleet moving through a city, dynamically re-optimizing routes in real time as orders are added, traffic changes, or vehicles go offline.

This is not just an algorithm demo — it's a _spectacle_. Every optimization decision should be visually legible: routes draw themselves in, fade out when replaced, trucks move smoothly (not teleport), and traffic congestion flows like a living organism across the map.

**Core pillars:**

1. Real optimization algorithms (not fake/random routing)
2. Dynamic re-optimization that is visually dramatized, not hidden
3. A UI that feels alive — glow, motion, particles, pulse — without sacrificing readability
4. Time-scrubbable simulation (play/pause/speed/rewind)
5. A "Brain view" that visualizes what the optimizer is doing internally

---

## 2. TECH STACK (be explicit with the agent — don't let it improvise wildly)

**Frontend**

- React + TypeScript
- Mapbox GL JS or deck.gl for the map layer (choose Mapbox GL for real streets; see Section 4 for the abstract-city alternative)
- Framer Motion for UI micro-interactions and panel transitions
- GSAP for route draw-in/fade-out animations along paths
- D3.js for live-updating analytics graphs (cost curves, convergence charts)
- Zustand or Redux Toolkit for simulation state management
- Tailwind CSS with a custom dark theme (see Section 5 design tokens)
- Three.js (optional, only if going 3D-tilt route — see Section 4)

**Backend**

- Python + FastAPI (keeps optimization code and API in the same language)
- Google OR-Tools for the core VRP/VRPTW solver
- NetworkX for graph representation of the road network
- scikit-learn or XGBoost for ETA/traffic prediction model
- WebSockets (FastAPI native or Socket.IO) for pushing live vehicle positions and re-route events to the frontend
- Celery + Redis for async re-optimization jobs (so re-solves don't block the API)
- PostgreSQL + PostGIS for persistent storage of orders, vehicles, depots, historical routes

**Simulation Engine (this can live in backend or as a separate service)**

- A tick-based simulator (e.g., 1 tick = 1 simulated second, configurable speed multiplier) that:
  - Advances each vehicle along its current path
  - Emits position updates over WebSocket
  - Detects trigger events (new order, traffic spike, vehicle breakdown) and calls the optimizer for affected vehicles only

**Routing/Map Data**

- OSRM (self-hosted, free) or OpenRouteService for real road-network distance/duration matrices
- If going the abstract-city route instead: generate a synthetic grid/hex graph with your own edge weights

---

## 3. SYSTEM ARCHITECTURE

Give the agent this diagram description and ask it to scaffold accordingly:

```
[React Frontend — Mission Control UI]
   ├── Map/Simulation Canvas (Mapbox GL / deck.gl)
   ├── Ops View ↔ Brain View toggle
   ├── Left panel: Fleet & Order management
   ├── Right panel: Live analytics (D3 charts)
   ├── Bottom bar: Simulation time controls (play/pause/speed/scrub)
   └── WebSocket client (live position + re-route events)
          │
          ▼
[FastAPI Backend]
   ├── /api/orders        — CRUD for delivery orders
   ├── /api/vehicles       — CRUD for fleet/drivers
   ├── /api/optimize       — triggers full or partial re-optimization
   ├── /ws/simulation      — WebSocket stream of tick updates
   ├── Optimizer Service   — OR-Tools VRP/VRPTW solver
   ├── ETA Predictor       — ML model for travel time estimation
   └── Simulation Engine   — tick loop, event triggers, state broadcaster
          │
          ▼
[PostgreSQL + PostGIS]      [Redis + Celery]      [OSRM/ORS routing service]
```

---

## 4. KEY DECISION — ASK ME BEFORE SCAFFOLDING

Before generating code, the agent should confirm one architectural choice:

> **Real map vs. stylized abstract city?**
>
> - _Real map_: Mapbox/deck.gl + OSRM on real streets. More authentic, constrained by real geocoding/road data, harder to over-stylize.
> - _Abstract city_: a custom-generated grid/hex world fully under our control. Easier to make visually wild (custom glow shaders, particle physics, exaggerated motion) and avoids map licensing/rate-limit headaches during rapid iteration.
>
> Default recommendation: **start with the abstract city** for the simulation core and visual polish, then swap in a real-map renderer once the optimizer and animation system are solid. This decouples "does the algorithm work" from "does the map look good."

---

## 5. UI / VISUAL DESIGN SYSTEM

Give the agent this as a hard design spec, not a vague vibe:

**Palette**

- Background: near-black navy (`#0A0E17`) with a subtle grid texture at low opacity
- Vehicle route colors: neon cyan (`#00F0FF`), magenta (`#FF2FD0`), amber (`#FFB400`), lime (`#B6FF00`) — one hue per active vehicle, cycling if fleet > 4
- Completed route trail: same hue at 15% opacity, fading further over 3 seconds
- Traffic congestion overlay: red→orange gradient glow, animated flow along the road direction
- Panels: glassmorphism — `backdrop-filter: blur(16px)`, semi-transparent dark background, thin 1px border with a faint glow matching the active accent color

**Typography**

- Monospace or geometric sans for data/numbers (e.g., "Space Mono", "JetBrains Mono") — reinforces the "telemetry" feel
- Clean sans-serif for labels/UI chrome (e.g., "Inter")

**Motion principles (critical — tell the agent explicitly)**

- Trucks interpolate position every tick — never snap/teleport
- Truck icon rotates to match heading
- New route draws in stroke-by-stroke over ~800ms (like a pen animation), old route fades out over the same duration, overlapping — not sequential
- Delivery point markers pulse (scale 1.0→1.15→1.0 loop) until fulfilled, then a one-shot "pop + dim" animation on completion
- Any re-optimization event triggers a brief full-panel highlight flash so the user's eye is drawn to what changed

**Layout**

- Full-bleed map/simulation canvas as the base layer
- Floating glass panels overlaid: left = fleet/orders, right = analytics, bottom = time controls, top = mode toggle (Ops View / Brain View)
- "Brain View" replaces the map with a live force-directed graph (D3) of the cost/decision matrix updating as the optimizer runs

---

## 6. SIMULATION FEATURES (the "wow" list — prioritize these)

Tell the agent to build in this order:

1. **Static simulation**: fixed depot, fixed orders, solve once, animate trucks along the solved routes
2. **Time controls**: play/pause/speed multiplier (1x/2x/5x)/scrub bar
3. **Live click-to-add order**: user clicks anywhere on the map mid-simulation → new delivery point appears → affected vehicle(s) re-optimize → route redraw animation plays live
4. **Traffic simulation**: animated congestion zones that slow trucks passing through them; congestion intensity changes over simulated time
5. **Vehicle breakdown event**: user can "disable" a truck mid-route → its remaining orders redistribute to other vehicles → visualize the handoff
6. **Brain View**: toggle to a visualization of the solver's internal state — cost matrix heatmap, or a live-updating graph of solution cost converging over iterations (great for genetic algorithm / simulated annealing approaches)
7. **Multi-objective slider**: let the user drag a slider between "Fastest," "Cheapest," "Greenest" (CO2-optimized) and watch routes visibly reshuffle
8. **Analytics overlay**: live D3 charts — total distance saved vs. naive routing, on-time %, estimated fuel/CO2, cost curve

---

## 7. OPTIMIZATION ALGORITHM SPEC

Tell the agent explicitly which algorithm to implement first, so it doesn't default to something trivial:

- **Phase 1**: OR-Tools `RoutingModel` with distance/time matrix, capacity constraints, and time windows (VRPTW) — this is your reliable, correct baseline
- **Phase 2**: Add a partial re-optimization path — when a new order or disruption occurs, only re-solve for the affected subset of vehicles (not the whole fleet), for speed
- **Phase 3 (stretch/"crazy" goal)**: Implement an alternative solver (genetic algorithm or simulated annealing) purely to power the "Brain View" convergence visualization — this is where you can show cost dropping over generations in a compelling animated chart, even if OR-Tools remains the production solver

**ETA/traffic ML model**: gradient-boosted regressor trained on (distance, time-of-day, congestion-zone-flag, weather-flag) → predicted travel time. Can start with a synthetic dataset generated by the simulation itself.

---

## 8. SUGGESTED BUILD PHASES (paste these into Antigravity as milestones)

1. **Scaffold**: FastAPI backend + React frontend skeleton, WebSocket connection established, abstract-city grid rendered
2. **Solver core**: OR-Tools VRPTW solving a static problem, returned routes rendered as static lines on the canvas
3. **Animation engine**: trucks move smoothly along routes tick-by-tick, time controls functional
4. **Design pass**: apply full "Mission Control" visual system — glow, glass panels, pulse markers, dark theme
5. **Dynamic events**: click-to-add order, vehicle breakdown, live re-route animation
6. **Traffic layer**: animated congestion + ML ETA predictor wired in
7. **Brain View + analytics**: decision graph visualization, D3 live charts, multi-objective slider
8. **Polish**: sound design (optional), 3D tilt camera (optional), real-map swap-in (optional stretch)

---

## 9. WHAT TO TELL THE AGENT NOT TO DO

- Don't fake the optimization with random/shuffled routes — the solver must be real, even in early phases
- Don't build the full real-map integration before the simulation/animation core works — sequence matters
- Don't skip the "old route fades / new route draws in" animation — silent instant re-routing kills the entire visual concept
- Don't default to a light theme or generic Bootstrap-style admin dashboard
