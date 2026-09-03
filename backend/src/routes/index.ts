import { Router } from "express";
import {
  calculateRoute,
  getAlternativeRoutes,
  reroute,
} from "../controllers/routeController";
import {
  getWeather,
  getWeatherAlongRoute,
} from "../controllers/weatherController";
import {
  getTraffic,
  getIncidents,
} from "../controllers/trafficController";
import {
  reportIncident,
  getIncidents as getUserIncidents,
} from "../controllers/incidentController";
import {
  predictRisk,
} from "../controllers/mlController";
import {
  getSafeZones,
} from "../controllers/safeZoneController";

export const apiRoutes = Router();

// Route planning
apiRoutes.post("/routes", calculateRoute);
apiRoutes.post("/routes/alternatives", getAlternativeRoutes);
apiRoutes.post("/routes/reroute", reroute);

// Weather
apiRoutes.get("/weather", getWeather);
apiRoutes.post("/weather/route", getWeatherAlongRoute);

// Traffic
apiRoutes.get("/traffic", getTraffic);
apiRoutes.get("/incidents", getIncidents);

// User-reported incidents
apiRoutes.post("/report", reportIncident);
apiRoutes.get("/hazards", getUserIncidents);

// ML risk prediction
apiRoutes.post("/ml/predict", predictRisk);

// Safe zones
apiRoutes.get("/safe-zones", getSafeZones);
