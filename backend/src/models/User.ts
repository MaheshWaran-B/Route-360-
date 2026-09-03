import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  preferences: {
    travelMode: string;
    routePreference: string;
  };
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  preferences: {
    travelMode: { type: String, default: "car" },
    routePreference: { type: String, default: "balanced" },
  },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>("User", userSchema);
