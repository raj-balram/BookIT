import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

const toPublic = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
});

const signToken = (user) =>
  jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: user._id.toString(),
    expiresIn: env.jwtExpiresIn,
  });

export async function register({ name, email, password }) {
  const existing = await User.findOne({ email });
  if (existing) throw new AppError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(password, 12);
  // role is never taken from the request: everyone registers as USER
  const user = await User.create({ name, email, passwordHash });
  return { user: toPublic(user), token: signToken(user) };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  // same message for unknown email and wrong password: no user enumeration
  if (!ok) throw new AppError(401, "Invalid email or password");

  // deliberately NO auto-reactivation here (a bug we found in the NIC project)
  if (!user.isActive) throw new AppError(403, "Account is deactivated");

  return { user: toPublic(user), token: signToken(user) };
}

export { toPublic };