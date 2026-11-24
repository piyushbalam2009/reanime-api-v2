import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ScraperService } from "./services/scraper.service.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { logger } from "./utils/logger.js";
import { createRoutes } from "./routes.js";

export function createApp(service = new ScraperService()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  // Lightweight request logging avoids pino-http CJS/ESM typing differences.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info({ method: req.method, url: req.originalUrl, statusCode: res.statusCode, responseTimeMs: Date.now() - startedAt }, "request completed");
    });
    next();
  });

  app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok", service: "reanime-api-v2" } }));
  app.use("/api/v1", createRoutes(service));
  app.use(notFound);
  app.use(errorHandler);
  return { app, service };
}
