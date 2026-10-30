const prod = process.env.NODE_ENV === "production";

// Load-test mode removes per-IP / per-user rate limits so we measure raw throughput.
// It can never be enabled in production.
export const LOAD_MODE = process.env.LOAD_TEST === "1" && !prod;
const unlimited = 1_000_000;

export const HOLD_MS = 5 * 60 * 1000;
export const MAX_ACTIVE_HOLDS = 3;

export const LIMITS = {
  global: { windowMs: 60_000, max: 300 },
  register: { windowMs: 60 * 60_000, max: prod ? 5 : 100 },
  login: { windowMs: 15 * 60_000, max: prod ? 10 : 200 },
  hold: { windowMs: 60_000, max: LOAD_MODE ? unlimited : 30 },
  confirm: { windowMs: 60_000, max: LOAD_MODE ? unlimited : 20 },
};