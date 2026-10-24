import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: "Slot", required: true },
    status: { type: String, enum: ["CONFIRMED", "CANCELLED"], default: "CONFIRMED" },
  },
  { timestamps: true }
);

bookingSchema.index({ user: 1, createdAt: -1 });

// Safety net: at most ONE confirmed booking per slot, enforced by the database.
// "Partial" means cancelled bookings don't count, so a cancelled slot can be rebooked later.
bookingSchema.index(
  { slot: 1 },
  { unique: true, partialFilterExpression: { status: "CONFIRMED" } }
);

export const Booking = mongoose.model("Booking", bookingSchema);