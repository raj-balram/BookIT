import express from "express";
import request from "supertest";

process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-secret";
process.env.MONGO_URI ??= "mongodb://placeholder/test";

let redis, app;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hit = (user) => request(app).get("/limited").set("x-user", user);

beforeAll(async () => {
  ({ redis } = await import("../src/config/redis.js"));
  const { rateLimit } = await import("../src/middleware/rateLimit.js");

  app = express();
  app.get(
    "/limited",
    // unique name per run so old counters can't affect the test
    rateLimit({ name: `test-${Date.now()}`, windowMs: 1000, max: 3, key: (req) => req.get("x-user") }),
    (req, res) => res.json({ ok: true })
  );
});

afterAll(() => redis.disconnect());

test("allows up to max requests, then returns 429 with Retry-After", async () => {
  for (let i = 0; i < 3; i++) {
    const res = await hit("a");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBe("3");
  }
  const blocked = await hit("a");
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  expect(blocked.headers["ratelimit-remaining"]).toBe("0");
});

test("different keys have independent limits", async () => {
  for (let i = 0; i < 3; i++) await hit("b");
  expect((await hit("b")).status).toBe(429);
  expect((await hit("c")).status).toBe(200);
});

test("the limit resets after the window passes", async () => {
  for (let i = 0; i < 4; i++) await hit("d");
  expect((await hit("d")).status).toBe(429);
  await sleep(1200);
  expect((await hit("d")).status).toBe(200);
});