import mongoose from "mongoose";

export const SLOT_STATUS = { AVAILABLE: "AVAILABLE", HELD: "HELD", BOOKED: "BOOKED" };

const slotSchema = new mongoose.Schema(
  {
    resource: { type: String, required: true, trim: true }, // e.g. "Court 1", "Dr. Rao"
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: Object.values(SLOT_STATUS), default: SLOT_STATUS.AVAILABLE },

    // used from Phase 3 onwards
    heldBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    holdExpiresAt: { type: Date, default: null },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// A resource cannot have two slots starting at the same time (DB-level guarantee)
slotSchema.index({ resource: 1, startTime: 1 }, { unique: true });
// Supports the main listing query: filter by status, sort by time
slotSchema.index({ status: 1, startTime: 1 });

export const Slot = mongoose.model("Slot", slotSchema);