import Redis from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.redisUrl);

redis.on("connect", () => console.log("Redis connected"));
redis.on("error", (err) => console.error("Redis error:", err.message));

// Fixed-window counter. INCR + PEXPIRE run as ONE atomic script, so a crash
// between them can never leave a counter without an expiry.
redis.defineCommand("rateHit", {
  numberOfKeys: 1,
  lua: `
    local c = redis.call('INCR', KEYS[1])
    if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
    local ttl = redis.call('PTTL', KEYS[1])
    if ttl < 0 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
      ttl = tonumber(ARGV[1])
    end
    return { c, ttl }
  `,
});

// Per-user set of held slots. Member = slotId, score = hold expiry time.
// Expired entries are removed on every call, so quota heals itself without a cleanup job.
redis.defineCommand("reserveHold", {
  numberOfKeys: 1,
  lua: `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
    if redis.call('ZSCORE', KEYS[1], ARGV[4]) then return 1 end
    if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
    redis.call('PEXPIRE', KEYS[1], ARGV[5])
    return 1
  `,
});