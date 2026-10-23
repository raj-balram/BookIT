import express from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import { redis } from "./config/redis.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  let redisOk = false;
  try {
    redisOk = (await redis.ping()) === "PONG";
  } catch {}
  res.status(mongoOk && redisOk ? 200 : 503).json({ mongo: mongoOk, redis: redisOk });
});

export default app;