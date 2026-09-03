import mongoose, { Schema, Document } from "mongoose";

export interface IRoute extends Document {
  origin: string;
  destination: string;
  mode: string;
  preference: string;
  distanceKm: number;
  etaMinutes: number;
  riskScore: number;
  riskLevel: string;
  coordinates: number[][];
  timestamp: Date;
}

const routeSchema = new Schema<IRoute>({
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  mode: { type: String, default: "car", enum: ["car", "bike", "public"] },
  preference: { type: String, default: "balanced", enum: ["fastest", "balanced", "safest"] },
  distanceKm: { type: Number, required: true },
  etaMinutes: { type: Number, required: true },
  riskScore: { type: Number, required: true },
  riskLevel: { type: String, required: true },
  coordinates: { type: [[Number]], required: true },
  timestamp: { type: Date, default: Date.now },
});

routeSchema.index({ origin: 1, destination: 1, timestamp: -1 });

export const Route = mongoose.model<IRoute>("Route", routeSchema);
