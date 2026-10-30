import "./loadEnv.js"; // must be first
import "../config/env.js";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { Slot } from "../models/Slot.js";
import { Booking } from "../models/Booking.js";
import { Payment } from "../models/Payment.js";

await connectDB();
if (!mongoose.connection.name.includes("load")) {
  console.error("Refusing to verify a non-load database");
  process.exit(1);
}

let failed = false;
const report = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failed = true;
};

const confirmed = await Booking.countDocuments({ status: "CONFIRMED" });
const bookedSlots = await Slot.countDocuments({ status: "BOOKED" });
const payments = await Payment.countDocuments({});

const expected = Number(process.env.EXPECT_BOOKINGS ?? -1);
  if (expected >= 0) report(confirmed === expected, `confirmed bookings (${confirmed}) == expected (${expected})`);

const dup = await Booking.aggregate([
  { $match: { status: "CONFIRMED" } },
  { $group: { _id: "$slot", n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
  { $count: "slots" },
]);
const dupCount = dup[0]?.slots ?? 0;

const mismatched = await Booking.aggregate([
  { $match: { status: "CONFIRMED" } },
  { $lookup: { from: "slots", localField: "slot", foreignField: "_id", as: "s" } },
  { $unwind: "$s" },
  {
    $match: {
      $expr: { $or: [{ $ne: ["$s.status", "BOOKED"] }, { $ne: ["$s.bookedBy", "$user"] }] },
    },
  },
  { $count: "n" },
]);
const badCount = mismatched[0]?.n ?? 0;

report(dupCount === 0, `slots with more than one confirmed booking: ${dupCount} (must be 0)`);
report(badCount === 0, `bookings whose slot is not BOOKED by the same user: ${badCount} (must be 0)`);
report(bookedSlots === confirmed, `BOOKED slots (${bookedSlots}) == confirmed bookings (${confirmed})`);
report(payments === confirmed, `payments (${payments}) == confirmed bookings (${confirmed})`);

const hot = await Slot.find({ resource: /^Hot-/ }).select("status").lean();
const heldHot = hot.filter((s) => s.status === "HELD").length;
console.log(
  `INFO  hot slots HELD: ${heldHot} of ${hot.length}. After the contention scenario this must ` +
    `equal k6's hold_won counter (at most one winner per slot).`
);

await mongoose.disconnect();
process.exit(failed ? 1 : 0);