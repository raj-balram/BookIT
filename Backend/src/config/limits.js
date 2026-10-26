const prod = process.env.NODE_ENV === "production";

export const HOLD_MS = 5 * 60 * 1000;
export const MAX_ACTIVE_HOLDS = 3;

// dev limits for login/register are loose so your request.http testing doesn't lock you out
export const LIMITS = {
  global: { windowMs: 60_000, max: 300 }, // per IP
  register: { windowMs: 60 * 60_000, max: prod ? 5 : 100 }, // per IP
  login: { windowMs: 15 * 60_000, max: prod ? 10 : 200 }, // per IP + email
  hold: { windowMs: 60_000, max: 30 }, // per user
  confirm: { windowMs: 60_000, max: 20 }, // per user
};