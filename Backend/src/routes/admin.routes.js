import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

router.use(requireAuth, requireRole(ROLES.ADMIN));

// temporary route to prove role protection works
router.get("/ping", (req, res) => res.json({ message: "admin ok" }));

export default router;