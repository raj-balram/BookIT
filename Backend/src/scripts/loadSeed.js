import "./loadEnv.js"; // must be first
import "../config/env.js";
import fs from "node:fs";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { connectDB } from "../config/db.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Slot } from "../models/Slot.js";
import { Booking } from "../models/Booking.js";
import { Payment } from "../models/Payment.js";

const N_USERS = Number(process.env.N_USERS || 200);
const FLOW_PER_USER = Number(process.env.FLOW_PER_USER || 30);
const HOT_SLOTS = Number(process.env.HOT_SLOTS || 10);
const BROWSE_SLOTS = Number(process.env.BROWSE_SLOTS || 3000);

await connectDB();
if (!mongoose.connection.name.includes("load")) {
  console.error(`Refusing to seed "${mongoose.connection.name}": database name must contain "load"`);
  process.exit(1);
}
await mongoose.connection.dropDatabase();
await Promise.all([User, Slot, Booking, Payment].map((m) => m.createIndexes()));

const admin = await User.create({
  name: "Load Admin", email: "admin@load.test", passwordHash: "x", role: "ADMIN",
});

// dummy password hash: load-test users never log in, they get a signed JWT directly
const users = await User.insertMany(
  Array.from({ length: N_USERS }, (_, i) => ({
    name: `Load User ${i}`, email: `load${i}@load.test`, passwordHash: "x",
  }))
);
const tokens = users.map((u) =>
  jwt.sign({ role: u.role }, env.jwtSecret, { subject: u._id.toString(), expiresIn: "3h" })
);

const HOUR = 3600 * 1000;
const base = Date.now() + 7 * 24 * HOUR;
const mk = (resource, i, price = 50) => ({
  resource,
  startTime: new Date(base + i * HOUR),
  endTime: new Date(base + (i + 1) * HOUR),
  price,
  createdBy: admin._id,
});

async function insertChunked(docs) {
  const ids = [];
  for (let i = 0; i < docs.length; i += 1000) {
    const res = await Slot.insertMany(docs.slice(i, i + 1000), { ordered: false });
    ids.push(...res.map((s) => s._id.toString()));
  }
  return ids;
}

const hot = await insertChunked(Array.from({ length: HOT_SLOTS }, (_, i) => mk(`Hot-${i}`, 0)));

const flow = [];
for (let u = 0; u < N_USERS; u++) {
  flow.push(await insertChunked(Array.from({ length: FLOW_PER_USER }, (_, j) => mk(`Flow-${u}`, j))));
}

// makes the listing query realistic: thousands of slots across 10 resources
await insertChunked(
  Array.from({ length: BROWSE_SLOTS }, (_, i) => mk(`Browse-${i % 10}`, Math.floor(i / 10)))
);

fs.mkdirSync("load/data", { recursive: true });
fs.mkdirSync("load/results", { recursive: true });
fs.writeFileSync("load/data/users.json", JSON.stringify(tokens));
fs.writeFileSync("load/data/slots.json", JSON.stringify({ hot, flow }));

console.log(
  `Seeded "${mongoose.connection.name}": ${N_USERS} users, ${HOT_SLOTS} hot slots, ` +
    `${N_USERS * FLOW_PER_USER} flow slots, ${BROWSE_SLOTS} browse slots`
);
await mongoose.disconnect();