import { Router } from "express";
import { listSlots, getSlot, myHolds } from "../controllers/slot.controller.js";
import { hold, release } from "../controllers/hold.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { LIMITS } from "../config/limits.js";
import { listSlotsQuery } from "../validators/slot.schemas.js";

const router = Router();

const holdLimiter = rateLimit({ name: "hold", ...LIMITS.hold, key: (req) => req.user._id.toString() });

router.use(requireAuth);
router.get("/", validateQuery(listSlotsQuery), listSlots);
router.get("/", validateQuery(listSlotsQuery), listSlots);
router.get("/holds/me", myHolds); // must stay above "/:id"
router.get("/:id", getSlot);
router.get("/:id", getSlot);
router.post("/:id/hold", holdLimiter, hold);
router.delete("/:id/hold", holdLimiter, release);

export default router;