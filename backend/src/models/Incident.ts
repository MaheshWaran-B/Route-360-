import mongoose, { Schema, Document } from "mongoose";

export interface IIncident extends Document {
  type: string;
  severity: string;
  lat: number;
  lng: number;
  description: string;
  reportedBy: string;
  timestamp: Date;
  status: string;
  verified: boolean;
}

const incidentSchema = new Schema<IIncident>({
  type: {
    type: String,
    required: true,
    enum: ["accident", "flood", "pothole", "roadblock", "animal", "traffic", "construction"],
  },
  severity: {
    type: String,
    required: true,
    enum: ["low", "medium", "high", "critical"],
  },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  description: { type: String, default: "" },
  reportedBy: { type: String, default: "anonymous" },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: "active", enum: ["active", "verified", "resolved", "false"] },
  verified: { type: Boolean, default: false },
});

incidentSchema.index({ lat: 1, lng: 1 });
incidentSchema.index({ status: 1, timestamp: -1 });

export const Incident = mongoose.model<IIncident>("Incident", incidentSchema);
