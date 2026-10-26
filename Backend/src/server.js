import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { startHoldReaper } from "./jobs/releaseExpiredHolds.js";

async function start() {
  await connectDB();
  startHoldReaper();
  app.listen(env.port, () => console.log(`Server running on port ${env.port}`));
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});