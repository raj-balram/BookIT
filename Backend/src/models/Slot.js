import mongoose from "mongoose";

export const SLOT_STATUS = { AVAILABLE: "AVAILABLE", HELD: "HELD", BOOKED: "BOOKED" };

const slotSchema = new mongoose.Schema(
  {
    resource: { type: String, required: true, trim: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    price: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: Object.values(SLOT_STATUS), default: SLOT_STATUS.AVAILABLE },

    heldBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    holdExpiresAt: { type: Date, default: null },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

slotSchema.index({ resource: 1, startTime: 1 }, { unique: true });
slotSchema.index({ status: 1, startTime: 1 });
// lets the cleanup job find expired holds without scanning every slot
slotSchema.index({ holdExpiresAt: 1 }, { partialFilterExpression: { status: SLOT_STATUS.HELD } });

export const Slot = mongoose.model("Slot", slotSchema);