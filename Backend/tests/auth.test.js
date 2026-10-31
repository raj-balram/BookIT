import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { startTestApp, tokenFor } from "./helpers.js";

const PASSWORD = "Password123";
let ctx, server, User;
let n = 0;
const uniqueEmail = () => `user-${Date.now()}-${++n}@auth.test`;

beforeAll(async () => {
  ctx = await startTestApp();
  server = ctx.server;
  User = ctx.models.User;
});
afterAll(() => ctx.stop());

const register = (body) => request(server).post("/api/auth/register").send(body);
const login = (body) => request(server).post("/api/auth/login").send(body);
const me = (token) => request(server).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

async function newUser() {
  const email = uniqueEmail();
  const res = await register({ name: "Test User", email, password: PASSWORD });
  return { email, token: res.body.token, id: res.body.user.id };
}

test("register creates a USER, returns a token, and never exposes the password hash", async () => {
  const email = uniqueEmail();
  const res = await register({ name: "Test User", email, password: PASSWORD });

  expect(res.status).toBe(201);
  expect(res.body.user).toEqual({ id: expect.any(String), name: "Test User", email, role: "USER" });
  expect(res.body.token).toEqual(expect.any(String));
  expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

  const stored = await User.findOne({ email });
  expect(stored.passwordHash).not.toBe(PASSWORD);
  expect(await bcrypt.compare(PASSWORD, stored.passwordHash)).toBe(true);
});

test("register ignores role and isActive sent by the client (no privilege escalation)", async () => {
  const email = uniqueEmail();
  const res = await register({ name: "Sneaky", email, password: PASSWORD, role: "ADMIN", isActive: false });

  expect(res.status).toBe(201);
  expect(res.body.user.role).toBe("USER");
  const stored = await User.findOne({ email });
  expect(stored.role).toBe("USER");
  expect(stored.isActive).toBe(true);
});

test("register trims and lowercases the email", async () => {
  const base = uniqueEmail();
  const res = await register({ name: "Mixed Case", email: `  ${base.toUpperCase()}  `, password: PASSWORD });

  expect(res.status).toBe(201);
  expect(res.body.user.email).toBe(base);
});

test("registering the same email twice returns 409, even with different letter case", async () => {
  const email = uniqueEmail();
  expect((await register({ name: "First", email, password: PASSWORD })).status).toBe(201);
  expect((await register({ name: "Second", email, password: PASSWORD })).status).toBe(409);
  expect((await register({ name: "Third", email: email.toUpperCase(), password: PASSWORD })).status).toBe(409);
});

test("register validates input and reports which fields are wrong", async () => {
  const res = await register({ name: "B", email: "nope", password: "123" });

  expect(res.status).toBe(400);
  expect(res.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(["name", "email", "password"]));
});

test("register rejects passwords over 72 characters (bcrypt would silently truncate them)", async () => {
  const res = await register({ name: "Long", email: uniqueEmail(), password: "a".repeat(73) });
  expect(res.status).toBe(400);
});

test("login returns a token that works on /me", async () => {
  const { email } = await newUser();
  const res = await login({ email, password: PASSWORD });

  expect(res.status).toBe(200);
  const profile = await me(res.body.token);
  expect(profile.status).toBe(200);
  expect(profile.body.user.email).toBe(email);
});

test("wrong password and unknown email give the same 401 (no account enumeration)", async () => {
  const { email } = await newUser();
  const wrongPassword = await login({ email, password: "WrongPass123" });
  const unknownEmail = await login({ email: uniqueEmail(), password: PASSWORD });

  expect(wrongPassword.status).toBe(401);
  expect(unknownEmail.status).toBe(401);
  expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
});

test("login with missing fields returns 400", async () => {
  expect((await login({})).status).toBe(400);
  expect((await login({ email: uniqueEmail() })).status).toBe(400);
});

test("a deactivated account cannot log in, and logging in never reactivates it (regression for the NIC bug)", async () => {
  const { email } = await newUser();
  await User.updateOne({ email }, { isActive: false });

  const correct = await login({ email, password: PASSWORD });
  expect(correct.status).toBe(403);

  const wrong = await login({ email, password: "WrongPass123" });
  expect(wrong.status).toBe(401);

  expect((await User.findOne({ email })).isActive).toBe(false); // still deactivated
});

test("an existing token stops working the moment the account is deactivated", async () => {
  const { email, token } = await newUser();
  expect((await me(token)).status).toBe(200);

  await User.updateOne({ email }, { isActive: false });
  expect((await me(token)).status).toBe(401);
});

test("/me rejects a missing, garbage, expired or wrongly-signed token", async () => {
  const { id } = await newUser();

  expect((await request(server).get("/api/auth/me")).status).toBe(401);
  expect((await me("garbage")).status).toBe(401);

  const expired = jwt.sign(
    { role: "USER", exp: Math.floor(Date.now() / 1000) - 10 },
    process.env.JWT_SECRET,
    { subject: id }
  );
  expect((await me(expired)).status).toBe(401);

  const forged = jwt.sign({ role: "ADMIN" }, "not-the-real-secret", { subject: id, expiresIn: "1h" });
  expect((await me(forged)).status).toBe(401);
});

test("a valid token for a user that no longer exists is rejected", async () => {
  const { id, token } = await newUser();
  await User.deleteOne({ _id: id });

  const res = await me(token);
  expect(res.status).toBe(401);
});

test("role protection: ADMIN reaches admin routes, USER gets 403, anonymous gets 401", async () => {
  const user = await newUser();
  const admin = await User.create({
    name: "Admin", email: uniqueEmail(), passwordHash: "x", role: "ADMIN",
  });

  const ping = (token) => {
    const r = request(server).get("/api/admin/ping");
    return token ? r.set("Authorization", `Bearer ${token}`) : r;
  };

  expect((await ping(tokenFor(admin))).status).toBe(200);
  expect((await ping(user.token)).status).toBe(403);
  expect((await ping()).status).toBe(401);
});

test("malformed JSON returns 400, not 500", async () => {
  const res = await request(server)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send("{bad json");
  expect(res.status).toBe(400);
});

test("a body over 10kb returns 413", async () => {
  const res = await register({ name: "x".repeat(20_000), email: uniqueEmail(), password: PASSWORD });
  expect(res.status).toBe(413);
});

test("unknown routes return 404", async () => {
  const res = await request(server).get("/api/does-not-exist");
  expect(res.status).toBe(404);
});