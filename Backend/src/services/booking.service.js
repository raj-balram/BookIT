import { Slot, SLOT_STATUS } from "../models/Slot.js";
import { Booking } from "../models/Booking.js";
import { AppError } from "../utils/AppError.js";

export async function bookSlot(slotId, userId) {
  const now = new Date();

  // ONE atomic operation: "if the slot is still AVAILABLE (and in the future), mark it BOOKED".
  // The check and the write can't be separated, so only one concurrent request matches.
  const slot = await Slot.findOneAndUpdate(
    { _id: slotId, status: SLOT_STATUS.AVAILABLE, startTime: { $gt: now } },
    { $set: { status: SLOT_STATUS.BOOKED, bookedBy: userId } },
    { new: true }
  );

  if (!slot) {
    // we lost the race (or the slot is invalid): work out which error to return
    const current = await Slot.findById(slotId).select("startTime").lean();
    if (!current) throw new AppError(404, "Slot not found");
    if (current.startTime <= now) throw new AppError(400, "Slot has already started");
    throw new AppError(409, "Slot is no longer available");
  }

  try {
    return await Booking.create({ user: userId, slot: slot._id });
  } catch (err) {
    // compensate: don't leave the slot BOOKED with no booking record
    await Slot.updateOne(
      { _id: slot._id, status: SLOT_STATUS.BOOKED, bookedBy: userId },
      { $set: { status: SLOT_STATUS.AVAILABLE, bookedBy: null } }
    );
    throw err;
  }
}

export async function listMyBookings(userId, { page, limit }) {
  const filter = { user: userId };
  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("slot", "resource startTime endTime")
      .lean(),
    Booking.countDocuments(filter),
  ]);
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}