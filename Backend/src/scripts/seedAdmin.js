import "../config/env.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import { User, ROLES } from "../models/User.js";

const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env");
  process.exit(1);
}

await connectDB();

const existing = await User.findOne({ email });
if (existing) {
  existing.role = ROLES.ADMIN;
  await existing.save();
  console.log("Existing user promoted to ADMIN:", email);
} else {
  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ name: "Admin", email, passwordHash, role: ROLES.ADMIN });
  console.log("Admin created:", email);
}

await mongoose.disconnect();