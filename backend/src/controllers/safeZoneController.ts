import { Request, Response } from "express";

// Static safe zone data (replace with DB query in production)
const safeZones = [
  { id: 1, name: "Chennai Central Hospital", type: "hospital", lat: 13.0827, lng: 80.2707 },
  { id: 2, name: "Guindy Police Station", type: "police", lat: 12.9815, lng: 80.2216 },
  { id: 3, name: "Adyar Fire Station", type: "fire_station", lat: 13.0063, lng: 80.2574 },
  { id: 4, name: "Apollo Hospital Chennai", type: "hospital", lat: 13.0358, lng: 80.2456 },
  { id: 5, name: "T Nagar Police Station", type: "police", lat: 13.0418, lng: 80.2341 },
];

export async function getSafeZones(req: Request, res: Response) {
  try {
    const { lat, lon, radius = 5000, type } = req.query;

    let results = safeZones;
    if (type) results = results.filter((z) => z.type === type);

    // If location provided, sort by distance
    if (lat && lon) {
      const userLat = parseFloat(lat as string);
      const userLon = parseFloat(lon as string);
      results = results
        .map((z) => ({
          ...z,
          distanceKm: haversineDistance(userLat, userLon, z.lat, z.lng),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .filter((z) => z.distanceKm <= parseFloat(radius as string) / 1000);
    }

    res.json({ safeZones: results, total: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
