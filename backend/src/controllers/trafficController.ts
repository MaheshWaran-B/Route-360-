import { Request, Response } from "express";
import { fetchTrafficFlow, fetchIncidents } from "../services/apiClients";

export async function getTraffic(req: Request, res: Response) {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: "lat and lon query params are required" });
    }

    const data = await fetchTrafficFlow(parseFloat(lat as string), parseFloat(lon as string));
    if (!data) {
      return res.status(404).json({ error: "Traffic data not found" });
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getIncidents(req: Request, res: Response) {
  try {
    const { minLon, minLat, maxLon, maxLat } = req.query;
    if (!minLon || !minLat || !maxLon || !maxLat) {
      return res.status(400).json({ error: "Bounding box params required: minLon, minLat, maxLon, maxLat" });
    }

    const bbox = {
      minLon: parseFloat(minLon as string),
      minLat: parseFloat(minLat as string),
      maxLon: parseFloat(maxLon as string),
      maxLat: parseFloat(maxLat as string),
    };

    // Area check (TomTom limit: 10,000 km²)
    const midLat = (bbox.minLat + bbox.maxLat) / 2;
    const widthKm = Math.abs(bbox.maxLon - bbox.minLon) * 111 * Math.cos((midLat * Math.PI) / 180);
    const heightKm = Math.abs(bbox.maxLat - bbox.minLat) * 111;
    if (widthKm * heightKm > 9500) {
      return res.status(400).json({ error: "Bounding box exceeds 10,000 km² limit" });
    }

    const incidents = await fetchIncidents(bbox);
    res.json({ incidents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
