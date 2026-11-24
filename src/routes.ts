import { Router } from "express";
import { z } from "zod";
import type { ScraperService } from "./services/scraper.service.js";

export function createRoutes(service: ScraperService): Router {
  const router = Router();

  router.get("/search", async (req, res, next) => {
    const parsed = z.string().trim().min(1).max(120).safeParse(req.query.q);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: "INVALID_QUERY", message: "Query parameter q must contain 1–120 characters" } });
      return;
    }
    try { res.json({ success: true, data: await service.search(parsed.data) }); } catch (error) { next(error); }
  });

  router.get("/anime/:id", async (req, res, next) => {
    const id = z.string().trim().min(1).max(180).safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, error: { code: "INVALID_ID", message: "Invalid anime id" } });
      return;
    }
    try { res.json({ success: true, data: await service.details(id.data) }); } catch (error) { next(error); }
  });

  router.get("/anime/:id/episodes", async (req, res, next) => {
    const id = z.string().trim().min(1).max(180).safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, error: { code: "INVALID_ID", message: "Invalid anime id" } });
      return;
    }
    try { res.json({ success: true, data: await service.episodes(id.data) }); } catch (error) { next(error); }
  });

  return router;
}
