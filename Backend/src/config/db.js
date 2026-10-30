import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDB() {
  await mongoose.connect(env.mongoUri, { family: 4 });
  console.log("MongoDB connected");
}