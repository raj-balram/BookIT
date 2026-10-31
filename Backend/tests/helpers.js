import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// local .env first (CI has none), then safe defaults. Must run before the app is imported.
dotenv.config({ quiet: true });
process.env.JWT_SECRET ??= "test-secret";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.MONGO_URI ??= "mongodb://placeholder/test"; // unused: tests connect themselves

export const tokenFor = (user, opts = {}) =>
  jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
    subject: user._id.toString(),
    expiresIn: "1h",
    ...opts,
  });

export async function startTestApp() {
  let replSet;
  let uri = process.env.TEST_MONGO_URI; // optional: your own Mongo instead of the in-memory one
  if (!uri) {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = replSet.getUri("bookit_test");
  }
  await mongoose.connect(uri);
  if (!mongoose.connection.name.includes("test")) {
    throw new Error("Refusing to run: test database name must contain 'test'");
  }
  await mongoose.connection.dropDatabase();

  const { User } = await import("../src/models/User.js");
  const { Slot } = await import("../src/models/Slot.js");
  const { Booking } = await import("../src/models/Booking.js");
  const { Payment } = await import("../src/models/Payment.js");
  await Promise.all([User.init(), Slot.init(), Booking.init(), Payment.init()]); // build indexes

  const { redis } = await import("../src/config/redis.js");
  const stale = await redis.keys("rl:*"); // rate-limit counters left by earlier runs
  if (stale.length) await redis.del(...stale);

  const { default: app } = await import("../src/app.js");
  const server = app.listen(0);

  return {
    server,
    redis,
    models: { User, Slot, Booking, Payment },
    stop: async () => {
      server.close();
      redis.disconnect();
      await mongoose.disconnect();
      await replSet?.stop();
    },
  };
}