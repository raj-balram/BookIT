import mongoose from "mongoose";
import { Slot, SLOT_STATUS } from "../models/Slot.js";
import { Booking } from "../models/Booking.js";
import { Payment } from "../models/Payment.js";
import { AppError } from "../utils/AppError.js";
import { releaseHoldQuota } from "./holdQuota.service.js";

export async function confirmBooking(slotId, userId) {
  const session = await mongoose.startSession();
  try {
    let booking;

    // withTransaction retries automatically on transient errors (e.g. write conflicts),
    // so everything inside must only touch the database
    await session.withTransaction(async () => {
      const now = new Date();

      // atomic ownership + expiry check: you can only confirm YOUR hold, and only while it's valid
      const slot = await Slot.findOneAndUpdate(
        { _id: slotId, status: SLOT_STATUS.HELD, heldBy: userId, holdExpiresAt: { $gt: now } },
        { $set: { status: SLOT_STATUS.BOOKED, bookedBy: userId, heldBy: null, holdExpiresAt: null } },
        { session, returnDocument: "after" }
      );

      if (!slot) {
        const exists = await Slot.exists({ _id: slotId }).session(session);
        if (!exists) throw new AppError(404, "Slot not found");
        throw new AppError(409, "No active hold for this slot (it may have expired)");
      }

      const [created] = await Booking.create([{ user: userId, slot: slot._id }], { session });
      await Payment.create(
        [{ booking: created._id, user: userId, amount: slot.price ?? 0, status: "SUCCEEDED" }],
        { session }
      );
      booking = created;
    });

    await releaseHoldQuota(userId, slotId); // a confirmed slot no longer counts as a hold

    return booking;
  } finally {
    await session.endSession();
  }
}

export async function listMyBookings(userId, { page, limit }) {
  const filter = { user: userId };
  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("slot", "resource startTime endTime price")
      .lean(),
    Booking.countDocuments(filter),
  ]);
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}