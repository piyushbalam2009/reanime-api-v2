import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
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
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok", service: "reanime-api-v2" } }));
  app.use("/api/v1", createRoutes(service));
  app.use(notFound);
  app.use(errorHandler);
  return { app, service };
}
