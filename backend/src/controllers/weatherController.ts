import { Request, Response } from "express";
import { fetchWeather, fetchWeatherForCoords } from "../services/apiClients";

export async function getWeather(req: Request, res: Response) {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: "lat and lon query params are required" });
    }

    const data = await fetchWeather(parseFloat(lat as string), parseFloat(lon as string));
    if (!data) {
      return res.status(404).json({ error: "Weather data not found" });
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getWeatherAlongRoute(req: Request, res: Response) {
  try {
    const { coordinates, maxSamples = 8 } = req.body;
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      return res.status(400).json({ error: "coordinates array is required (min 2 points)" });
    }

    const step = Math.max(1, Math.floor(coordinates.length / maxSamples));
    const samples: [number, number][] = [];
    for (let i = 0; i < coordinates.length; i += step) {
      samples.push([coordinates[i][0], coordinates[i][1]]);
    }
    if (samples[samples.length - 1] !== coordinates[coordinates.length - 1]) {
      samples.push([coordinates[coordinates.length - 1][0], coordinates[coordinates.length - 1][1]]);
    }

    const results = await Promise.all(
      samples.map(async ([lat, lon]) => {
        const data = await fetchWeatherForCoords(lat, lon);
        return { lat, lon, weather: data };
      })
    );

    res.json({ weatherPoints: results.filter((r) => r.weather !== null) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
