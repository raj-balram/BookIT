import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Invalid email");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name too short").max(60),
  email,
  // bcrypt only uses the first 72 bytes, so cap it
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});