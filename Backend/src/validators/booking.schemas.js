import { z } from "zod";

export const bookSlotSchema = z.object({
  slotId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid slotId"),
});

export const listBookingsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});