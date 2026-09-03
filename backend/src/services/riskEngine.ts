// ====================================================================
// Risk Engine – Weighted multi-factor risk scoring
// ====================================================================

import { fetchTrafficFlow, fetchIncidents, fetchWeather } from "./apiClients";

const RISK_WEIGHTS = {
  traffic: 0.25,
  accident: 0.30,
  weather: 0.20,
  flood: 0.15,
  roadCondition: 0.10,
};

interface RiskResult {
  totalRisk: number;
  trafficRisk: number;
  accidentRisk: number;
  weatherRisk: number;
  floodRisk: number;
  roadConditionRisk: number;
}

/**
 * Calculate risk for a route given coordinates and destination.
 * Samples traffic flow at intervals and fetches weather at destination.
 */
export async function calculateRouteRisk(
  routeCoords: [number, number][],
  destLatLng: [number, number]
): Promise<RiskResult> {
  // 1) Traffic risk – sample along route
  let avgTrafficRisk = 0.3;
  try {
    const maxSamples = 10;
    const step = Math.max(1, Math.floor(routeCoords.length / maxSamples));
    const indices: number[] = [];
    for (let i = 0; i < routeCoords.length; i += step) indices.push(i);
    if (indices[indices.length - 1] !== routeCoords.length - 1) indices.push(routeCoords.length - 1);

    const flowResults = await Promise.all(
      indices.map(async (idx) => {
        const [lat, lon] = routeCoords[idx];
        const flow = await fetchTrafficFlow(lat, lon);
        if (flow && typeof flow.currentSpeed === "number" && typeof flow.freeFlowSpeed === "number" && flow.freeFlowSpeed > 0) {
          return flow.currentSpeed / flow.freeFlowSpeed;
        }
        return null;
      })
    );

    const ratios = flowResults.filter((r): r is number => r !== null);
    if (ratios.length > 0) {
      avgTrafficRisk = 1 - ratios.reduce((a, b) => a + b, 0) / ratios.length;
    }
  } catch {
    // Use default
  }

  // 2) Accident/incident risk – check near route
  let accidentRisk = 0;
  try {
    // Build bounding box from route
    const lats = routeCoords.map((c) => c[0]);
    const lngs = routeCoords.map((c) => c[1]);
    const bbox = {
      minLon: Math.min(...lngs),
      minLat: Math.min(...lats),
      maxLon: Math.max(...lngs),
      maxLat: Math.max(...lats),
    };

    const incidents = await fetchIncidents(bbox);
    let nearCount = 0;
    let hasDelay = false;

    for (const inc of incidents) {
      if (!inc.geometry?.coordinates) continue;
      let incLat: number, incLng: number;
      if (inc.geometry.type === "Point") {
        [incLng, incLat] = inc.geometry.coordinates;
      } else {
        const coords = inc.geometry.coordinates;
        if (Array.isArray(coords[0])) {
          [incLng, incLat] = coords[0];
        } else {
          [incLng, incLat] = coords;
        }
      }

      // Check if near route (within 500m)
      for (const [rlat, rlng] of routeCoords) {
        const dist = haversineDistance(rlat, rlng, incLat, incLng) * 1000;
        if (dist <= 500) {
          nearCount++;
          if (typeof inc.properties?.delaySeconds === "number") hasDelay = true;
          break;
        }
      }
    }

    if (nearCount === 0) accidentRisk = 0;
    else if (nearCount === 1) accidentRisk = 0.3;
    else if (nearCount <= 3) accidentRisk = 0.5;
    else if (nearCount <= 5) accidentRisk = 0.7;
    else accidentRisk = 0.9;

    if (hasDelay) accidentRisk = Math.min(1, accidentRisk + 0.2);
  } catch {
    // Use default
  }

  // 3) Weather risk
  let weatherRisk = 0.2;
  let floodRisk = 0.1;
  try {
    const weather = await fetchWeather(destLatLng[0], destLatLng[1]);
    if (weather?.weather?.[0]) {
      const main = weather.weather[0].main.toLowerCase();
      const visibility = weather.visibility || 10000;
      const windSpeed = weather.wind?.speed || 0;
      const rain = weather.rain?.["1h"] || weather.rain?.["3h"] || 0;

      if (main.includes("thunderstorm")) weatherRisk = 0.8;
      else if (main.includes("rain")) weatherRisk = 0.5;
      else if (main.includes("snow")) weatherRisk = 0.7;
      else if (main.includes("fog") || main.includes("mist")) weatherRisk = 0.4;
      else weatherRisk = 0.1;

      if (visibility < 500) weatherRisk = Math.max(weatherRisk, 0.6);
      if (windSpeed > 15) weatherRisk = Math.max(weatherRisk, 0.7);

      if (main.includes("rain") || main.includes("thunderstorm")) {
        floodRisk = Math.min(1, floodRisk + 0.4);
      }
      if (rain > 10) floodRisk = Math.min(1, floodRisk + 0.3);
    }
  } catch {
    // Use default
  }

  // 4) Road condition risk (placeholder – would use road condition API/data)
  const roadConditionRisk = 0.2;

  // Calculate weighted total
  const totalRisk =
    RISK_WEIGHTS.traffic * clamp(avgTrafficRisk, 0, 1) +
    RISK_WEIGHTS.accident * clamp(accidentRisk, 0, 1) +
    RISK_WEIGHTS.weather * clamp(weatherRisk, 0, 1) +
    RISK_WEIGHTS.flood * clamp(floodRisk, 0, 1) +
    RISK_WEIGHTS.roadCondition * clamp(roadConditionRisk, 0, 1);

  return {
    totalRisk: clamp(totalRisk, 0, 1),
    trafficRisk: clamp(avgTrafficRisk, 0, 1),
    accidentRisk: clamp(accidentRisk, 0, 1),
    weatherRisk: clamp(weatherRisk, 0, 1),
    floodRisk: clamp(floodRisk, 0, 1),
    roadConditionRisk: clamp(roadConditionRisk, 0, 1),
  };
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
