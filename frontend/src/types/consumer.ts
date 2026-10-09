export interface Landmark {
  id: string;
  name: string;
  category: 'temple' | 'shop' | 'tea_stall' | 'gate' | 'junction' | 'transit' | 'food';
  visual_cue: string;
  description: string;
  lat: number;
  lng: number;
  tags?: string[];
  is_user_submitted?: boolean;
}

export interface LandmarkReference {
  id: string;
  name: string;
  visual_cue: string;
  category: string;
  distance_m: number;
}

export interface ConsumerManeuver {
  instruction: string;
  type: string;
  modifier: string;
  distance_meters: number;
  duration_seconds: number;
  street_name: string;
  location: [number, number]; // [lng, lat]
  landmark?: LandmarkReference | null;
}

export interface ConsumerRouteData {
  status: string;
  distance_km: number;
  duration_min: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [[lng, lat], ...]
  };
  maneuvers: ConsumerManeuver[];
  origin: { lat: number; lng: number; name?: string };
  destination: { lat: number; lng: number; name?: string };
  stops: { lat: number; lng: number; name?: string }[];
}

export interface AssistantActionCard {
  title: string;
  category: string;
  address: string;
  rating: number;
  features: string[];
  detour_meters: number;
  detour_minutes: number;
  lat: number;
  lng: number;
  action_type: 'add_as_stop' | 'set_destination';
}

export interface AssistantResponseData {
  transcript: string;
  intent: string;
  target_type: string;
  constraints: string[];
  voice_response: string;
  card?: AssistantActionCard | null;
}

export interface RerouteExplanationData {
  trigger_type: string;
  explanation: string;
  spoken_announcement: string;
  time_saved_min: number;
  delay_avoided_min: number;
  trigger_distance_m: number;
  timestamp: number;
}
