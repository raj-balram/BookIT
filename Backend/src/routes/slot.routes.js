import { Router } from "express";
import { listSlots, getSlot } from "../controllers/slot.controller.js";
import { hold, release } from "../controllers/hold.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { listSlotsQuery } from "../validators/slot.schemas.js";

const router = Router();

router.use(requireAuth);
router.get("/", validateQuery(listSlotsQuery), listSlots);
router.get("/:id", getSlot);
router.post("/:id/hold", hold);
router.delete("/:id/hold", release);

export default router;