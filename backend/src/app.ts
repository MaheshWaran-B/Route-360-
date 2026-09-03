import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { apiRoutes } from "./routes";
import { errorHandler } from "./middleware/errorHandler";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

app.get("/", (_req, res) => {
  res.json({ name: "Route 360 Backend", version: "1.0.0" });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Route 360 backend running on http://localhost:${PORT}`);
});

export default app;
