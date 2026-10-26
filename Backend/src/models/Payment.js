import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["SUCCEEDED", "FAILED", "REFUNDED"], default: "SUCCEEDED" },
  },
  { timestamps: true }
);

export const Payment = mongoose.model("Payment", paymentSchema);