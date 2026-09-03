import { Request, Response } from "express";
import { geocodeWithTomTom, getOSRMRoute, getOSRMAlternatives } from "../services/apiClients";
import { calculateRouteRisk } from "../services/riskEngine";
import { optimizeRoute } from "../services/routeOptimizer";

export async function calculateRoute(req: Request, res: Response) {
  try {
    const { origin, destination, mode = "car", priority = "balanced" } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ error: "origin and destination are required" });
    }

    // 1. Geocode
    const [startGeo, endGeo] = await Promise.all([
      geocodeWithTomTom(origin),
      geocodeWithTomTom(destination),
    ]);

    if (!startGeo || !endGeo) {
      return res.status(404).json({ error: "Could not geocode one or both locations" });
    }

    const startLatLng: [number, number] = [startGeo.lat, startGeo.lon];
    const endLatLng: [number, number] = [endGeo.lat, endGeo.lon];

    // 2. Get multiple routes
    const routes = await getOSRMAlternatives(startLatLng, endLatLng);
    if (!routes || routes.length === 0) {
      return res.status(504).json({ error: "Could not calculate routes" });
    }

    // 3. Risk assessment for each route
    const riskAssessments = await Promise.all(
      routes.map((route) => calculateRouteRisk(route.coords, endLatLng))
    );

    // 4. Combine route data with risk
    const enrichedRoutes = routes.map((route, idx) => ({
      ...route,
      riskScore: riskAssessments[idx].totalRisk,
      riskBreakdown: riskAssessments[idx],
    }));

    // 5. Optimize based on preference
    const ranked = optimizeRoute(enrichedRoutes, priority as string);

    res.json({
      origin: { ...startGeo, latLng: startLatLng },
      destination: { ...endGeo, latLng: endLatLng },
      routes: ranked.map((r, idx) => ({
        index: idx,
        distanceKm: +(r.distanceMeters / 1000).toFixed(1),
        etaMinutes: Math.round(r.durationSec / 60),
        riskScore: +r.riskScore.toFixed(3),
        riskLevel: r.riskScore < 0.25 ? "SAFE" : r.riskScore < 0.5 ? "MODERATE" : r.riskScore < 0.75 ? "HIGH" : "CRITICAL",
        riskBreakdown: r.riskBreakdown,
        coordinates: r.coords,
      })),
      recommended: 0,
      travelMode: mode,
      preference: priority,
    });
  } catch (err: any) {
    console.error("Route calculation error:", err);
    res.status(500).json({ error: "Route calculation failed", message: err.message });
  }
}

export async function getAlternativeRoutes(req: Request, res: Response) {
  try {
    const { origin, destination } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ error: "origin and destination are required" });
    }

    const [startGeo, endGeo] = await Promise.all([
      geocodeWithTomTom(origin),
      geocodeWithTomTom(destination),
    ]);

    if (!startGeo || !endGeo) {
      return res.status(404).json({ error: "Geocoding failed" });
    }

    const routes = await getOSRMAlternatives(
      [startGeo.lat, startGeo.lon],
      [endGeo.lat, endGeo.lon]
    );

    res.json({ routes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function reroute(req: Request, res: Response) {
  try {
    const { origin, destination, mode, priority, currentRisk } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({ error: "origin and destination are required" });
    }

    // Re-run route calculation with higher safety weight
    const adjustedPriority = currentRisk === "CRITICAL" || currentRisk === "HIGH" ? "safest" : priority;

    const [startGeo, endGeo] = await Promise.all([
      geocodeWithTomTom(origin),
      geocodeWithTomTom(destination),
    ]);

    if (!startGeo || !endGeo) {
      return res.status(404).json({ error: "Geocoding failed" });
    }

    const startLatLng: [number, number] = [startGeo.lat, startGeo.lon];
    const endLatLng: [number, number] = [endGeo.lat, endGeo.lon];

    const routes = await getOSRMAlternatives(startLatLng, endLatLng);
    if (!routes || routes.length === 0) {
      return res.status(504).json({ error: "Could not calculate routes" });
    }

    const riskAssessments = await Promise.all(
      routes.map((route) => calculateRouteRisk(route.coords, endLatLng))
    );

    const enrichedRoutes = routes.map((route, idx) => ({
      ...route,
      riskScore: riskAssessments[idx].totalRisk,
      riskBreakdown: riskAssessments[idx],
    }));

    const ranked = optimizeRoute(enrichedRoutes, adjustedPriority);

    res.json({
      rerouted: true,
      adjustedPreference: adjustedPriority,
      routes: ranked.map((r, idx) => ({
        index: idx,
        distanceKm: +(r.distanceMeters / 1000).toFixed(1),
        etaMinutes: Math.round(r.durationSec / 60),
        riskScore: +r.riskScore.toFixed(3),
        riskLevel: r.riskScore < 0.25 ? "SAFE" : r.riskScore < 0.5 ? "MODERATE" : r.riskScore < 0.75 ? "HIGH" : "CRITICAL",
        coordinates: r.coords,
      })),
      recommended: 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
