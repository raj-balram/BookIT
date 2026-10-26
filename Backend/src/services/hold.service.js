import { Slot, SLOT_STATUS } from "../models/Slot.js";
import { AppError } from "../utils/AppError.js";

export const HOLD_MS = 5 * 60 * 1000;

export async function holdSlot(slotId, userId) {
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + HOLD_MS);

  // ONE atomic operation. The $or also matches EXPIRED holds, so correctness
  // doesn't depend on the cleanup job having run.
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

  // we didn't get it: work out why
  const current = await Slot.findById(slotId).select("startTime status heldBy holdExpiresAt").lean();
  if (!current) throw new AppError(404, "Slot not found");
  if (current.startTime <= now) throw new AppError(400, "Slot has already started");

  // holding again while you already hold it is idempotent (page refresh, client retry)
  const ownActiveHold =
    current.status === SLOT_STATUS.HELD &&
    current.heldBy?.toString() === userId.toString() &&
    current.holdExpiresAt > now;
  if (ownActiveHold) return { slotId: current._id, holdExpiresAt: current.holdExpiresAt };

  throw new AppError(409, "Slot is not available");
}

export async function releaseHold(slotId, userId) {
  const slot = await Slot.findOneAndUpdate(
    { _id: slotId, status: SLOT_STATUS.HELD, heldBy: userId },
    { $set: { status: SLOT_STATUS.AVAILABLE, heldBy: null, holdExpiresAt: null } }
  );
  if (!slot) throw new AppError(404, "No active hold found for this slot");
}