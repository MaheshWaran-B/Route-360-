import { Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";

export async function predictRisk(req: Request, res: Response) {
  try {
    const {
      traffic_level = 0.3,
      weather_risk = 0.2,
      accident_count = 0,
      flood_risk = 0.1,
      road_condition_risk = 0.1,
      time_of_day = new Date().getHours(),
      day_of_week = new Date().getDay(),
      visibility_km = 10,
      rainfall_mm = 0,
      wind_speed_ms = 5,
    } = req.body;

    const features = {
      traffic_level,
      weather_risk,
      accident_count,
      flood_risk,
      road_condition_risk,
      time_of_day,
      day_of_week,
      visibility_km,
      rainfall_mm,
      wind_speed_ms,
    };

    // Run Python prediction script
    const scriptPath = path.join(__dirname, "../../ml/predict.py");
    const pythonProcess = spawn("python", [scriptPath, JSON.stringify(features)]);

    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    return new Promise<void>((resolve) => {
      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          // Fallback: rule-based prediction if Python fails
          const ruleBased = ruleBasedPredict(features);
          res.json({ ...ruleBased, method: "rule-based (fallback)" });
        } else {
          try {
            const result = JSON.parse(stdout);
            res.json({ ...result, method: "ml-model" });
          } catch {
            const ruleBased = ruleBasedPredict(features);
            res.json({ ...ruleBased, method: "rule-based (parse-fallback)" });
          }
        }
        resolve();
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Rule-based fallback risk prediction (same weights as the JS frontend)
 */
function ruleBasedPredict(features: Record<string, number>) {
  const riskScore =
    0.25 * Math.max(0, Math.min(1, features.traffic_level)) +
    0.30 * Math.max(0, Math.min(1, features.accident_count / 5)) +
    0.20 * Math.max(0, Math.min(1, features.weather_risk)) +
    0.15 * Math.max(0, Math.min(1, features.flood_risk)) +
    0.10 * Math.max(0, Math.min(1, features.road_condition_risk));

  let riskLevel: string;
  if (riskScore < 0.25) riskLevel = "SAFE";
  else if (riskScore < 0.50) riskLevel = "MODERATE";
  else if (riskScore < 0.75) riskLevel = "HIGH";
  else riskLevel = "CRITICAL";

  return {
    risk_level: riskLevel,
    confidence: 1.0,
    probabilities: {
      SAFE: riskScore < 0.25 ? 1.0 : 0,
      MODERATE: riskScore >= 0.25 && riskScore < 0.5 ? 1.0 : 0,
      HIGH: riskScore >= 0.5 && riskScore < 0.75 ? 1.0 : 0,
      CRITICAL: riskScore >= 0.75 ? 1.0 : 0,
    },
    riskScore: +riskScore.toFixed(4),
  };
}
