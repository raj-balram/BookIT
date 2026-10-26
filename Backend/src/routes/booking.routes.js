import { Router } from "express";
import { bookNaive, confirmBooking, myBookings } from "../controllers/booking.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validate.js";
import { idempotent } from "../middleware/idempotency.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { LIMITS } from "../config/limits.js";
import { bookSlotSchema, listBookingsQuery } from "../validators/booking.schemas.js";

const router = Router();

const confirmLimiter = rateLimit({ name: "confirm", ...LIMITS.confirm, key: (req) => req.user._id.toString() });

router.use(requireAuth);

router.post("/", confirmLimiter, validate(bookSlotSchema), idempotent({ required: true }), confirmBooking);
router.get("/me", validateQuery(listBookingsQuery), myBookings);

if (process.env.NODE_ENV !== "production") {
  router.post("/naive", validate(bookSlotSchema), bookNaive);
}

export default router;