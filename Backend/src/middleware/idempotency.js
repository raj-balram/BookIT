import crypto from "node:crypto";
import { redis } from "../config/redis.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const IN_PROGRESS_TTL_MS = 30_000; // short: a crashed request must not block the key for long
const RESULT_TTL_S = 24 * 60 * 60; // finished results are replayable for 24h

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function idempotent({ required = false } = {}) {
  return async (req, res, next) => {
    const key = req.get("Idempotency-Key");
    if (!key) {
      if (required) throw new AppError(400, "Idempotency-Key header is required");
      return next();
    }
    if (!KEY_PATTERN.test(key)) {
      throw new AppError(400, "Idempotency-Key must be 8-64 characters: letters, digits, _ or -");
    }

    // scoped per user: nobody can replay (or read) another user's response
    const redisKey = `idem:${req.user._id}:${key}`;
    // detects the same key being reused for a DIFFERENT request
    const fingerprint = sha256(`${req.method} ${req.originalUrl} ${JSON.stringify(req.body ?? {})}`);

    // 1. Atomically claim the key. SET ... NX succeeds for exactly one caller.
    let claimed;
    try {
      claimed = await redis.set(
        redisKey,
        JSON.stringify({ state: "IN_PROGRESS", fingerprint }),
        "PX",
        IN_PROGRESS_TTL_MS,
        "NX"
      );
    } catch (err) {
      // fail open: the database already guarantees correctness, this layer is a safety net
      logger.warn({ err }, "Idempotency store unavailable, continuing without it");
      return next();
    }

    // 2. Someone already claimed it: replay, reject, or ask to retry
    if (claimed !== "OK") {
      let raw;
      try {
        raw = await redis.get(redisKey);
      } catch (err) {
        logger.warn({ err }, "Idempotency lookup failed, continuing without it");
        return next();
      }
      if (!raw) throw new AppError(409, "Please retry the request"); // expired between SET and GET

      const saved = JSON.parse(raw);
      if (saved.fingerprint !== fingerprint) {
        throw new AppError(422, "Idempotency-Key was already used with a different request");
      }
      if (saved.state === "IN_PROGRESS") {
        res.set("Retry-After", "1");
        throw new AppError(409, "A request with this Idempotency-Key is still in progress");
      }
      res.set("Idempotent-Replayed", "true");
      return res.status(saved.response.status).json(saved.response.body);
    }

    // 3. We own the key: store the result BEFORE sending it, so a fast retry never sees a gap
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      res.json = originalJson;
      try {
        if (res.statusCode >= 500) {
          await redis.del(redisKey); // server errors are not cached: the client may retry
        } else {
          await redis.set(
            redisKey,
            JSON.stringify({
              state: "DONE",
              fingerprint,
              response: { status: res.statusCode, body },
            }),
            "EX",
            RESULT_TTL_S
          );
        }
      } catch (err) {
        logger.warn({ err }, "Failed to store idempotent result");
      }
      return originalJson(body);
    };

    next();
  };
}