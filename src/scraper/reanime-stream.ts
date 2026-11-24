import { HttpClient } from "./http-client.js";
import { decryptFlixCloudEmbed } from "./flixcloud-crypto.js";
import { decodeFlixPlaylist } from "./flixcloud-playlist.js";


const FLIX_HOSTS = new Set(["flixcloud.cc", "www.flixcloud.cc"]);
const REANIME_HOST = "reanime.cz";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function ensureAllowedUrl(raw: string, allowedHosts: Set<string>): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("URL host is not allowed for this resolver");
  }
  return url;
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  return Array.from(new Map(items.map((item) => [key(item), item])).values());
}

function decodeJsonEnvelope(input: unknown): any[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];
  const data = input as Record<string, unknown>;
  for (const key of ["servers", "episode_links", "data", "result"]) {
    if (Array.isArray(data[key])) return data[key] as any[];
    if (data[key] && typeof data[key] === "object") {
      const nested = decodeJsonEnvelope(data[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function linkType(raw: unknown): "sub" | "dub" | null {
  const type = String(raw || "").toLowerCase();
  if (type === "sub" || type === "s-sub") return "sub";
  if (type === "dub" || type === "s-dub") return "dub";
  return null;
}

export interface ReAnimeServer {
  name: string;
  type: "sub" | "dub";
  sourceId: string;
  embedUrl: string;
}

export interface ReAnimeStream {
  embedUrl: string;
  m3u8: string | null;
  hlsProxyUrl: string | null;
  referer: string;
  type: "hls" | "iframe";
  serverName: string;
  dataType: string;
  subtitles: { lang: string; url: string; default?: boolean }[];
  qualities: { label: string; url: string; bandwidth?: number; resolution?: string }[];
  audioTracks: { lang: string; name?: string; url?: string; default?: boolean }[];
  playlistKey: string | null;
  selectedAudioLang: string | null;
  intro: unknown;
  outro: unknown;
  thumbnailsVtt: string | null;
  videoTitle: string | null;
}

type SourcePayload = { animeId: string; episode: number; serverName: string; dataType: string; embedUrl: string };

function encodeSource(payload: SourcePayload): string {
  return "reanime:" + Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeSource(sourceId: string): SourcePayload {
  if (!sourceId.startsWith("reanime:")) throw new Error("Invalid ReAnime sourceId");
  const parsed = JSON.parse(Buffer.from(sourceId.slice(8), "base64url").toString("utf8")) as Partial<SourcePayload>;
  if (!parsed.animeId || !Number.isSafeInteger(parsed.episode) || !parsed.serverName || !parsed.dataType || !parsed.embedUrl) {
    throw new Error("Incomplete ReAnime sourceId");
  }
  ensureAllowedUrl(parsed.embedUrl, FLIX_HOSTS);
  return parsed as SourcePayload;
}

export class ReAnimeStreamResolver {
  private readonly http: HttpClient;
  constructor(http = new HttpClient()) { this.http = http; }

  async servers(animeId: string, episode: number): Promise<ReAnimeServer[]> {
    if (!Number.isSafeInteger(episode) || episode < 1) throw new Error("Episode must be a positive integer");
    const url = `https://${REANIME_HOST}/api/watch/${encodeURIComponent(animeId)}/${episode}`;
    const data = await this.http.getJson<any>(url, { referer: `https://${REANIME_HOST}/watch/${encodeURIComponent(animeId)}?ep=${episode}` });
    const links = decodeJsonEnvelope(data?.episode_links ?? data);
    const servers = links.map((link): ReAnimeServer | null => {
      const type = linkType(link?.dataType ?? link?.type);
      const embedUrl = typeof link?.dataLink === "string" ? link.dataLink : typeof link?.embedUrl === "string" ? link.embedUrl : "";
      if (!type || !embedUrl) return null;
      try { ensureAllowedUrl(embedUrl, FLIX_HOSTS); } catch { return null; }
      const name = String(link.serverName || (type === "sub" ? "SUB" : "DUB"));
      if (name === "HD-1") return null;
      return { name, type, embedUrl, sourceId: encodeSource({ animeId, episode, serverName: name, dataType: String(link.dataType || type), embedUrl }) };
    }).filter((item): item is ReAnimeServer => Boolean(item));
    return unique(servers, (item) => item.sourceId).sort((a, b) => (a.name === "HD-2" ? -1 : b.name === "HD-2" ? 1 : 0));
  }

  async resolve(sourceId: string): Promise<ReAnimeStream> {
    const payload = decodeSource(sourceId);
    const embedUrl = ensureAllowedUrl(payload.embedUrl, FLIX_HOSTS).toString();
    const html = await this.http.getText(embedUrl, { referer: `https://${REANIME_HOST}/`, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "user-agent": UA });
    const decrypted = await decryptFlixCloudEmbed(html, async (url, tokenReferer) => {
      return this.http.getJson<any>(url, { referer: tokenReferer, accept: "application/json, */*" });
    });
    const direct = decrypted.url;
    const allowedStream = ensureAllowedStreamUrl(direct);
    const playlistKey = decrypted.playlistKey;
    let hls = { qualities: [] as ReAnimeStream["qualities"], subtitles: [] as ReAnimeStream["subtitles"], audioTracks: [] as ReAnimeStream["audioTracks"] };
    const encryptedPlaylist = await this.http.getText(allowedStream.toString(), { referer: "https://flixcloud.cc/", accept: "*/*" });
    const decodedPlaylistText = decodeFlixPlaylist(encryptedPlaylist, playlistKey);
    if (!decodedPlaylistText.trimStart().startsWith("#EXTM3U")) throw new Error("FlixCloud returned an invalid HLS playlist");
    hls = parseHlsMaster(decodedPlaylistText, allowedStream.toString());
    const rawTracks = Array.isArray(decrypted.subtitles) ? decrypted.subtitles : [];
    for (const [index, track] of rawTracks.entries()) {
      const rawTrackUrl = track?.url || track?.file || track?.src;
      if (typeof rawTrackUrl !== "string") continue;
      let subtitleUrl: string;
      try { subtitleUrl = new URL(rawTrackUrl, direct).toString(); ensureAllowedStreamUrl(subtitleUrl); } catch { continue; }
      hls.subtitles.push({
        lang: String(track?.lang || track?.language || track?.label || track?.name || `Subtitle ${index + 1}`),
        url: subtitleUrl,
        default: Boolean(track?.default)
      });
    }
    const selectedAudioLang = payload.dataType === "dub" || payload.dataType === "s-dub" ? "eng"
      : payload.dataType === "sub" || payload.dataType === "s-sub" ? "jpn" : null;

