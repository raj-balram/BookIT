import { Router } from "express";
import { bookNaive, confirmBooking, myBookings } from "../controllers/booking.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validate.js";
import { idempotent } from "../middleware/idempotency.js";
import { bookSlotSchema, listBookingsQuery } from "../validators/booking.schemas.js";

const router = Router();

router.use(requireAuth);

// validate first, so invalid requests don't consume an idempotency key
router.post("/", validate(bookSlotSchema), idempotent({ required: true }), confirmBooking);
router.get("/me", validateQuery(listBookingsQuery), myBookings);

// Demo only: the deliberately broken endpoint is never exposed in production
if (process.env.NODE_ENV !== "production") {
  router.post("/naive", validate(bookSlotSchema), bookNaive);
}

export default router;