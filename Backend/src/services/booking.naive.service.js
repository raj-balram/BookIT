import { Slot, SLOT_STATUS } from "../models/Slot.js";
import { Booking } from "../models/Booking.js";
import { AppError } from "../utils/AppError.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// !!! NAIVE CHECK-THEN-BOOK. This has a race condition ON PURPOSE. !!!
export async function bookNaive(slotId, userId) {
  const slot = await Slot.findById(slotId); // 1. READ
  if (!slot) throw new AppError(404, "Slot not found");
  if (slot.status !== SLOT_STATUS.AVAILABLE) throw new AppError(409, "Slot not available");

  // Simulates other work that real code does between the check and the write
  // (price lookup, validation, calling a payment service...). Any I/O here opens the gap.
  await sleep(50);

  slot.status = SLOT_STATUS.BOOKED; // 2. WRITE, based on a check that may now be stale
  slot.bookedBy = userId;
  await slot.save();

  return Booking.create({ user: userId, slot: slot._id });
}