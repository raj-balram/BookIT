import express from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import { redis } from "./config/redis.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { LIMITS } from "./config/limits.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import slotRoutes from "./routes/slot.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Behind a proxy (Render, Nginx, a load balancer) set TRUST_PROXY=1, otherwise every
// user shares the proxy's IP and the per-IP limits would apply to everyone at once.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));

app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());
app.use(
  cors({
    origin: allowedOrigins,
    exposedHeaders: ["Retry-After", "RateLimit-Remaining", "Idempotent-Replayed"],
  })
);
app.use(express.json({ limit: "10kb" }));

app.get("/health", async (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  let redisOk = false;
  try {
    redisOk = (await redis.ping()) === "PONG";
  } catch {}
  res.status(mongoOk && redisOk ? 200 : 503).json({ mongo: mongoOk, redis: redisOk });
});

// safety net for everything below (tests send hundreds of requests from one IP, so skip them)
app.use(rateLimit({ name: "global", ...LIMITS.global, skip: () => process.env.NODE_ENV === "test" }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/bookings", bookingRoutes);

app.use(notFound);
app.use(errorHandler); // must be last

export default app;