import { Router } from "express";
import { z } from "zod";
import type { ScraperService } from "./services/scraper.service.js";
import { HttpClient } from "./scraper/http-client.js";
import { decodeFlixPlaylist } from "./scraper/flixcloud-playlist.js";
import { ReAnimeStreamResolver, rewriteHlsPlaylist } from "./scraper/reanime-stream.js";

const resolver = new ReAnimeStreamResolver();
const proxyHttp = new HttpClient();
const FLIX_HOST = "flixcloud.cc";

function publicBase(req: import("express").Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

function assertAllowedProxyUrl(raw: string): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const allowed = host === FLIX_HOST || host.endsWith("." + FLIX_HOST)
    || host === "reanime.cz" || host.endsWith(".reanime.cz")
    || host.endsWith(".flixcdn.com") || host.endsWith(".flixcdn.net")
    || host.endsWith(".cloudfront.net") || host.endsWith(".akamaized.net")
    || host.endsWith(".flixcloud-cdn.com") || host.endsWith(".flixcdn.cc")
    || host.endsWith(".cloudflarestream.com") || host.endsWith(".streamtape.com");
  if (url.protocol !== "https:" || !allowed) throw new Error("Proxy URL host is not allowed");
  return url;
}

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

  // Return the real ReAnime server/FlixCloud embed links for one episode.
  router.get("/anime/:id/episodes/:episode/servers", async (req, res) => {
    const episode = z.coerce.number().int().positive().safeParse(req.params.episode);
    const id = z.string().trim().min(1).max(180).safeParse(req.params.id);
    if (!id.success || !episode.success) return res.status(400).json({ success: false, error: { code: "INVALID_EPISODE", message: "Invalid anime ID or episode number" } });
    const type = typeof req.query.type === "string" ? req.query.type.toLowerCase() : "all";
    if (!["all", "sub", "dub"].includes(type)) return res.status(400).json({ success: false, error: { code: "INVALID_TYPE", message: "type must be all, sub, or dub" } });
    try {
      const servers = await resolver.servers(id.data, episode.data);
      const filtered = type === "all" ? servers : servers.filter((server) => server.type === type);
      return res.json({ success: true, data: { animeId: id.data, episode: episode.data, type, servers: filtered } });
    } catch (error) {
      return res.status(502).json({ success: false, error: { code: "REANIME_SERVERS_FAILED", message: error instanceof Error ? error.message : String(error) } });
    }
  });

  // Resolve a selected server sourceId into a direct HLS playlist (where the
  // embed provides one in its HTML) and API-proxied playback URLs.
  router.get("/stream/reanime/:sourceId", async (req, res) => {
    try {
      const stream = await resolver.resolve(req.params.sourceId);
      const base = publicBase(req);
      const hlsProxyUrl = stream.m3u8
        ? `${base}/api/v1/proxy/hls?url=${encodeURIComponent(stream.m3u8)}&ref=${encodeURIComponent(stream.referer)}`
        : null;
      return res.json({
        success: true,
        data: {
          ...stream,
          hlsProxyUrl,
          qualities: stream.qualities.map((quality) => ({
            ...quality,
            hlsProxyUrl: `${base}/api/v1/proxy/hls?url=${encodeURIComponent(quality.url)}&ref=${encodeURIComponent(stream.referer)}`
          })),
          audioTracks: stream.audioTracks.map((track) => ({
            ...track,
            ...(track.url ? { hlsProxyUrl: `${base}/api/v1/proxy/hls?url=${encodeURIComponent(track.url)}&ref=${encodeURIComponent(stream.referer)}` } : {})
          })),
          subtitles: stream.subtitles.map((track) => ({
            ...track,
            proxyUrl: `${base}/api/v1/proxy/subtitle?url=${encodeURIComponent(track.url)}&ref=${encodeURIComponent(stream.referer)}`
          }))
        }
      });
    } catch (error) {
      return res.status(502).json({ success: false, error: { code: "REANIME_STREAM_FAILED", message: error instanceof Error ? error.message : String(error) } });
    }
  });

  // HLS proxy: only ReAnime/FlixCloud and known stream CDN families are accepted.
  // Every URI in the playlist is rewritten back through this endpoint.
  router.get("/proxy/hls", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    const referer = typeof req.query.ref === "string" ? req.query.ref : "https://flixcloud.cc/";
    if (!rawUrl) return res.status(400).json({ success: false, error: { code: "MISSING_URL", message: "url is required" } });
    try {
      const url = assertAllowedProxyUrl(rawUrl);
      if (!referer.startsWith("https://flixcloud.cc/") && !referer.startsWith("https://reanime.cz/")) throw new Error("Invalid stream referer");
      const likelyPlaylist = url.pathname.toLowerCase().endsWith(".m3u8");
      if (likelyPlaylist) {
        const encryptedBody = await proxyHttp.getText(url.toString(), { referer, accept: "*/*" });
        const playlistKey = typeof req.query.pk === "string" ? req.query.pk : undefined;
        const body = decodeFlixPlaylist(encryptedBody, playlistKey);
        if (!body.trimStart().startsWith("#EXTM3U")) return res.status(502).json({ success: false, error: { code: "INVALID_PLAYLIST", message: "Upstream did not return HLS playlist data" } });
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-store");
        return res.type("application/vnd.apple.mpegurl").send(rewriteHlsPlaylist(body, url.toString(), publicBase(req) + "/api/v1/proxy/hls", referer, playlistKey));
      }
      const bytes = await proxyHttp.getBytes(url.toString(), { referer, accept: "*/*", ...(typeof req.headers.range === "string" ? { range: req.headers.range } : {}) });
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=30");
      if (typeof req.headers.range === "string") res.setHeader("Accept-Ranges", "bytes");
      if (url.pathname.toLowerCase().endsWith(".ts")) res.type("video/mp2t");
      else if (/\.(m4s|mp4)$/i.test(url.pathname)) res.type("video/mp4");
      else res.type("application/octet-stream");
      return res.send(Buffer.from(bytes));
    } catch (error) {
      return res.status(502).json({ success: false, error: { code: "HLS_PROXY_FAILED", message: error instanceof Error ? error.message : String(error) } });
    }
  });

  router.get("/proxy/subtitle", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    const referer = typeof req.query.ref === "string" ? req.query.ref : "https://flixcloud.cc/";
    if (!rawUrl) return res.status(400).json({ success: false, error: { code: "MISSING_URL", message: "url is required" } });
    try {
      const url = assertAllowedProxyUrl(rawUrl);
      const text = await proxyHttp.getText(url.toString(), { referer, accept: "*/*" });
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.type("text/vtt");
      return res.send(text.startsWith("WEBVTT") ? text : "WEBVTT\n\n" + text);
    } catch (error) {
      return res.status(502).json({ success: false, error: { code: "SUBTITLE_PROXY_FAILED", message: error instanceof Error ? error.message : String(error) } });
    }
  });

  return router;
}
