import { z } from "zod";

const futureDate = z.coerce.date().refine((d) => d > new Date(), "Must be in the future");
const resource = z.string().trim().min(1, "Resource is required").max(80);

export const createSlotSchema = z
  .object({
    resource,
    startTime: futureDate,
    endTime: z.coerce.date(),
    price: z.coerce.number().min(0).max(100000).default(0),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export const bulkSlotSchema = z
  .object({
    resource,
    from: futureDate,
    to: z.coerce.date(),
    slotMinutes: z.coerce.number().int().min(5).max(240),
    price: z.coerce.number().min(0).max(100000).default(0),
  })
  .refine((v) => v.to > v.from, { message: "to must be after from", path: ["to"] });

export const listSlotsQuery = z.object({
  resource: z.string().trim().min(1).optional(),
  status: z.enum(["AVAILABLE", "HELD", "BOOKED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});