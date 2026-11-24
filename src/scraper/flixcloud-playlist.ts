export function decodeFlixPlaylist(text: string, playlistKey?: string | null): string {
  if (text.trim().startsWith("#EXTM3U") || !playlistKey) return text;
  try {
    const key = Buffer.from(playlistKey, "base64");
    const encrypted = Buffer.from(text.trim(), "base64");
    if (!key.length || !encrypted.length) return text;
    const out = Buffer.alloc(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) out[i] = encrypted[i] ^ key[i % key.length];
    const decoded = out.toString("utf8");
    return decoded.startsWith("#EXTM3U") ? decoded : text;
  } catch {
    return text;
  }
}
