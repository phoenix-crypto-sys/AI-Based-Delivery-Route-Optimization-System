# System configuration and Mission Control constants

GRID_WIDTH = 1000  # Virtual grid coordinates (0 to 1000)
GRID_HEIGHT = 800  # Virtual grid coordinates (0 to 800)

# City center configuration (India default, fully configurable)
DEFAULT_CITY_CENTER = {
    "city": "Hyderabad",
    "country": "India",
    "lat": 17.4483,
    "lng": 78.3808,
    "zoom": 13.5,
    "address": "Madhapur, HITEC City, Hyderabad, Telangana 500081"
}

DEPOT_LOCATION = {
    "x": 500.0,
    "y": 400.0,
    "lat": DEFAULT_CITY_CENTER["lat"],
    "lon": DEFAULT_CITY_CENTER["lng"]
}

# Curated, coherent 4-color family specified in De-Cliché spec
VEHICLE_COLORS = [
    "#5EEAD4",  # Teal
    "#A78BFA",  # Violet
    "#FBBF24",  # Amber
    "#FB7185",  # Rose
    "#38BDF8",  # Sky Blue (fallback)
    "#34D399",  # Emerald (fallback)
]

DEFAULT_VEHICLES = [
    {"id": "TRK-01", "name": "Valkyrie-1", "color": VEHICLE_COLORS[0], "capacity": 25},
    {"id": "TRK-02", "name": "Hyperion-2", "color": VEHICLE_COLORS[1], "capacity": 25},
    {"id": "TRK-03", "name": "Spectre-3",  "color": VEHICLE_COLORS[2], "capacity": 20},
    {"id": "TRK-04", "name": "Apex-4",     "color": VEHICLE_COLORS[3], "capacity": 20},
]

# Simulated clock settings
SIM_START_HOUR = 8  # 08:00 AM
TICK_INTERVAL_SEC = 0.5  # Real-world wall-clock seconds between tick pushes
SIM_SECONDS_PER_TICK = 5  # Each tick advances simulation by 5 seconds
