import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ROLES } from "../models/User.js";
import { createSlot, createSlotsBulk, deleteSlot } from "../controllers/slot.controller.js";
import { createSlotSchema, bulkSlotSchema } from "../validators/slot.schemas.js";

const router = Router();

router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get("/ping", (req, res) => res.json({ message: "admin ok" }));

router.post("/slots", validate(createSlotSchema), createSlot);
router.post("/slots/bulk", validate(bulkSlotSchema), createSlotsBulk);
router.delete("/slots/:id", deleteSlot);

export default router;