import { logger } from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    if (req.path === "/health") return; // load balancers poll this constantly
    logger.info(
      {
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
        user: req.user?._id?.toString(),
      },
      "request"
    );
  });
  next();
}