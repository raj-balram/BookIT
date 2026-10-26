import { Router } from "express";
import { register, login, me } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { LIMITS } from "../config/limits.js";
import { registerSchema, loginSchema } from "../validators/auth.schemas.js";

const router = Router();

router.post("/register", rateLimit({ name: "register", ...LIMITS.register }), validate(registerSchema), register);
// keyed by IP + email: slows password guessing against one account without locking out everyone behind the same IP
router.post(
  "/login",
  validate(loginSchema),
  rateLimit({ name: "login", ...LIMITS.login, key: (req) => `${req.ip}:${req.body.email}` }),
  login
);
router.get("/me", requireAuth, me);

export default router;