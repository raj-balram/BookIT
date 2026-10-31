import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, tokenFor } from "./helpers.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

let ctx, server, User, Slot, admin, adminToken, userToken;
let n = 0;
const resource = () => `Res-${Date.now()}-${++n}`;

beforeAll(async () => {
  ctx = await startTestApp();
  server = ctx.server;
  ({ User, Slot } = ctx.models);
  admin = await User.create({ name: "Admin", email: "admin@slots.test", passwordHash: "x", role: "ADMIN" });
  const user = await User.create({ name: "User", email: "user@slots.test", passwordHash: "x" });
  adminToken = tokenFor(admin);
  userToken = tokenFor(user);
});
afterAll(() => ctx.stop());

const as = (token, req) => req.set("Authorization", `Bearer ${token}`);
const createSlot = (body, token = adminToken) => as(token, request(server).post("/api/admin/slots")).send(body);
const bulk = (body, token = adminToken) => as(token, request(server).post("/api/admin/slots/bulk")).send(body);
const list = (query, token = userToken) => as(token, request(server).get("/api/slots")).query(query);
const del = (id, token = adminToken) => as(token, request(server).delete(`/api/admin/slots/${id}`));

const insertSlot = (overrides = {}) => {
  const start = Date.now() + DAY;
  return Slot.create({
    resource: resource(), startTime: new Date(start), endTime: new Date(start + HOUR),
    createdBy: admin._id, ...overrides,
  });
};

test("admin creates a slot: AVAILABLE, price defaults to 0, custom price is kept", async () => {
  const start = Date.now() + DAY;
  const r = resource();
  const res = await createSlot({ resource: r, startTime: iso(start), endTime: iso(start + HOUR) });

  expect(res.status).toBe(201);
  expect(res.body.slot).toMatchObject({ resource: r, status: "AVAILABLE", price: 0 });

  const priced = await createSlot({ resource: resource(), startTime: iso(start), endTime: iso(start + HOUR), price: 150 });
  expect(priced.body.slot.price).toBe(150);
});

test("a second slot for the same resource and start time returns 409", async () => {
  const body = { resource: resource(), startTime: iso(Date.now() + DAY), endTime: iso(Date.now() + DAY + HOUR) };
  expect((await createSlot(body)).status).toBe(201);
  expect((await createSlot(body)).status).toBe(409);
});

test("invalid times are rejected with the offending field named", async () => {
  const start = Date.now() + DAY;

  const endBeforeStart = await createSlot({ resource: resource(), startTime: iso(start), endTime: iso(start - HOUR) });
  expect(endBeforeStart.status).toBe(400);
  expect(endBeforeStart.body.errors.map((e) => e.field)).toContain("endTime");

  const inThePast = await createSlot({ resource: resource(), startTime: iso(Date.now() - HOUR), endTime: iso(start) });
  expect(inThePast.status).toBe(400);
  expect(inThePast.body.errors.map((e) => e.field)).toContain("startTime");
});

test("non-admins get 403 and anonymous users get 401 on admin slot routes", async () => {
  const start = Date.now() + DAY;
  const body = { resource: resource(), startTime: iso(start), endTime: iso(start + HOUR) };
  const someId = new mongoose.Types.ObjectId().toString();

  expect((await createSlot(body, userToken)).status).toBe(403);
  expect((await bulk({ resource: resource(), from: iso(start), to: iso(start + 4 * HOUR), slotMinutes: 30 }, userToken)).status).toBe(403);
  expect((await del(someId, userToken)).status).toBe(403);
  expect((await request(server).post("/api/admin/slots").send(body)).status).toBe(401);
});

test("bulk creates contiguous slots with the price, and re-running it creates nothing", async () => {
  const r = resource();
  const from = Date.now() + 2 * DAY;
  const body = { resource: r, from: iso(from), to: iso(from + 4 * HOUR), slotMinutes: 30, price: 25 };

  const first = await bulk(body);
  expect(first.status).toBe(201);
  expect(first.body).toEqual({ requested: 8, created: 8, skipped: 0 });

  const second = await bulk(body);
  expect(second.body).toEqual({ requested: 8, created: 0, skipped: 8 });

  const docs = await Slot.find({ resource: r }).sort({ startTime: 1 }).lean();
  expect(docs).toHaveLength(8);
  expect(docs.every((d) => d.price === 25)).toBe(true);
  for (let i = 0; i < docs.length - 1; i++) {
    expect(docs[i].endTime).toEqual(docs[i + 1].startTime);
  }
});

test("bulk validates slot length, range order, minimum range and the 200-slot cap", async () => {
  const from = Date.now() + 2 * DAY;
  const base = { resource: resource(), from: iso(from), to: iso(from + 4 * HOUR), slotMinutes: 30 };

  expect((await bulk({ ...base, slotMinutes: 2 })).status).toBe(400);
  expect((await bulk({ ...base, to: iso(from - HOUR) })).status).toBe(400);

  const tooShort = await bulk({ ...base, to: iso(from + 10 * 60_000) });
  expect(tooShort.status).toBe(400);
  expect(tooShort.body.message).toMatch(/too short/i);

  const tooMany = await bulk({ ...base, to: iso(from + 201 * 5 * 60_000), slotMinutes: 5 });
  expect(tooMany.status).toBe(400);
  expect(tooMany.body.message).toMatch(/200/);
});

test("listing paginates without overlap, sorts by start time and hides private fields", async () => {
  const r = resource();
  const from = Date.now() + 3 * DAY;
  await bulk({ resource: r, from: iso(from), to: iso(from + 25 * HOUR), slotMinutes: 60, price: 5 }); // 25 slots

  const pages = [];
  for (const page of [1, 2, 3]) {
    const res = await list({ resource: r, limit: 10, page });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page, limit: 10, total: 25, totalPages: 3 });
    pages.push(res.body.items);
  }
  expect(pages.map((p) => p.length)).toEqual([10, 10, 5]);

  const all = pages.flat();
  expect(new Set(all.map((s) => s._id)).size).toBe(25); // no overlap between pages
  for (let i = 0; i < all.length - 1; i++) {
    expect(new Date(all[i].startTime).getTime()).toBeLessThanOrEqual(new Date(all[i + 1].startTime).getTime());
  }
  for (const item of all) {
    for (const hidden of ["heldBy", "bookedBy", "createdBy", "__v"]) {
      expect(item).not.toHaveProperty(hidden);
    }
  }
});

test("listing hides past slots by default and shows them when `from` is given", async () => {
  const r = resource();
  await insertSlot({ resource: r, startTime: new Date(Date.now() - 2 * HOUR), endTime: new Date(Date.now() - HOUR) });
  const upcoming = await insertSlot({ resource: r });

  const defaults = await list({ resource: r });
  expect(defaults.body.total).toBe(1);
  expect(defaults.body.items[0]._id).toBe(upcoming._id.toString());

  const withPast = await list({ resource: r, from: iso(Date.now() - 3 * HOUR) });
  expect(withPast.body.total).toBe(2);
});

test("listing filters by status and by exact resource", async () => {
  const r = resource();
  const start = Date.now() + DAY;
  const mk = (i, extra) => ({
    resource: r, startTime: new Date(start + i * HOUR), endTime: new Date(start + (i + 1) * HOUR),
    createdBy: admin._id, ...extra,
  });
  await Slot.insertMany([
    mk(0, {}),
    mk(1, { status: "HELD", heldBy: admin._id, holdExpiresAt: new Date(Date.now() + HOUR) }),
    mk(2, { status: "BOOKED", bookedBy: admin._id }),
  ]);
  await insertSlot(); // different resource, must never show up

  expect((await list({ resource: r })).body.total).toBe(3);
  expect((await list({ resource: r, status: "AVAILABLE" })).body.total).toBe(1);
  expect((await list({ resource: r, status: "HELD" })).body.total).toBe(1);
  expect((await list({ resource: r, status: "BOOKED" })).body.total).toBe(1);
});

test("listing rejects bad query parameters", async () => {
  expect((await list({ limit: 500 })).status).toBe(400);
  expect((await list({ limit: 0 })).status).toBe(400);
  expect((await list({ page: 0 })).status).toBe(400);
  expect((await list({ status: "FOO" })).status).toBe(400);
});

test("listing requires authentication", async () => {
  expect((await request(server).get("/api/slots")).status).toBe(401);
});

test("get by id: 200 with private fields hidden, 400 for a malformed id, 404 for an unknown one", async () => {
  const slot = await insertSlot();

  const ok = await as(userToken, request(server).get(`/api/slots/${slot._id}`));
  expect(ok.status).toBe(200);
  expect(ok.body.slot._id).toBe(slot._id.toString());
  expect(ok.body.slot).not.toHaveProperty("createdBy");

  expect((await as(userToken, request(server).get("/api/slots/abc"))).status).toBe(400);

  const unknown = new mongoose.Types.ObjectId().toString();
  expect((await as(userToken, request(server).get(`/api/slots/${unknown}`))).status).toBe(404);
});

test("admin deletes an AVAILABLE slot (204), deleting it again returns 404", async () => {
  const slot = await insertSlot();

  expect((await del(slot._id)).status).toBe(204);
  expect(await Slot.exists({ _id: slot._id })).toBeNull();
  expect((await del(slot._id)).status).toBe(404);
});

test("HELD and BOOKED slots cannot be deleted (409) and stay in the database", async () => {
  const held = await insertSlot({ status: "HELD", heldBy: admin._id, holdExpiresAt: new Date(Date.now() + HOUR) });
  const booked = await insertSlot({ status: "BOOKED", bookedBy: admin._id });

  expect((await del(held._id)).status).toBe(409);
  expect((await del(booked._id)).status).toBe(409);
  expect(await Slot.exists({ _id: held._id })).not.toBeNull();
  expect(await Slot.exists({ _id: booked._id })).not.toBeNull();
});

test("deleting with a malformed id returns 400", async () => {
  expect((await del("abc")).status).toBe(400);
});