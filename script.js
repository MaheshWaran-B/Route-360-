// ====================================================================
// ROUTE 360 – SAFE ROUTE PLANNER
// ====================================================================
// - TomTom GEOCODING
// - OSRM ROUTING (primary + alternative routes)
// - LIVE TRAFFIC FLOW SEGMENT COLORING
// - LIVE INCIDENTS (TomTom Orbis)
// - Construction/Diversion SPEED-LIMIT ZONES
// - Live WEATHER along route (OpenWeatherMap)
// - RISK SCORING ENGINE (weighted multi-factor)
// - ROUTE OPTIMIZATION (fastest / balanced / safest)
// - ROUTE CARDS (compare multiple routes)
// - DYNAMIC REROUTING (monitor & reroute when risk changes)
// - USER-REPORTED INCIDENTS (community hazards)
// - TRAVEL MODE (car / bike / public)
// ====================================================================

// --- Configuration (loaded from config.js) ---
const TOMTOM_API_KEY = window.CONFIG?.TOMTOM_API_KEY || "";
const OPENWEATHER_API_KEY = window.CONFIG?.OPENWEATHER_API_KEY || "";

const india_center = [20.5937, 78.9629];
const INDIA_BOUNDS = {
  minLat: 6.0,
  maxLat: 37.5,
  minLng: 68.0,
  maxLng: 97.5,
};

// Risk scoring weights (from doc: 0.25 Traffic + 0.30 Accident + 0.20 Weather + 0.15 Flood + 0.10 Road Condition)
const RISK_WEIGHTS = {
  traffic: 0.25,
  accident: 0.30,
  weather: 0.20,
  flood: 0.15,
  roadCondition: 0.10,
};

// Route optimization weights
const OPTIMIZATION_WEIGHTS = {
  fastest: { time: 0.7, distance: 0.2, risk: 0.1 },
  balanced: { time: 0.4, distance: 0.2, risk: 0.4 },
  safest: { time: 0.1, distance: 0.1, risk: 0.8 },
};

// Travel mode speed multipliers (affects time estimation)
const TRAVEL_MODE_MULTIPLIERS = {
  car: 1.0,
  bike: 0.7,
  public: 1.2,
};

const CONSTRUCTION_SPEED_LIMIT_KMPH = 30;
const CONSTRUCTION_ZONE_RADIUS_METERS = 300;

// --- Global State ---
let routeSegments = [];
let currentRouteCoords = null;
let routeIncidentWatcher = null;
let orbisIncidentLayer = null;
let routeIncidentZoneLayer = null;
let constructionSpeedLayer = null;
let weatherLayer = null;
let userIncidentLayer = null;
let hazardLayer = null;

let selectedTravelMode = "car";
let selectedPreference = "balanced";
let allRouteData = [];
let activeRouteIndex = 0;
let dynamicRerouteWatcher = null;

// User-reported incidents (local storage)
let userIncidents = JSON.parse(localStorage.getItem("route360_incidents") || "[]");

// ====================================================================
// MAP SETUP
// ====================================================================

const map = L.map("map", {
  maxBounds: [
    [INDIA_BOUNDS.minLat, INDIA_BOUNDS.minLng],
    [INDIA_BOUNDS.maxLat, INDIA_BOUNDS.maxLng],
  ],
  maxBoundsViscosity: 0.8,
}).setView(india_center, 5);

const baseTileLayer = L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 19 }
).addTo(map);

hazardLayer = L.layerGroup().addTo(map);
weatherLayer = L.layerGroup().addTo(map);
userIncidentLayer = L.layerGroup().addTo(map);

// TomTom Traffic Overlays
const tomtomTrafficFlowTiles = L.tileLayer(
  "https://api.tomtom.com/traffic/map/5/tile/flow/relative0/{z}/{x}/{y}.png?key=" + TOMTOM_API_KEY,
  { opacity: 0.6, attribution: "Traffic flow © TomTom" }
);

const tomtomTrafficIncidentTiles = L.tileLayer(
  "https://api.tomtom.com/traffic/map/5/tile/incidents/relative0/{z}/{x}/{y}.png?key=" + TOMTOM_API_KEY,
  { opacity: 0.8, attribution: "Traffic incidents © TomTom" }
);

tomtomTrafficFlowTiles.addTo(map);
tomtomTrafficIncidentTiles.addTo(map);

function refreshTomTomTrafficTiles() {
  const ts = Date.now();
  const base = "https://api.tomtom.com/traffic/map/5/tile/";
  tomtomTrafficFlowTiles.setUrl(`${base}flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}&ts=${ts}`);
  tomtomTrafficIncidentTiles.setUrl(`${base}incidents/relative0/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}&ts=${ts}`);
}
setInterval(refreshTomTomTrafficTiles, 60 * 1000);

// Incident Layers
orbisIncidentLayer = L.layerGroup().addTo(map);
routeIncidentZoneLayer = L.layerGroup().addTo(map);
constructionSpeedLayer = L.layerGroup().addTo(map);

// Layer Control
const baseLayers = { "Base Map": baseTileLayer };
const overlayLayers = {
  "TomTom Flow Tiles (Live)": tomtomTrafficFlowTiles,
  "TomTom Incident Tiles (Live)": tomtomTrafficIncidentTiles,
  "Orbis Incidents (Viewport)": orbisIncidentLayer,
  "Incident Zones Near Route": routeIncidentZoneLayer,
  "Weather Along Route": weatherLayer,
  "User Reported Incidents": userIncidentLayer,
};
overlayLayers[`Construction Speed Zones (${CONSTRUCTION_SPEED_LIMIT_KMPH} km/h)`] = constructionSpeedLayer;
L.control.layers(baseLayers, overlayLayers).addTo(map);

// ====================================================================
// RISK SCORING ENGINE
// ====================================================================

/**
 * Calculate risk score for a route segment based on multiple factors.
 * Returns a value between 0 (safe) and 1 (critical).
 *
 * Risk Score = 0.25×Traffic + 0.30×Accident + 0.20×Weather + 0.15×Flood + 0.10×RoadCondition
 */
function calculateRiskScore(factors) {
  const { trafficRisk, accidentRisk, weatherRisk, floodRisk, roadConditionRisk } = factors;

  const weighted =
    RISK_WEIGHTS.traffic * clamp(trafficRisk, 0, 1) +
    RISK_WEIGHTS.accident * clamp(accidentRisk, 0, 1) +
    RISK_WEIGHTS.weather * clamp(weatherRisk, 0, 1) +
    RISK_WEIGHTS.flood * clamp(floodRisk, 0, 1) +
    RISK_WEIGHTS.roadCondition * clamp(roadConditionRisk, 0, 1);

  return clamp(weighted, 0, 1);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Risk level label from numeric score
 */
function riskLevelLabel(score) {
  if (score < 0.25) return "SAFE";
  if (score < 0.50) return "MODERATE";
  if (score < 0.75) return "HIGH";
  return "CRITICAL";
}

function riskLevelClass(score) {
  if (score < 0.25) return "risk-safe";
  if (score < 0.50) return "risk-moderate";
  if (score < 0.75) return "risk-high";
  return "risk-critical";
}

function riskColor(score) {
  if (score < 0.25) return "#28a745";
  if (score < 0.50) return "#ffc107";
  if (score < 0.75) return "#fd7e14";
  return "#dc3545";
}

/**
 * Assess traffic risk from flow ratio (currentSpeed / freeFlowSpeed)
 * Lower ratio = more congestion = higher risk
 */
function trafficFlowToRisk(flowRatio) {
  if (flowRatio <= 0) return 1.0;
  if (flowRatio >= 1.0) return 0.0;
  return 1.0 - flowRatio;
}

/**
 * Assess weather risk from OpenWeather data
 */
function weatherDataToRisk(weather) {
  if (!weather || !weather.weather || !weather.weather[0]) return 0.2;

  const main = weather.weather[0].main.toLowerCase();
  const visibility = weather.visibility || 10000;
  const windSpeed = weather.wind ? weather.wind.speed : 0;
  const rain = weather.rain ? (weather.rain["1h"] || weather.rain["3h"] || 0) : 0;

  let risk = 0.0;

  // Condition-based risk
  if (main.includes("thunderstorm")) risk = Math.max(risk, 0.8);
  else if (main.includes("rain")) risk = Math.max(risk, 0.5);
  else if (main.includes("drizzle")) risk = Math.max(risk, 0.3);
  else if (main.includes("snow")) risk = Math.max(risk, 0.7);
  else if (main.includes("fog") || main.includes("mist") || main.includes("haze")) risk = Math.max(risk, 0.4);
  else if (main.includes("clear") || main.includes("clouds")) risk = Math.max(risk, 0.1);

  // Visibility-based risk
  if (visibility < 200) risk = Math.max(risk, 0.9);
  else if (visibility < 500) risk = Math.max(risk, 0.6);
  else if (visibility < 1000) risk = Math.max(risk, 0.3);

  // Wind-based risk
  if (windSpeed > 15) risk = Math.max(risk, 0.7);
  else if (windSpeed > 10) risk = Math.max(risk, 0.4);

  // Heavy rain
  if (rain > 10) risk = Math.max(risk, 0.7);
  else if (rain > 5) risk = Math.max(risk, 0.5);

  return clamp(risk, 0, 1);
}

/**
 * Assess accident/incident risk from nearby incidents
 */
function incidentRiskFromCount(count, hasDelay) {
  let risk = 0;
  if (count === 0) risk = 0;
  else if (count === 1) risk = 0.3;
  else if (count <= 3) risk = 0.5;
  else if (count <= 5) risk = 0.7;
  else risk = 0.9;

  if (hasDelay) risk = Math.min(1.0, risk + 0.2);
  return risk;
}

/**
 * Calculate composite risk score for a full route
 */
async function calculateRouteRisk(routeCoords, nearIncidents, destWeather) {
  if (!routeCoords || routeCoords.length < 2) return 0.5;

  // 1) Traffic risk - sample flow along route
  let avgTrafficRisk = 0;
  try {
    const flowData = await getTrafficFlowSamples(routeCoords, 10);
    if (flowData && flowData.length > 0) {
      const risks = flowData.map((d) => trafficFlowToRisk(d.ratio));
      avgTrafficRisk = risks.reduce((a, b) => a + b, 0) / risks.length;
    }
  } catch (e) {
    avgTrafficRisk = 0.3; // default moderate
  }

  // 2) Accident risk
  let hasDelay = false;
  let totalDelaySec = 0;
  nearIncidents.forEach((inc) => {
    if (inc.props && typeof inc.props.delaySeconds === "number") {
      hasDelay = true;
      totalDelaySec += inc.props.delaySeconds;
    }
  });
  const accidentRisk = incidentRiskFromCount(nearIncidents.length, hasDelay);

  // 3) Weather risk
  const weatherRisk = weatherDataToRisk(destWeather);

  // 4) Flood risk (from incident reports + weather)
  let floodRisk = 0;
  const floodIncidents = userIncidents.filter(
    (inc) => inc.type === "flood" && isPointNearRoute(inc.lat, inc.lng, routeCoords, 1000)
  );
  if (floodIncidents.length > 0) floodRisk = 0.7;
  if (destWeather && destWeather.weather) {
    const main = destWeather.weather[0].main.toLowerCase();
    if (main.includes("rain") || main.includes("thunderstorm")) {
      floodRisk = Math.min(1.0, floodRisk + 0.3);
    }
  }

  // 5) Road condition risk (from user reports)
  let roadConditionRisk = 0;
  const roadIncidents = userIncidents.filter(
    (inc) =>
      (inc.type === "pothole" || inc.type === "construction" || inc.type === "roadblock") &&
      isPointNearRoute(inc.lat, inc.lng, routeCoords, 500)
  );
  if (roadIncidents.length > 0) roadConditionRisk = 0.6;
  if (nearIncidents.some((i) => i.type === "diversion")) roadConditionRisk = Math.min(1.0, roadConditionRisk + 0.3);

  return calculateRiskScore({
    trafficRisk: avgTrafficRisk,
    accidentRisk,
    weatherRisk,
    floodRisk,
    roadConditionRisk,
  });
}

/**
 * Quick traffic flow sampling (fewer samples for speed)
 */
async function getTrafficFlowSamples(routeCoords, maxSamples) {
  const step = Math.max(1, Math.floor(routeCoords.length / maxSamples));
  const indices = [];
  for (let i = 0; i < routeCoords.length; i += step) indices.push(i);
  if (indices[indices.length - 1] !== routeCoords.length - 1) indices.push(routeCoords.length - 1);

  const zoom = 14;
  const requests = indices.map((idx) => {
    const [lat, lng] = routeCoords[idx];
    const url =
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/${zoom}/json` +
      `?key=${TOMTOM_API_KEY}&point=${lat},${lng}&unit=kmph`;
    return fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => {
        if (data && data.flowSegmentData) {
          const fs = data.flowSegmentData;
          if (typeof fs.currentSpeed === "number" && typeof fs.freeFlowSpeed === "number" && fs.freeFlowSpeed > 0) {
            return { idx, ratio: fs.currentSpeed / fs.freeFlowSpeed };
          }
        }
        return null;
      });
  });

  const results = await Promise.all(requests);
  return results.filter(Boolean);
}

function isPointNearRoute(lat, lng, routeCoords, maxDistMeters) {
  if (!routeCoords || routeCoords.length < 2) return false;
  const pt = L.latLng(lat, lng);
  for (const [rlat, rlng] of routeCoords) {
    if (pt.distanceTo(L.latLng(rlat, rlng)) <= maxDistMeters) return true;
  }
  return false;
}

// ====================================================================
// ROUTE OPTIMIZATION
// ====================================================================

/**
 * Final Score = w_time × normalizedTime + w_dist × normalizedDist + w_risk × riskScore
 * Lowest score = best route for given preference
 */
function calculateOptimScore(route, preference) {
  const weights = OPTIMIZATION_WEIGHTS[preference] || OPTIMIZATION_WEIGHTS.balanced;
  return (
    weights.time * route.normalizedTime +
    weights.distance * route.normalizedDistance +
    weights.risk * route.riskScore
  );
}

function normalizeRoutes(routes) {
  if (routes.length === 0) return;
  const maxTime = Math.max(...routes.map((r) => r.durationSec));
  const maxDist = Math.max(...routes.map((r) => r.distanceMeters));
  routes.forEach((r) => {
    r.normalizedTime = maxTime > 0 ? r.durationSec / maxTime : 0;
    r.normalizedDistance = maxDist > 0 ? r.distanceMeters / maxDist : 0;
  });
}

// ====================================================================
// HELPERS
// ====================================================================

function clearRoute() {
  routeSegments.forEach((p) => map.removeLayer(p));
  routeSegments = [];
  currentRouteCoords = null;
  allRouteData = [];
  activeRouteIndex = 0;

  routeIncidentZoneLayer.clearLayers();
  weatherLayer.clearLayers();

  if (routeIncidentWatcher) {
    clearInterval(routeIncidentWatcher);
    routeIncidentWatcher = null;
  }
  if (dynamicRerouteWatcher) {
    clearInterval(dynamicRerouteWatcher);
    dynamicRerouteWatcher = null;
  }

  document.getElementById("route-cards-container").style.display = "none";
  document.getElementById("hazard-alerts").style.display = "none";
}

// ====================================================================
// GEOCODING
// ====================================================================

async function geocodeWithTomTom(place) {
  if (!place) return null;
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(place)}.json?key=${TOMTOM_API_KEY}&countrySet=IN&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;
    const best = data.results[0];
    const { lat, lon } = best.position;
    const label = best.address && best.address.freeformAddress ? best.address.freeformAddress : place;
    return { lat, lon, label };
  } catch (err) {
    console.error("TomTom geocode error:", err);
    return null;
  }
}

// ====================================================================
// OSRM ROUTING
// ====================================================================

async function getOSRMRoutePath(start, end, alternatives = false) {
  const [sLat, sLng] = start;
  const [eLat, eLng] = end;
  const coordinates = `${sLng},${sLat};${eLng},${eLat}`;
  let url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  if (alternatives) url += "&alternatives=true";

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) return null;

    return data.routes.map((r) => ({
      coords: r.geometry.coordinates.map((p) => [p[1], p[0]]),
      distanceMeters: r.distance,
      durationSec: r.duration,
    }));
  } catch (err) {
    console.error("OSRM route fetch error:", err);
    return null;
  }
}

// ====================================================================
// TRAFFIC FLOW SEGMENTS
// ====================================================================

async function getTrafficColoredSegments(routeCoords) {
  if (!routeCoords || routeCoords.length < 2) return null;
  const maxSamples = 30;
  const step = Math.max(1, Math.floor(routeCoords.length / maxSamples));
  const sampleIndices = [];
  for (let i = 0; i < routeCoords.length; i += step) sampleIndices.push(i);
  if (sampleIndices[sampleIndices.length - 1] !== routeCoords.length - 1) sampleIndices.push(routeCoords.length - 1);

  const zoom = 14;
  const requests = sampleIndices.map((idx) => {
    const [lat, lng] = routeCoords[idx];
    const url =
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/${zoom}/json` +
      `?key=${TOMTOM_API_KEY}&point=${lat},${lng}&unit=kmph`;
    return fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => ({ idx, data }));
  });

  let responses;
  try { responses = await Promise.all(requests); } catch (e) { return [{ coords: routeCoords, color: "blue" }]; }

  const samples = [];
  responses.forEach(({ idx, data }) => {
    if (!data || !data.flowSegmentData) return;
    const fs = data.flowSegmentData;
    const ratio = fs.currentSpeed / fs.freeFlowSpeed;
    let color = "green";
    if (ratio < 0.5) color = "red";
    else if (ratio < 0.8) color = "yellow";
    samples.push({ index: idx, color });
  });

  if (samples.length === 0) return [{ coords: routeCoords, color: "blue" }];
  samples.sort((a, b) => a.index - b.index);

  function colorForIndex(i) {
    let chosen = samples[0];
    for (const s of samples) { if (s.index <= i) chosen = s; else break; }
    return chosen.color;
  }

  const coloredSegments = [];
  let currentColor = colorForIndex(0);
  let currentCoords = [routeCoords[0]];
  for (let i = 1; i < routeCoords.length; i++) {
    const thisColor = colorForIndex(i);
    if (thisColor === currentColor) {
      currentCoords.push(routeCoords[i]);
    } else {
      if (currentCoords.length > 1) coloredSegments.push({ coords: currentCoords, color: currentColor });
      currentColor = thisColor;
      currentCoords = [routeCoords[i - 1], routeCoords[i]];
    }
  }
  if (currentCoords.length > 1) coloredSegments.push({ coords: currentCoords, color: currentColor });
  return coloredSegments;
}

// ====================================================================
// WEATHER
// ====================================================================

function isWeatherEnabled() {
  return typeof OPENWEATHER_API_KEY === "string" && OPENWEATHER_API_KEY.trim() !== "" && OPENWEATHER_API_KEY !== "YOUR_OPENWEATHER_API_KEY_HERE";
}

async function getWeatherAtPoint(lat, lon) {
  if (!isWeatherEnabled()) return null;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("OpenWeather fetch error:", err);
    return null;
  }
}

async function showWeatherAlongRoute(routeCoords) {
  weatherLayer.clearLayers();
  if (!routeCoords || !isWeatherEnabled()) return;

  const maxSamples = 8;
  const step = Math.max(1, Math.floor(routeCoords.length / maxSamples));
  const sampleIndices = [];
  for (let i = 0; i < routeCoords.length; i += step) sampleIndices.push(i);
  if (sampleIndices[sampleIndices.length - 1] !== routeCoords.length - 1) sampleIndices.push(routeCoords.length - 1);

  const requests = sampleIndices.map(async (idx) => {
    const [lat, lng] = routeCoords[idx];
    const data = await getWeatherAtPoint(lat, lng);
    return { idx, lat, lng, data };
  });

  let results;
  try { results = await Promise.all(requests); } catch (e) { return; }

  results.forEach((r) => {
    if (!r.data || !r.data.main || !r.data.weather || !r.data.weather[0]) return;
    const temp = r.data.main.temp;
    const cond = r.data.weather[0].main;
    const desc = r.data.weather[0].description;
    const marker = L.circleMarker([r.lat, r.lng], { radius: 6, color: "#0055ff", fillColor: "#88bbff", fillOpacity: 0.8 })
      .addTo(weatherLayer);
    marker.bindPopup(`<b>Weather</b><br/>Temp: ${temp.toFixed(1)} °C<br/>Condition: ${cond}<br/><small>${desc}</small>`);
  });
}

// ====================================================================
// ORBIS INCIDENTS
// ====================================================================

async function fetchLiveIncidentsForViewport() {
  const zoom = map.getZoom();
  if (zoom < 8) {
    orbisIncidentLayer.clearLayers();
    constructionSpeedLayer.clearLayers();
    return;
  }

  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const minLon = sw.lng, minLat = sw.lat, maxLon = ne.lng, maxLat = ne.lat;

  const midLat = (minLat + maxLat) / 2.0;
  const widthKm = Math.abs(maxLon - minLon) * 111.0 * Math.cos((midLat * Math.PI) / 180.0);
  const heightKm = Math.abs(maxLat - minLat) * 111.0;
  if (widthKm * heightKm > 9500) {
    orbisIncidentLayer.clearLayers();
    constructionSpeedLayer.clearLayers();
    return;
  }

  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${TOMTOM_API_KEY}&bbox=${bbox}&timeValidityFilter=present&language=en-GB`;

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const incidents = data.incidents || [];

    orbisIncidentLayer.clearLayers();
    constructionSpeedLayer.clearLayers();

    incidents.forEach((inc) => {
      const geom = inc.geometry;
      if (!geom || !geom.coordinates) return;

      let lon, lat;
      if (geom.type === "Point") {
        if (!Array.isArray(geom.coordinates) || geom.coordinates.length < 2) return;
        [lon, lat] = geom.coordinates;
      } else {
        const coords = geom.coordinates;
        if (!Array.isArray(coords) || coords.length === 0) return;
        [lon, lat] = Array.isArray(coords[0]) ? coords[0] : coords;
        if (typeof lat !== "number" || typeof lon !== "number") return;
      }

      if (!isFinite(lat) || !isFinite(lon)) return;

      const props = inc.properties || {};
      const iconCategory = props.iconCategory;

      const delaySeconds = typeof props.delaySeconds === "number" ? props.delaySeconds : null;
      let delayText = "";
      if (delaySeconds !== null) delayText = `<br/><b>Delay:</b> ${Math.max(1, Math.round(delaySeconds / 60))} min`;

      let clearanceText = "";
      if (props.endTime) {
        const end = new Date(props.endTime);
        clearanceText = `<br/><b>Clears:</b> ${end.toLocaleDateString()} ${end.toLocaleTimeString()}`;
      }

      let logicalType = "incident";
      if (iconCategory === 1) logicalType = "accident";
      else if (iconCategory === 7 || iconCategory === 8 || iconCategory === 9) logicalType = "diversion";

      let typeLabel = "Incident";
      if (logicalType === "accident") typeLabel = "ACCIDENT";
      else if (logicalType === "diversion") typeLabel = "DIVERSION / ROADWORK";

      const popupHtml = `<b>${typeLabel}</b><br/><small>TomTom (cat: ${iconCategory})</small>${delayText}${clearanceText}`;

      let marker;
      if (logicalType === "accident") {
        marker = L.circleMarker([lat, lon], { radius: 7, color: "#ff0000", fillColor: "#cc0000", fillOpacity: 0.9 });
      } else if (logicalType === "diversion") {
        marker = L.marker([lat, lon], {
          icon: L.divIcon({ className: "diversion-icon", html: "🚧", iconSize: [24, 24], iconAnchor: [12, 12] }),
        });
        const speedZone = L.circle([lat, lon], {
          radius: CONSTRUCTION_ZONE_RADIUS_METERS,
          color: "#ff8800", weight: 2, fillColor: "#ffa500", fillOpacity: 0.25,
        }).addTo(constructionSpeedLayer);
        speedZone.bindPopup(`<b>Speed Zone</b><br/>Max: ${CONSTRUCTION_SPEED_LIMIT_KMPH} km/h`);
      } else {
        marker = L.circleMarker([lat, lon], { radius: 5, color: "#666", fillColor: "#999", fillOpacity: 0.8 });
      }

      marker.incidentType = logicalType;
      marker.incidentProps = props;
      marker.bindPopup(popupHtml);
      marker.addTo(orbisIncidentLayer);
    });
  } catch (err) {
    console.error("IncidentDetails Fetch Error:", err);
  }
}

// ====================================================================
// INCIDENT ZONES NEAR ROUTE
// ====================================================================

function highlightIncidentsNearRoute(routeCoords, maxDistanceMeters = 500) {
  routeIncidentZoneLayer.clearLayers();
  const nearIncidents = [];
  if (!routeCoords || routeCoords.length < 2) return nearIncidents;

  const incidentMarkers = [];
  orbisIncidentLayer.eachLayer((layer) => {
    if (typeof layer.getLatLng === "function") incidentMarkers.push(layer);
  });
  if (incidentMarkers.length === 0) return nearIncidents;

  incidentMarkers.forEach((marker) => {
    const latLng = marker.getLatLng();
    if (!latLng) return;

    let minDist = Infinity;
    routeCoords.forEach(([lat, lng]) => {
      const d = L.latLng(lat, lng).distanceTo(latLng);
      if (d < minDist) minDist = d;
    });

    if (minDist <= maxDistanceMeters) {
      const type = marker.incidentType || "incident";
      let color = "#ff00ff", fillColor = "#ff99ff";
      if (type === "accident") { color = "#ff0000"; fillColor = "#ff6666"; }
      else if (type === "diversion") { color = "#ff8800"; fillColor = "#ffbb66"; }
      else if (type === "police") { color = "#0055ff"; fillColor = "#88bbff"; }

      const zoneCircle = L.circle(latLng, { radius: maxDistanceMeters, color, fillColor, fillOpacity: 0.25 });
      const baseContent = marker.getPopup && marker.getPopup() ? marker.getPopup().getContent() : "<b>Incident</b>";
      zoneCircle.bindPopup(`<b>INCIDENT ZONE</b><br/>Within ${maxDistanceMeters}m of route.<br/><br/>${baseContent}`);
      zoneCircle.addTo(routeIncidentZoneLayer);

      nearIncidents.push({ type, latLng, props: marker.incidentProps || null });
    }
  });

  return nearIncidents;
}

// ====================================================================
// USER-REPORTED INCIDENTS
// ====================================================================

function renderUserIncidents() {
  userIncidentLayer.clearLayers();
  const icons = {
    accident: "💥", flood: "🌊", pothole: "🕳️", roadblock: "🚫",
    animal: "🐄", traffic: "🚗", construction: "🚧",
  };

  userIncidents.forEach((inc) => {
    const icon = icons[inc.type] || "⚠️";
    const marker = L.marker([inc.lat, inc.lng], {
      icon: L.divIcon({ className: "user-incident-icon", html: icon, iconSize: [20, 20], iconAnchor: [10, 10] }),
    }).addTo(userIncidentLayer);

    const timeStr = new Date(inc.timestamp).toLocaleString();
    marker.bindPopup(
      `<b>User Report: ${inc.type.toUpperCase()}</b><br/>` +
      `Severity: ${inc.severity}<br/>` +
      `Time: ${timeStr}<br/>` +
      `${inc.description ? `<small>${inc.description}</small>` : ""}`
    );
  });
}

function saveUserIncidents() {
  localStorage.setItem("route360_incidents", JSON.stringify(userIncidents));
}

// ====================================================================
// ROUTE CARDS
// ====================================================================

function renderRouteCards(routes, activeIdx) {
  const container = document.getElementById("route-cards-container");
  const cardsDiv = document.getElementById("route-cards");
  container.style.display = "block";
  cardsDiv.innerHTML = "";

  routes.forEach((route, idx) => {
    const km = (route.distanceMeters / 1000).toFixed(1);
    const min = Math.round(route.durationSec / 60);
    const riskLabel = riskLevelLabel(route.riskScore);
    const riskCls = riskLevelClass(route.riskScore);

    const card = document.createElement("div");
    card.className = "route-card" + (idx === activeIdx ? " selected" : "");
    card.innerHTML = `
      <div class="route-header">
        <span class="route-label">${idx === 0 ? "Recommended" : `Alternative ${idx}`}</span>
        <span class="risk-badge ${riskCls}">${riskLabel}</span>
      </div>
      <div class="route-details">
        <span>📏 ${km} km</span>
        <span>⏱️ ~${min} min</span>
        <span>🎯 Risk: ${(route.riskScore * 100).toFixed(0)}%</span>
        <span>🚗 Score: ${route.optimScore.toFixed(3)}</span>
      </div>
    `;
    card.addEventListener("click", () => selectRoute(idx));
    cardsDiv.appendChild(card);
  });
}

function selectRoute(idx) {
  activeRouteIndex = idx;
  const route = allRouteData[idx];
  if (!route || !route.coords) return;

  // Clear existing route segments
  routeSegments.forEach((p) => map.removeLayer(p));
  routeSegments = [];

  // Draw selected route
  const polyline = L.polyline(route.coords, { color: riskColor(route.riskScore), weight: 7, opacity: 0.8 }).addTo(map);
  routeSegments.push(polyline);

  map.fitBounds(L.latLngBounds(route.coords));
  currentRouteCoords = route.coords;

  renderRouteCards(allRouteData, idx);

  // Re-check incidents for this route
  const nearIncidents = highlightIncidentsNearRoute(route.coords, 500);
  updateHazardAlerts(nearIncidents, route);
}

// ====================================================================
// HAZARD ALERTS
// ====================================================================

function updateHazardAlerts(nearIncidents, route) {
  const container = document.getElementById("hazard-alerts");
  const list = document.getElementById("hazard-alert-list");

  const alerts = [];

  nearIncidents.forEach((inc) => {
    let level = "medium";
    let msg = "";
    if (inc.type === "accident") {
      level = "high";
      msg = "Accident reported ahead";
    } else if (inc.type === "diversion") {
      level = "medium";
      msg = "Road construction / diversion ahead";
    } else {
      level = "low";
      msg = "Incident nearby";
    }

    if (inc.props && typeof inc.props.delaySeconds === "number") {
      msg += ` (delay: ~${Math.round(inc.props.delaySeconds / 60)} min)`;
    }
    alerts.push({ level, msg });
  });

  // Add weather-based alerts
  if (route && route.weatherRisk > 0.5) {
    alerts.push({ level: "medium", msg: "Adverse weather conditions along route" });
  }
  if (route && route.floodRisk > 0.5) {
    alerts.push({ level: "high", msg: "Flood risk detected on route" });
  }

  if (alerts.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  list.innerHTML = alerts
    .map((a) => `<div class="hazard-alert-item alert-${a.level}">${a.level === "high" ? "🔴" : a.level === "medium" ? "🟡" : "🟢"} ${a.msg}</div>`)
    .join("");
}

// ====================================================================
// DYNAMIC REROUTING
// ====================================================================

function startDynamicRerouting(startLatLng, endLatLng, endLabel) {
  if (dynamicRerouteWatcher) clearInterval(dynamicRerouteWatcher);

  dynamicRerouteWatcher = setInterval(async () => {
    if (!currentRouteCoords) return;

    await fetchLiveIncidentsForViewport();
    const nearIncidents = highlightIncidentsNearRoute(currentRouteCoords, 500);

    // Check if current route risk changed significantly
    if (nearIncidents.length >= 3) {
      const statusSpan = document.getElementById("tomtom-search-status");
      if (statusSpan) {
        statusSpan.innerHTML = `<b>Dynamic Reroute:</b> Multiple incidents detected. Recalculating...`;
        statusSpan.style.color = "#ffc107";
      }

      const altRoutes = await getOSRMRoutePath(startLatLng, endLatLng, true);
      if (altRoutes && altRoutes.length > 1) {
        const statusSpan2 = document.getElementById("tomtom-search-status");
        if (statusSpan2) {
          statusSpan2.innerHTML = `<b>Dynamic Reroute:</b> Better route may be available. Check route cards.`;
          statusSpan2.style.color = "#28a745";
        }
      }
    }
  }, 20000);
}

// ====================================================================
// MAIN ROUTE FINDER
// ====================================================================

const statusSpan = document.getElementById("tomtom-search-status");

// ====================================================================
// BACKEND CLIENT (optional – uses /api/routes when backend is running)
// ====================================================================
const BACKEND_URL = (window.CONFIG && window.CONFIG.BACKEND_URL) || "http://localhost:3001";

async function backendAvailable() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${BACKEND_URL}/`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Try to plan the route via the Node.js backend (/api/routes).
 * Returns null if the backend is unreachable or errors, so the
 * caller can fall back to the direct browser-API approach.
 */
async function tryBackendRoute(startText, endText) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${BACKEND_URL}/api/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: startText,
        destination: endText,
        mode: selectedTravelMode,
        priority: selectedPreference,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    return data;
  } catch (err) {
    console.warn("Backend route planning unavailable, falling back to direct APIs.", err);
    return null;
  }
}

/**
 * Render routes received from the backend (/api/routes response).
 * Backend returns routes with riskScore, riskLevel, coordinates, etc.
 */
function renderBackendRoutes(data, endLabel) {
  const startLatLng = data.origin.latLng || [data.origin.lat, data.origin.lon];
  const endLatLng = data.destination.latLng || [data.destination.lat, data.destination.lon];

  allRouteData = data.routes.map((r) => ({
    coords: r.coordinates,
    distanceMeters: r.distanceKm * 1000,
    durationSec: r.etaMinutes * 60,
    riskScore: r.riskScore,
    riskLevel: r.riskLevel,
    optimScore: r.riskScore, // backend already sorts; keep stable
    nearIncidents: [],
    fromBackend: true,
  }));

  // Backend already ordered best-first; set optimized score by index
  allRouteData.forEach((r, i) => { r.optimScore = i; });

  activeRouteIndex = 0;
  const bestRoute = allRouteData[0];

  // Draw best route coloured by risk
  const polyline = L.polyline(bestRoute.coords, {
    color: riskColor(bestRoute.riskScore),
    weight: 6,
    opacity: 0.8,
  }).addTo(map);
  routeSegments.push(polyline);

  // Start/End markers
  L.marker(startLatLng).addTo(map).bindPopup("Start Location").openPopup();
  L.marker(endLatLng)
    .addTo(map)
    .bindPopup(`Destination: ${endLabel}`)
    .openPopup();

  map.fitBounds(L.latLngBounds(bestRoute.coords));
  currentRouteCoords = bestRoute.coords;

  renderRouteCards(allRouteData, 0);
  updateHazardAlerts([], bestRoute);

  if (statusSpan) {
    const km = (bestRoute.distanceMeters / 1000).toFixed(1);
    const min = Math.round(bestRoute.durationSec / 60);
    statusSpan.innerHTML =
      `<b>Route (backend / ML):</b> ${km} km, ETA ~${min} min<br/>` +
      `<b>Risk:</b> ${bestRoute.riskLevel} (${(bestRoute.riskScore * 100).toFixed(0)}%)<br/>` +
      `<i>${allRouteData.length} route(s) ranked by the Node.js backend.</i>`;
    statusSpan.style.color = "#198754";
  }

  // Keep a live watcher refresh of incidents from the browser as well
  if (routeIncidentWatcher) clearInterval(routeIncidentWatcher);
  routeIncidentWatcher = setInterval(async () => {
    await fetchLiveIncidentsForViewport();
    if (currentRouteCoords && currentRouteCoords.length > 1) {
      highlightIncidentsNearRoute(currentRouteCoords, 500);
    }
  }, 15000);
}

async function findAndDisplayRoute() {
  const startInput = document.getElementById("tomtom-start-input");
  const endInput = document.getElementById("tomtom-end-input");
  const startText = startInput ? startInput.value.trim() : "";
  const endText = endInput ? endInput.value.trim() : "";

  if (!startText || !endText) {
    if (statusSpan) {
      statusSpan.textContent = "Please enter both start and destination.";
      statusSpan.style.color = "#dc3545";
    }
    return;
  }

  clearRoute();

  // ---- Try the Node.js backend first (ML risk + optimization server-side) ----
  if (await backendAvailable()) {
    if (statusSpan) {
      statusSpan.textContent = "Planning via Route 360 backend (ML risk engine)...";
      statusSpan.style.color = "#007bff";
    }
    const backendData = await tryBackendRoute(startText, endText);
    if (backendData && backendData.routes && backendData.routes.length > 0) {
      await renderBackendRoutes(backendData, endText);
      return;
    }
  }

  // ---- Fallback: direct browser APIs (works even without the backend) ----

  // Step 1: Geocode
  if (statusSpan) {
    statusSpan.textContent = "Step 1/5: Geocoding locations...";
    statusSpan.style.color = "#007bff";
  }

  const [startRes, endRes] = await Promise.all([
    geocodeWithTomTom(startText),
    geocodeWithTomTom(endText),
  ]);

  if (!startRes || !endRes) {
    if (statusSpan) {
      statusSpan.textContent = "Geocoding failed for one or both locations.";
      statusSpan.style.color = "#dc3545";
    }
    return;
  }

  const startLatLng = [startRes.lat, startRes.lon];
  const endLatLng = [endRes.lat, endRes.lon];

  // Step 2: Get routes (primary + alternatives)
  if (statusSpan) {
    statusSpan.textContent = "Step 2/5: Calculating routes (OSRM)...";
    statusSpan.style.color = "#007bff";
  }

  const osrmRoutes = await getOSRMRoutePath(startLatLng, endLatLng, true);
  if (!osrmRoutes || osrmRoutes.length === 0) {
    if (statusSpan) {
      statusSpan.textContent = "Failed to get route from OSRM.";
      statusSpan.style.color = "#dc3545";
    }
    return;
  }

  // Step 3: Incidents + Weather
  if (statusSpan) {
    statusSpan.textContent = "Step 3/5: Fetching incidents & weather...";
    statusSpan.style.color = "#007bff";
  }

  await fetchLiveIncidentsForViewport();
  let destWeather = null;
  if (isWeatherEnabled()) {
    destWeather = await getWeatherAtPoint(endLatLng[0], endLatLng[1]);
    await showWeatherAlongRoute(osrmRoutes[0].coords);
  }

  // Step 4: Calculate risk for each route
  if (statusSpan) {
    statusSpan.textContent = "Step 4/5: Calculating risk scores...";
    statusSpan.style.color = "#007bff";
  }

  allRouteData = [];
  for (let i = 0; i < osrmRoutes.length; i++) {
    const route = osrmRoutes[i];
    const nearIncidents = highlightIncidentsNearRoute(route.coords, 500);
    const riskScore = await calculateRouteRisk(route.coords, nearIncidents, destWeather);

    // Store extra risk component data for alerts
    allRouteData.push({
      ...route,
      riskScore,
      nearIncidents,
      weatherRisk: destWeather ? weatherDataToRisk(destWeather) : 0.2,
      floodRisk: userIncidents.some(
        (inc) => inc.type === "flood" && isPointNearRoute(inc.lat, inc.lng, route.coords, 1000)
      ) ? 0.7 : 0,
    });
  }

  // Step 5: Rank routes by preference
  if (statusSpan) {
    statusSpan.textContent = "Step 5/5: Optimizing routes...";
    statusSpan.style.color = "#007bff";
  }

  normalizeRoutes(allRouteData);
  allRouteData.forEach((r) => {
    r.optimScore = calculateOptimScore(r, selectedPreference);
  });

  // Sort by optim score (lower = better)
  allRouteData.sort((a, b) => a.optimScore - b.optimScore);

  // Select the best route
  activeRouteIndex = 0;
  const bestRoute = allRouteData[0];

  // Draw best route
  const coloredSegments = await getTrafficColoredSegments(bestRoute.coords);
  if (coloredSegments && coloredSegments.length > 0) {
    coloredSegments.forEach((seg) => {
      const polyline = L.polyline(seg.coords, { color: seg.color, weight: 6, opacity: 0.7 }).addTo(map);
      routeSegments.push(polyline);
    });
  } else {
    const polyline = L.polyline(bestRoute.coords, { color: "blue", weight: 6, opacity: 0.7 }).addTo(map);
    routeSegments.push(polyline);
  }

  // Start/End markers
  L.marker(startLatLng).addTo(map).bindPopup("Start Location").openPopup();
  L.marker(endLatLng).addTo(map).bindPopup(`Destination: ${endRes.label}`).openPopup();

  map.fitBounds(L.latLngBounds(bestRoute.coords));
  currentRouteCoords = bestRoute.coords;

  // Render route cards
  renderRouteCards(allRouteData, 0);

  // Hazard alerts
  const nearIncidents = highlightIncidentsNearRoute(bestRoute.coords, 500);
  updateHazardAlerts(nearIncidents, bestRoute);

  // Dynamic rerouting
  startDynamicRerouting(startLatLng, endLatLng, endRes.label);

  // Periodic incident refresh
  if (routeIncidentWatcher) clearInterval(routeIncidentWatcher);
  routeIncidentWatcher = setInterval(async () => {
    await fetchLiveIncidentsForViewport();
    if (currentRouteCoords && currentRouteCoords.length > 1) {
      highlightIncidentsNearRoute(currentRouteCoords, 500);
    }
  }, 15000);

  // Final status
  if (statusSpan) {
    const km = (bestRoute.distanceMeters / 1000).toFixed(1);
    const min = Math.round(bestRoute.durationSec / 60);
    const riskLabel = riskLevelLabel(bestRoute.riskScore);

    let msg =
      `<b>Route Found!</b> Distance: ${km} km, ETA: ~${min} min<br/>` +
      `<b>Risk Level:</b> ${riskLabel} (${(bestRoute.riskScore * 100).toFixed(0)}%)<br/>` +
      `<b>Preference:</b> ${selectedPreference.charAt(0).toUpperCase() + selectedPreference.slice(1)} | ` +
      `<b>Mode:</b> ${selectedTravelMode.charAt(0).toUpperCase() + selectedTravelMode.slice(1)}`;

    if (allRouteData.length > 1) {
      msg += `<br/><i>${allRouteData.length} routes compared. See route cards below.</i>`;
    }

    if (nearIncidents.length > 0) {
      msg += `<br/>⚠️ ${nearIncidents.length} incident(s) near route.`;
    }

    statusSpan.innerHTML = msg;
    statusSpan.style.color = "#198754";
  }
}

// ====================================================================
// UI EVENT HANDLERS
// ====================================================================

// Find Route button
document.getElementById("find-route-btn").addEventListener("click", findAndDisplayRoute);

// Clear button
document.getElementById("clear-route-btn").addEventListener("click", () => {
  clearRoute();
  orbisIncidentLayer.clearLayers();
  constructionSpeedLayer.clearLayers();
  routeIncidentZoneLayer.clearLayers();
  if (statusSpan) {
    statusSpan.textContent = "Map & route cleared.";
    statusSpan.style.color = "#007bff";
  }
});

// Travel mode buttons
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedTravelMode = btn.dataset.mode;
  });
});

// Route preference buttons
document.querySelectorAll(".pref-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pref-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPreference = btn.dataset.pref;
  });
});

// Locate me button
document.getElementById("locate-btn").addEventListener("click", () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 14);
        L.marker([latitude, longitude]).addTo(map).bindPopup("📍 You are here").openPopup();
      },
      () => {
        if (statusSpan) {
          statusSpan.textContent = "Could not get your location.";
          statusSpan.style.color = "#dc3545";
        }
      }
    );
  }
});

// Traffic toggle
document.getElementById("traffic-toggle-btn").addEventListener("click", function () {
  const active = this.classList.toggle("active");
  if (active) {
    tomtomTrafficFlowTiles.addTo(map);
    tomtomTrafficIncidentTiles.addTo(map);
  } else {
    map.removeLayer(tomtomTrafficFlowTiles);
    map.removeLayer(tomtomTrafficIncidentTiles);
  }
});

// Weather toggle
document.getElementById("weather-toggle-btn").addEventListener("click", function () {
  const active = this.classList.toggle("active");
  if (active) {
    weatherLayer.addTo(map);
  } else {
    map.removeLayer(weatherLayer);
  }
});

// Report Incident Modal
document.getElementById("report-incident-btn").addEventListener("click", () => {
  document.getElementById("incident-modal").style.display = "flex";
});

document.getElementById("cancel-incident-btn").addEventListener("click", () => {
  document.getElementById("incident-modal").style.display = "none";
});

// Click map to set incident location
let incidentClickMode = false;
document.getElementById("report-incident-btn").addEventListener("click", () => {
  incidentClickMode = true;
});

map.on("click", (e) => {
  if (!incidentClickMode) return;
  const { lat, lng } = e.latlng;
  document.getElementById("incident-location").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  document.getElementById("incident-location").dataset.lat = lat;
  document.getElementById("incident-location").dataset.lng = lng;
  incidentClickMode = false;
});

// Submit incident
document.getElementById("submit-incident-btn").addEventListener("click", () => {
  const type = document.getElementById("incident-type").value;
  const severity = document.getElementById("incident-severity").value;
  const locInput = document.getElementById("incident-location");
  const description = document.getElementById("incident-desc").value;

  const lat = parseFloat(locInput.dataset.lat);
  const lng = parseFloat(locInput.dataset.lng);

  if (isNaN(lat) || isNaN(lng)) {
    alert("Please click on the map to set the incident location.");
    return;
  }

  const incident = {
    id: Date.now(),
    type,
    severity,
    lat,
    lng,
    description,
    timestamp: new Date().toISOString(),
  };

  userIncidents.push(incident);
  saveUserIncidents();
  renderUserIncidents();

  // Reset form
  document.getElementById("incident-modal").style.display = "none";
  locInput.value = "";
  locInput.dataset.lat = "";
  locInput.dataset.lng = "";
  document.getElementById("incident-desc").value = "";

  if (statusSpan) {
    statusSpan.innerHTML = `<b>Incident Reported:</b> ${type} (${severity}) at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    statusSpan.style.color = "#198754";
  }
});

// ====================================================================
// INITIAL SETUP
// ====================================================================

map.whenReady(() => {
  console.log("Route 360 loaded – Safe + Optimal + Adaptive Route Planner");
  fetchLiveIncidentsForViewport();
  renderUserIncidents();
  map.on("moveend", fetchLiveIncidentsForViewport);
  setInterval(fetchLiveIncidentsForViewport, 30000);
});
