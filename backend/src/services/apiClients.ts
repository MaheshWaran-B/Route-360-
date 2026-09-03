// ====================================================================
// API Clients – TomTom, OSRM, OpenWeatherMap
// ====================================================================

const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY || "";
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "";

// --- Geocoding ---

export async function geocodeWithTomTom(place: string) {
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(place)}.json?key=${TOMTOM_API_KEY}&countrySet=IN&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;
  const best = data.results[0];
  return {
    lat: best.position.lat,
    lon: best.position.lon,
    label: best.address?.freeformAddress || place,
  };
}

// --- OSRM Routing ---

interface OSRMRoute {
  coords: [number, number][];
  distanceMeters: number;
  durationSec: number;
}

export async function getOSRMRoute(start: [number, number], end: [number, number]): Promise<OSRMRoute | null> {
  const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) return null;
  const route = data.routes[0];
  return {
    coords: route.geometry.coordinates.map((p: number[]) => [p[1], p[0]]),
    distanceMeters: route.distance,
    durationSec: route.duration,
  };
}

export async function getOSRMAlternatives(
  start: [number, number],
  end: [number, number]
): Promise<OSRMRoute[]> {
  const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=true`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) return [];
  return data.routes.map((r: any) => ({
    coords: r.geometry.coordinates.map((p: number[]) => [p[1], p[0]]),
    distanceMeters: r.distance,
    durationSec: r.duration,
  }));
}

// --- TomTom Traffic Flow ---

export async function fetchTrafficFlow(lat: number, lon: number, zoom = 14) {
  const url =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/${zoom}/json` +
    `?key=${TOMTOM_API_KEY}&point=${lat},${lon}&unit=kmph`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.flowSegmentData || null;
}

// --- TomTom Incidents ---

interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export async function fetchIncidents(bbox: BBox) {
  const bboxStr = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  const url =
    `https://api.tomtom.com/traffic/services/5/incidentDetails` +
    `?key=${TOMTOM_API_KEY}&bbox=${bboxStr}&timeValidityFilter=present&language=en-GB`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.incidents || [];
}

// --- OpenWeatherMap ---

export async function fetchWeather(lat: number, lon: number) {
  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchWeatherForCoords(lat: number, lon: number) {
  return fetchWeather(lat, lon);
}
