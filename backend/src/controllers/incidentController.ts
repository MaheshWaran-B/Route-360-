import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { Incident } from "../models/Incident";

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

// In-memory store (used when MongoDB is not connected)
const incidents: UserIncident[] = [];

const dbConnected = () => mongoose.connection.readyState === 1;

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

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    // Persist to MongoDB when available
    if (dbConnected()) {
      const doc = await Incident.create({
        type,
        severity,
        lat: latNum,
        lng: lngNum,
        description,
        status: "active",
      });
      console.log(`Incident saved to Mongo: ${type} (${severity}) at ${latNum}, ${lngNum}`);
      return res.status(201).json({
        success: true,
        incident: {
          id: doc._id.toString(),
          type: doc.type,
          severity: doc.severity,
          lat: doc.lat,
          lng: doc.lng,
          description: doc.description,
          timestamp: doc.timestamp.toISOString(),
          status: doc.status,
        },
        storage: "mongodb",
      });
    }

    // Fallback: in-memory
    const incident: UserIncident = {
      id: uuidv4(),
      type,
      severity,
      lat: latNum,
      lng: lngNum,
      description,
      timestamp: new Date().toISOString(),
      status: "active",
    };

    incidents.push(incident);
    console.log(`Incident stored in memory: ${type} (${severity}) at ${latNum}, ${lngNum}`);

    res.status(201).json({ success: true, incident, storage: "memory" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getIncidents(req: Request, res: Response) {
  try {
    const { type, severity, status = "active" } = req.query;

    // Query MongoDB when available
    if (dbConnected()) {
      const query: Record<string, any> = { status };
      if (type) query.type = type;
      if (severity) query.severity = severity;

      const docs = await Incident.find(query).sort({ timestamp: -1 }).limit(200).lean();
      const result = docs.map((d) => ({
        id: d._id.toString(),
        type: d.type,
        severity: d.severity,
        lat: d.lat,
        lng: d.lng,
        description: d.description,
        timestamp: d.timestamp.toISOString(),
        status: d.status,
      }));
      return res.json({ incidents: result, total: result.length, storage: "mongodb" });
    }

    let filtered = incidents.filter((i) => i.status === status);
    if (type) filtered = filtered.filter((i) => i.type === type);
    if (severity) filtered = filtered.filter((i) => i.severity === severity);

    res.json({ incidents: filtered, total: filtered.length, storage: "memory" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
