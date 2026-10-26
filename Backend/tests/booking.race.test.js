import { jest } from "@jest/globals";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// set env BEFORE importing app code (config/env.js validates these on import)
process.env.JWT_SECRET ??= "test-secret";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.MONGO_URI ??= "mongodb://placeholder/test";

const CONCURRENCY = 50;

let replSet, server, redis;
let User, Slot, Booking, Payment, releaseExpiredHolds;
let seq = 0;

const tokenFor = (user) =>
  jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
    subject: user._id.toString(),
    expiresIn: "1h",
  });

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
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
  ({ Payment } = await import("../src/models/Payment.js"));
  ({ releaseExpiredHolds } = await import("../src/jobs/releaseExpiredHolds.js"));
  await Promise.all([User.init(), Slot.init(), Booking.init(), Payment.init()]);

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

// one future slot (price 100) plus `userCount` users, each with a token
async function setup(userCount = CONCURRENCY) {
  const n = ++seq;
  const admin = await User.create({
    name: "Admin", email: `admin-${n}@race.test`, passwordHash: "x", role: "ADMIN",
  });
  const start = Date.now() + 24 * 3600 * 1000;
  const slot = await Slot.create({
    resource: `Court-${n}`, startTime: new Date(start), endTime: new Date(start + 3600 * 1000),
    price: 100, createdBy: admin._id,
  });
  const users = await User.insertMany(
    Array.from({ length: userCount }, (_, i) => ({
      name: `User ${i}`, email: `u${i}-${n}@race.test`, passwordHash: "x",
    }))
  );
  return { slot, users, tokens: users.map(tokenFor) };
}

const auth = (req, token) => req.set("Authorization", `Bearer ${token}`);
const hold = (slot, token) => auth(request(server).post(`/api/slots/${slot._id}/hold`), token);
let keySeq = 0;
const newKey = () => `test-key-${Date.now()}-${++keySeq}`;

const confirm = (slot, token, key = newKey()) =>
  auth(request(server).post("/api/bookings"), token)
    .set("Idempotency-Key", key)
    .send({ slotId: slot._id.toString() });
const expireHold = (slot) =>
  Slot.updateOne({ _id: slot._id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });

test("BEFORE: naive booking (no DB safety net) double-books one slot", async () => {
  await Booking.collection.dropIndexes();
  try {
    const { slot, tokens } = await setup();
    const responses = await Promise.all(
      tokens.map((t) =>
        auth(request(server).post("/api/bookings/naive"), t).send({ slotId: slot._id.toString() })
      )
    );
    const succeeded = responses.filter((r) => r.status === 201).length;
    const stored = await Booking.countDocuments({ slot: slot._id });
    console.log(`BEFORE: ${succeeded}/${CONCURRENCY} requests succeeded, ${stored} bookings stored for ONE slot`);
    expect(succeeded).toBeGreaterThan(1);
    expect(stored).toBeGreaterThan(1);
  } finally {
    await Booking.deleteMany({});
    await Booking.syncIndexes();
  }
});

test("AFTER: exactly one of 50 concurrent holds wins", async () => {
  const { slot, users, tokens } = await setup();
  const responses = await Promise.all(tokens.map((t) => hold(slot, t)));

  const winners = responses.filter((r) => r.status === 200);
  const losers = responses.filter((r) => r.status === 409);
  console.log(`AFTER: ${winners.length}/${CONCURRENCY} got the hold, ${losers.length} got 409`);

  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(CONCURRENCY - 1);

  const fresh = await Slot.findById(slot._id);
  const winnerIdx = responses.findIndex((r) => r.status === 200);
  expect(fresh.status).toBe("HELD");
  expect(fresh.heldBy.toString()).toBe(users[winnerIdx]._id.toString());
});

test("full flow: hold -> confirm creates one booking and one payment; confirming twice fails", async () => {
  const { slot, users, tokens } = await setup(2);

  expect((await hold(slot, tokens[0])).status).toBe(200);
  expect((await hold(slot, tokens[0])).status).toBe(200); // idempotent re-hold
  expect((await hold(slot, tokens[1])).status).toBe(409); // someone else can't take it

  expect((await confirm(slot, tokens[0])).status).toBe(201);

  const fresh = await Slot.findById(slot._id);
  expect(fresh.status).toBe("BOOKED");
  expect(fresh.bookedBy.toString()).toBe(users[0]._id.toString());
  expect(fresh.heldBy).toBeNull();
  expect(await Booking.countDocuments({ slot: slot._id })).toBe(1);

  const payment = await Payment.findOne({ user: users[0]._id });
  expect(payment.amount).toBe(100);

  expect((await confirm(slot, tokens[0])).status).toBe(409);
  expect(await Booking.countDocuments({ slot: slot._id })).toBe(1);
  expect((await hold(slot, tokens[1])).status).toBe(409); // booked slots can't be held
});

test("cannot confirm without a hold, or with someone else's hold", async () => {
  const { slot, users, tokens } = await setup(2);

  expect((await confirm(slot, tokens[0])).status).toBe(409);

  await hold(slot, tokens[0]);
  expect((await confirm(slot, tokens[1])).status).toBe(409);

  const fresh = await Slot.findById(slot._id);
  expect(fresh.status).toBe("HELD");
  expect(fresh.heldBy.toString()).toBe(users[0]._id.toString());
  expect(await Booking.countDocuments({ slot: slot._id })).toBe(0);
});

test("expired hold: cannot be confirmed, and another user can take the slot", async () => {
  const { slot, users, tokens } = await setup(2);

  await hold(slot, tokens[0]);
  await expireHold(slot);

  expect((await confirm(slot, tokens[0])).status).toBe(409);
  expect((await hold(slot, tokens[1])).status).toBe(200);

  const fresh = await Slot.findById(slot._id);
  expect(fresh.heldBy.toString()).toBe(users[1]._id.toString());
});

test("release: the owner can release a hold, then others can hold", async () => {
  const { slot, tokens } = await setup(2);

  await hold(slot, tokens[0]);
  expect((await auth(request(server).delete(`/api/slots/${slot._id}/hold`), tokens[1])).status).toBe(404);
  expect((await auth(request(server).delete(`/api/slots/${slot._id}/hold`), tokens[0])).status).toBe(204);
  expect((await hold(slot, tokens[1])).status).toBe(200);
});

test("cleanup job releases expired holds and leaves active ones alone", async () => {
  const a = await setup(1);
  const b = await setup(1);

  await hold(a.slot, a.tokens[0]);
  await hold(b.slot, b.tokens[0]);
  await expireHold(a.slot);

  const released = await releaseExpiredHolds();
  expect(released).toBeGreaterThanOrEqual(1);
  expect((await Slot.findById(a.slot._id)).status).toBe("AVAILABLE");
  expect((await Slot.findById(b.slot._id)).status).toBe("HELD");
});

test("transaction rolls back everything when the payment step fails", async () => {
  const { slot, users, tokens } = await setup(1);
  await hold(slot, tokens[0]);

  const spy = jest.spyOn(Payment, "create").mockRejectedValueOnce(new Error("payment gateway down"));
  const key = newKey();
  const res = await confirm(slot, tokens[0], key);
  spy.mockRestore();

  expect(res.status).toBe(500);
  // nothing was committed: no booking, and the slot is still held by the same user
  expect(await Booking.countDocuments({ slot: slot._id })).toBe(0);
  const fresh = await Slot.findById(slot._id);
  expect(fresh.status).toBe("HELD");
  expect(fresh.heldBy.toString()).toBe(users[0]._id.toString());

  // same key as the failed attempt: 5xx results are not cached, so the retry runs for real
  expect((await confirm(slot, tokens[0], key)).status).toBe(201);
});


test("idempotency: a request without the header is rejected", async () => {
  const { slot, tokens } = await setup(1);
  await hold(slot, tokens[0]);
  const res = await auth(request(server).post("/api/bookings"), tokens[0]).send({
    slotId: slot._id.toString(),
  });
  expect(res.status).toBe(400);
});

test("idempotency: retrying with the same key replays the original response", async () => {
  const { slot, tokens } = await setup(1);
  await hold(slot, tokens[0]);
  const key = newKey();

  const first = await confirm(slot, tokens[0], key);
  const second = await confirm(slot, tokens[0], key);

  expect(first.status).toBe(201);
  expect(second.status).toBe(201); // NOT 409: the original result is replayed
  expect(second.body).toEqual(first.body);
  expect(second.headers["idempotent-replayed"]).toBe("true");
  expect(first.headers["idempotent-replayed"]).toBeUndefined();

  expect(await Booking.countDocuments({ slot: slot._id })).toBe(1);
  expect(await Payment.countDocuments({ booking: first.body.booking._id })).toBe(1);
});

test("idempotency: a double-click (10 parallel requests, same key) creates one booking", async () => {
  const { slot, tokens } = await setup(1);
  await hold(slot, tokens[0]);
  const key = newKey();

  const responses = await Promise.all(
    Array.from({ length: 10 }, () => confirm(slot, tokens[0], key))
  );

  const originals = responses.filter(
    (r) => r.status === 201 && !r.headers["idempotent-replayed"]
  );
  expect(originals).toHaveLength(1); // exactly one request actually executed
  for (const r of responses) expect([201, 409]).toContain(r.status); // others: replay or "in progress"
  expect(await Booking.countDocuments({ slot: slot._id })).toBe(1);
});

test("idempotency: the same key with a different request is rejected with 422", async () => {
  const { slot, tokens } = await setup(1);
  await hold(slot, tokens[0]);
  const key = newKey();

  expect((await confirm(slot, tokens[0], key)).status).toBe(201);

  const other = await auth(request(server).post("/api/bookings"), tokens[0])
    .set("Idempotency-Key", key)
    .send({ slotId: new mongoose.Types.ObjectId().toString() });
  expect(other.status).toBe(422);
});

test("idempotency: two users can use the same key string without interfering", async () => {
  const a = await setup(1);
  const b = await setup(1);
  await hold(a.slot, a.tokens[0]);
  await hold(b.slot, b.tokens[0]);
  const key = newKey();

  const [ra, rb] = await Promise.all([
    confirm(a.slot, a.tokens[0], key),
    confirm(b.slot, b.tokens[0], key),
  ]);
  expect(ra.status).toBe(201);
  expect(rb.status).toBe(201);
  expect(ra.headers["idempotent-replayed"]).toBeUndefined();
  expect(rb.headers["idempotent-replayed"]).toBeUndefined();
});


// ---------- hold quota (max 3 active holds per user) ----------

async function newUser() {
  const n = ++seq;
  const user = await User.create({ name: `Solo ${n}`, email: `solo-${n}@race.test`, passwordHash: "x" });
  return { user, token: tokenFor(user) };
}

async function makeSlots(count) {
  const n = ++seq;
  const admin = await User.create({
    name: "Admin", email: `admin-m${n}@race.test`, passwordHash: "x", role: "ADMIN",
  });
  const base = Date.now() + 48 * 3600 * 1000;
  return Slot.insertMany(
    Array.from({ length: count }, (_, i) => ({
      resource: `Multi-${n}`,
      startTime: new Date(base + i * 3600 * 1000),
      endTime: new Date(base + (i + 1) * 3600 * 1000),
      price: 10,
      createdBy: admin._id,
    }))
  );
}

test("hold cap: a user can hold at most 3 slots, re-holding is free, releasing frees a seat", async () => {
  const { token } = await newUser();
  const slots = await makeSlots(5);

  for (let i = 0; i < 3; i++) expect((await hold(slots[i], token)).status).toBe(200);

  const fourth = await hold(slots[3], token);
  expect(fourth.status).toBe(429);
  expect((await Slot.findById(slots[3]._id)).status).toBe("AVAILABLE");

  expect((await hold(slots[0], token)).status).toBe(200); // re-hold: not counted twice

  const del = await auth(request(server).delete(`/api/slots/${slots[0]._id}/hold`), token);
  expect(del.status).toBe(204);
  expect((await hold(slots[3], token)).status).toBe(200);
});

test("hold cap holds under concurrency: 10 parallel holds on different slots -> exactly 3", async () => {
  const { user, token } = await newUser();
  const slots = await makeSlots(10);

  const responses = await Promise.all(slots.map((s) => hold(s, token)));
  const ok = responses.filter((r) => r.status === 200).length;
  const limited = responses.filter((r) => r.status === 429).length;
  console.log(`HOLD CAP: ${ok} holds allowed, ${limited} rejected with 429`);

  expect(ok).toBe(3);
  expect(limited).toBe(7);
  expect(await Slot.countDocuments({ heldBy: user._id, status: "HELD" })).toBe(3);
});

test("confirming a booking frees a hold seat", async () => {
  const { token } = await newUser();
  const slots = await makeSlots(4);

  for (let i = 0; i < 3; i++) await hold(slots[i], token);
  expect((await hold(slots[3], token)).status).toBe(429);

  expect((await confirm(slots[0], token)).status).toBe(201);
  expect((await hold(slots[3], token)).status).toBe(200);
});

test("losing a race does not leak hold quota", async () => {
  const winner = await newUser();
  const loser = await newUser();
  const contested = (await makeSlots(1))[0];
  const free = await makeSlots(3);

  expect((await hold(contested, winner.token)).status).toBe(200);
  for (let i = 0; i < 5; i++) expect((await hold(contested, loser.token)).status).toBe(409);

  // if the 5 failed attempts had kept their seats, these would hit the cap
  for (const s of free) expect((await hold(s, loser.token)).status).toBe(200);
});