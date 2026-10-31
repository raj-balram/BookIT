import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("1d"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}
const e = parsed.data;

if (e.NODE_ENV === "production" && (e.JWT_SECRET.length < 32 || /change-this/i.test(e.JWT_SECRET))) {
  throw new Error("JWT_SECRET must be at least 32 random characters in production");
}

export const env = {
  nodeEnv: e.NODE_ENV,
  port: e.PORT,
  mongoUri: e.MONGO_URI,
  redisUrl: e.REDIS_URL,
  jwtSecret: e.JWT_SECRET,
  jwtExpiresIn: e.JWT_EXPIRES_IN,
};