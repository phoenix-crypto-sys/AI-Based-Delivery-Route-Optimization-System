export interface CityCenterConfig {
  city: string;
  country: string;
  lat: number;
  lng: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  address: string;
}

export const DEFAULT_CITY_CENTER: CityCenterConfig = {
  city: 'Hyderabad',
  country: 'India',
  lat: 17.4483,
  lng: 78.3808,
  zoom: 13.5,
  minZoom: 10,
  maxZoom: 18,
  address: 'Madhapur, HITEC City, Hyderabad, Telangana 500081',
};
