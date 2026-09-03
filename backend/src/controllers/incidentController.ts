import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

interface UserIncident {
  id: string;
  type: string;
  severity: string;
  lat: number;
  lng: number;
  description: string;
  timestamp: string;
  status: string;
}

// In-memory store (replace with MongoDB in production)
const incidents: UserIncident[] = [];

export async function reportIncident(req: Request, res: Response) {
  try {
    const { type, severity, lat, lng, description = "" } = req.body;

    if (!type || !severity || lat == null || lng == null) {
      return res.status(400).json({ error: "type, severity, lat, lng are required" });
    }

    const validTypes = ["accident", "flood", "pothole", "roadblock", "animal", "traffic", "construction"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    }

    const validSeverities = ["low", "medium", "high", "critical"];
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` });
    }

    const incident: UserIncident = {
      id: uuidv4(),
      type,
      severity,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      description,
      timestamp: new Date().toISOString(),
      status: "active",
    };

    incidents.push(incident);
    console.log(`Incident reported: ${type} (${severity}) at ${lat}, ${lng}`);

    res.status(201).json({ success: true, incident });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getIncidents(req: Request, res: Response) {
  try {
    const { type, severity, status = "active" } = req.query;

    let filtered = incidents.filter((i) => i.status === status);
    if (type) filtered = filtered.filter((i) => i.type === type);
    if (severity) filtered = filtered.filter((i) => i.severity === severity);

    res.json({ incidents: filtered, total: filtered.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
