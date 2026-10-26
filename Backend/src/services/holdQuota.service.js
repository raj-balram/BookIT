import { redis } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { HOLD_MS, MAX_ACTIVE_HOLDS } from "../config/limits.js";

const key = (userId) => `holds:${userId}`;

// Atomically reserves one of the user's hold "seats". Returns true if allowed.
export async function reserveHoldQuota(userId, slotId, nowMs, expiresAtMs) {
  try {
    const ok = await redis.reserveHold(
      key(userId), nowMs, expiresAtMs, MAX_ACTIVE_HOLDS, String(slotId), HOLD_MS * 2
    );
    return ok === 1;
  } catch (err) {
    logger.warn({ err }, "Hold quota unavailable, continuing without it"); // fail open
    return true;
  }
}

export async function releaseHoldQuota(userId, slotId) {
  try {
    await redis.zrem(key(userId), String(slotId));
  } catch (err) {
    logger.warn({ err }, "Failed to release hold quota"); // self-heals when the hold expires
  }
}