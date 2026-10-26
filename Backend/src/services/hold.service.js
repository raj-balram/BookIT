import { Slot, SLOT_STATUS } from "../models/Slot.js";
import { AppError } from "../utils/AppError.js";
import { HOLD_MS, MAX_ACTIVE_HOLDS } from "../config/limits.js";
import { reserveHoldQuota, releaseHoldQuota } from "./holdQuota.service.js";

export async function holdSlot(slotId, userId) {
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + HOLD_MS);

  // 1. Reserve quota atomically in Redis (re-holding a slot you already hold costs nothing extra)
  const reserved = await reserveHoldQuota(userId, slotId, now.getTime(), holdExpiresAt.getTime());
  if (!reserved) {
    throw new AppError(429, `You can hold at most ${MAX_ACTIVE_HOLDS} slots at once`);
  }

  try {
    // 2. Claim the slot atomically in Mongo (same as Phase 5)
    const slot = await Slot.findOneAndUpdate(
      {
        _id: slotId,
        startTime: { $gt: now },
        $or: [
          { status: SLOT_STATUS.AVAILABLE },
          { status: SLOT_STATUS.HELD, holdExpiresAt: { $lte: now } },
        ],
      },
      { $set: { status: SLOT_STATUS.HELD, heldBy: userId, holdExpiresAt } },
      { returnDocument: "after" }
    );
    if (slot) return { slotId: slot._id, holdExpiresAt: slot.holdExpiresAt };

    const current = await Slot.findById(slotId).select("startTime status heldBy holdExpiresAt").lean();
    if (!current) throw new AppError(404, "Slot not found");
    if (current.startTime <= now) throw new AppError(400, "Slot has already started");

    const ownActiveHold =
      current.status === SLOT_STATUS.HELD &&
      current.heldBy?.toString() === userId.toString() &&
      current.holdExpiresAt > now;
    if (ownActiveHold) return { slotId: current._id, holdExpiresAt: current.holdExpiresAt };

    throw new AppError(409, "Slot is not available");
  } catch (err) {
    // we reserved a seat but didn't get the slot: give the seat back
    await releaseHoldQuota(userId, slotId);
    throw err;
  }
}

export async function releaseHold(slotId, userId) {
  const slot = await Slot.findOneAndUpdate(
    { _id: slotId, status: SLOT_STATUS.HELD, heldBy: userId },
    { $set: { status: SLOT_STATUS.AVAILABLE, heldBy: null, holdExpiresAt: null } }
  );
  if (!slot) throw new AppError(404, "No active hold found for this slot");
  await releaseHoldQuota(userId, slotId);
}