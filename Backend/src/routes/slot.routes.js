import { Router } from "express";
import { listSlots, getSlot } from "../controllers/slot.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { listSlotsQuery } from "../validators/slot.schemas.js";

const router = Router();

router.use(requireAuth);
router.get("/", validateQuery(listSlotsQuery), listSlots);
router.get("/:id", getSlot);

export default router;