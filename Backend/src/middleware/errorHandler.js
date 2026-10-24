import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Express recognises an error handler by its 4 parameters, keep all of them
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON body" });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: "Resource already exists" });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid id" });
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ message: "Internal server error" });
}