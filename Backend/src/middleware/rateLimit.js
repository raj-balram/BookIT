import { redis } from "../config/redis.js";
import { logger } from "../utils/logger.js";

// Fixed-window limiter. The counter lives in Redis, so it works across several server instances.
export function rateLimit({ name, windowMs, max, key = (req) => req.ip, skip }) {
  return async (req, res, next) => {
    if (skip?.(req)) return next();

    let count, ttlMs;
    try {
      [count, ttlMs] = await redis.rateHit(`rl:${name}:${key(req)}`, windowMs);
    } catch (err) {
      // fail open: a Redis outage must not take the whole API down
      logger.warn({ err }, "Rate limiter unavailable, continuing without it");
      return next();
    }

    const resetSec = Math.max(1, Math.ceil(ttlMs / 1000));
    res.set({
      "RateLimit-Limit": String(max),
      "RateLimit-Remaining": String(Math.max(0, max - count)),
      "RateLimit-Reset": String(resetSec),
    });

    if (count > max) {
      res.set("Retry-After", String(resetSec));
      return res.status(429).json({ message: "Too many requests, please slow down" });
    }
    next();
  };
}