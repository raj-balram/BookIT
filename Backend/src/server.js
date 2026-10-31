import mongoose from "mongoose";
import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { redis } from "./config/redis.js";
import { startHoldReaper } from "./jobs/releaseExpiredHolds.js";
import { logger } from "./utils/logger.js";

async function start() {
  await connectDB();
  const stopReaper = startHoldReaper();
  const server = app.listen(env.port, () => console.log(`Server running on port ${env.port}`));

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down: finishing in-flight requests");

    // hard stop if something hangs, so a deploy never waits forever
    setTimeout(() => {
      logger.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000).unref();

    stopReaper();
    server.close(async () => {
      try {
        await mongoose.disconnect();
        await redis.quit();
        logger.info("Shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "Error during shutdown");
        process.exit(1);
      }
    });
    server.closeIdleConnections?.(); // don't wait on idle keep-alive connections
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});