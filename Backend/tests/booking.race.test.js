import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// set env BEFORE importing app code (config/env.js validates these on import)
process.env.JWT_SECRET ??= "test-secret";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.MONGO_URI ??= "mongodb://placeholder/test"; // unused, tests connect themselves

const CONCURRENCY = 50;

let replSet, server, redis;
let User, Slot, Booking;
let seq = 0; // keeps emails/resources unique across setup() calls

const tokenFor = (user) =>
  jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
    subject: user._id.toString(),
    expiresIn: "1h",
  });

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI; // optional: use your Docker Mongo instead
  if (!uri) {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = replSet.getUri();
  }
  await mongoose.connect(uri);
  if (!mongoose.connection.name.includes("test")) {
    throw new Error("Refusing to run: test database name must contain 'test'");
  }
  await mongoose.connection.dropDatabase();

  ({ User } = await import("../src/models/User.js"));
  ({ Slot } = await import("../src/models/Slot.js"));
  ({ Booking } = await import("../src/models/Booking.js"));
  await Promise.all([User.init(), Slot.init(), Booking.init()]); // build indexes

  ({ redis } = await import("../src/config/redis.js"));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0);
});

afterAll(async () => {
  server?.close();
  redis?.disconnect();
  await mongoose.disconnect();
  await replSet?.stop();
});

// creates one future slot plus `userCount` users who each get a token
async function setup(userCount = CONCURRENCY) {
  const n = ++seq;
  const admin = await User.create({
    name: "Admin", email: `admin-${n}@race.test`, passwordHash: "x", role: "ADMIN",
  });
  const start = Date.now() + 24 * 3600 * 1000;
  const slot = await Slot.create({
    resource: `Court-${n}`, startTime: new Date(start),
    endTime: new Date(start + 3600 * 1000), createdBy: admin._id,
  });
  // dummy hash: bcrypt x50 would only slow the test down
  const users = await User.insertMany(
    Array.from({ length: userCount }, (_, i) => ({
      name: `User ${i}`, email: `u${i}-${n}@race.test`, passwordHash: "x",
    }))
  );
  return { slot, tokens: users.map(tokenFor) };
}

const fireRace = (path, slot, tokens) =>
  Promise.all(
    tokens.map((t) =>
      request(server).post(path).set("Authorization", `Bearer ${t}`).send({ slotId: slot._id.toString() })
    )
  );

test("BEFORE: naive booking (no DB safety net) double-books one slot", async () => {
  await Booking.collection.dropIndexes(); // remove the unique index to show the raw bug
  try {
    const { slot, tokens } = await setup();
    const responses = await fireRace("/api/bookings/naive", slot, tokens);

    const succeeded = responses.filter((r) => r.status === 201).length;
    const stored = await Booking.countDocuments({ slot: slot._id });
    console.log(`BEFORE: ${succeeded}/${CONCURRENCY} requests succeeded, ${stored} bookings stored for ONE slot`);

    expect(succeeded).toBeGreaterThan(1); // passes only because the bug exists
    expect(stored).toBeGreaterThan(1);
  } finally {
    await Booking.deleteMany({}); // remove duplicates so the unique index can be rebuilt
    await Booking.syncIndexes();
  }
});

test("AFTER: exactly one of 50 concurrent requests wins", async () => {
  const { slot, tokens } = await setup();
  const responses = await fireRace("/api/bookings", slot, tokens);

  const winners = responses.filter((r) => r.status === 201);
  const losers = responses.filter((r) => r.status === 409);
  const stored = await Booking.countDocuments({ slot: slot._id });
  console.log(`AFTER: ${winners.length}/${CONCURRENCY} succeeded, ${losers.length} got 409, ${stored} booking stored`);

  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(CONCURRENCY - 1);
  expect(stored).toBe(1);

  const fresh = await Slot.findById(slot._id);
  expect(fresh.status).toBe("BOOKED");
  expect(fresh.bookedBy.toString()).toBe(winners[0].body.booking.user);
});

test("different slots are independent: parallel bookings all succeed", async () => {
  const a = await setup(1);
  const b = await setup(1);
  const [ra, rb] = await Promise.all([
    fireRace("/api/bookings", a.slot, a.tokens),
    fireRace("/api/bookings", b.slot, b.tokens),
  ]);
  expect(ra[0].status).toBe(201);
  expect(rb[0].status).toBe(201);
});