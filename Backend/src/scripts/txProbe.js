import "./loadEnv.js"; // must be first
import "../config/env.js";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { Slot } from "../models/Slot.js";
import { Booking } from "../models/Booking.js";
import { Payment } from "../models/Payment.js";

await connectDB();
if (!mongoose.connection.name.includes("load")) throw new Error("not a load database");

const user = await User.create({ name: "probe", email: `probe-${Date.now()}@load.test`, passwordHash: "x" });
const start = Date.now() + 86_400_000;
const slot = await Slot.create({
  resource: `Probe-${start}`, startTime: new Date(start), endTime: new Date(start + 3_600_000),
  price: 1, createdBy: user._id, status: "HELD", heldBy: user._id,
  holdExpiresAt: new Date(Date.now() + 60_000),
});

const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    await Slot.findOneAndUpdate(
      { _id: slot._id, status: "HELD", heldBy: user._id },
      { $set: { status: "BOOKED", bookedBy: user._id, heldBy: null, holdExpiresAt: null } },
      { session }
    );
    const [b] = await Booking.create([{ user: user._id, slot: slot._id }], { session });
    await Payment.create([{ booking: b._id, user: user._id, amount: 1 }], { session });
  });
  console.log("TRANSACTION OK");
} catch (e) {
  console.error("TRANSACTION FAILED:", e.name, e.code, e.codeName, "-", e.message);
} finally {
  await session.endSession();
  await Promise.all([
    Booking.deleteMany({ slot: slot._id }), Payment.deleteMany({ user: user._id }),
    Slot.deleteOne({ _id: slot._id }), User.deleteOne({ _id: user._id }),
  ]);
  await mongoose.disconnect();
}