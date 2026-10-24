import express from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import { redis } from "./config/redis.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import slotRoutes from "./routes/slot.routes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/slots", slotRoutes);

app.get("/health", async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  let redisOk = false;
  try {
    redisOk = (await redis.ping()) === "PONG";
  } catch {}
  res.status(mongoOk && redisOk ? 200 : 503).json({ mongo: mongoOk, redis: redisOk });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler); // must be last

export default app;