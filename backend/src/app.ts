import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { apiRoutes } from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import mongoose from "mongoose";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

app.get("/", (_req, res) => {
  res.json({ name: "Route 360 Backend", version: "1.0.0" });
});

// MongoDB connection (optional – app runs without it for in-memory mode)
const MONGODB_URI = process.env.MONGODB_URI || "";
if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => {
      console.warn("MongoDB connection failed – running with in-memory storage.", err.message);
    });
} else {
  console.log("MONGODB_URI not set – running with in-memory storage.");
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Route 360 backend running on http://localhost:${PORT}`);
});

export default app;
