import type { ErrorRequestHandler, RequestHandler } from "express";
import { logger } from "../utils/logger.js";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  logger.error({ err: error }, "Request failed");
  res.status(502).json({ success: false, error: { code: "UPSTREAM_ERROR", message } });
};
