import { Slot, SLOT_STATUS } from "../models/Slot.js";
import { logger } from "../utils/logger.js";

export async function releaseExpiredHolds(now = new Date()) {
  const result = await Slot.updateMany(
    { status: SLOT_STATUS.HELD, holdExpiresAt: { $lte: now } },
    { $set: { status: SLOT_STATUS.AVAILABLE, heldBy: null, holdExpiresAt: null } }
  );
  return result.modifiedCount;
}

export function startHoldReaper(intervalMs = 30_000) {
  const timer = setInterval(async () => {
    try {
      const released = await releaseExpiredHolds();
      if (released > 0) logger.info({ released }, "Released expired holds");
    } catch (err) {
      logger.error({ err }, "Hold reaper failed");
    }
  }, intervalMs);
  timer.unref(); // don't keep the process alive just for this timer
  return () => clearInterval(timer);
}