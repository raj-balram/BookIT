import { Slot, SLOT_STATUS } from "../models/Slot.js";
import { AppError } from "../utils/AppError.js";

// users must never see who holds or booked a slot
const PUBLIC_FIELDS = "-heldBy -bookedBy -createdBy -__v";

export async function createSlot(data, adminId) {
  // duplicate (resource + startTime) -> Mongo error 11000 -> errorHandler returns 409
  return Slot.create({ ...data, createdBy: adminId });
}

export async function createSlotsBulk({ resource, from, to, slotMinutes, price }, adminId)  {
  const stepMs = slotMinutes * 60 * 1000;
  const count = Math.floor((to.getTime() - from.getTime()) / stepMs);

  if (count < 1) throw new AppError(400, "Time range is too short for one slot");
  if (count > 200) throw new AppError(400, "Maximum 200 slots per request");

  const ops = [];
  for (let i = 0; i < count; i++) {
    const startTime = new Date(from.getTime() + i * stepMs);
    const endTime = new Date(startTime.getTime() + stepMs);
    ops.push({
      updateOne: {
        filter: { resource, startTime },
        // only inserts if it doesn't exist, so re-running never duplicates or overwrites
        update: { $setOnInsert: { endTime, price, status: SLOT_STATUS.AVAILABLE, createdBy: adminId } },
        upsert: true,
      },
    });
  }

  const result = await Slot.bulkWrite(ops);
  return { requested: count, created: result.upsertedCount, skipped: count - result.upsertedCount };
}

export async function listSlots(q) {
  const filter = {};
  if (q.resource) filter.resource = q.resource;
  if (q.status) filter.status = q.status;

  // by default show only upcoming slots
  filter.startTime = { $gte: q.from ?? new Date() };
  if (q.to) filter.startTime.$lte = q.to;

  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    Slot.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ startTime: 1, _id: 1 }) // _id breaks ties so pages never overlap
      .skip(skip)
      .limit(q.limit)
      .lean(),
    Slot.countDocuments(filter),
  ]);

  return { items, page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) };
}

export async function getSlot(id) {
  const slot = await Slot.findById(id).select(PUBLIC_FIELDS).lean();
  if (!slot) throw new AppError(404, "Slot not found");
  return slot;
}

export async function deleteSlot(id) {
  // one atomic operation: delete only if still AVAILABLE (no check-then-delete race)
  const deleted = await Slot.findOneAndDelete({ _id: id, status: SLOT_STATUS.AVAILABLE });
  if (deleted) return;

  const exists = await Slot.exists({ _id: id });
  if (!exists) throw new AppError(404, "Slot not found");
  throw new AppError(409, "Only AVAILABLE slots can be deleted");
}

export async function listMyHolds(userId) {
  return Slot.find({
    heldBy: userId,
    status: SLOT_STATUS.HELD,
    holdExpiresAt: { $gt: new Date() },
  })
    .select(PUBLIC_FIELDS)
    .sort({ holdExpiresAt: 1 })
    .lean();
}