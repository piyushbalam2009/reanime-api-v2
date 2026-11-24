function decodeFlixPlaylist(text: string, playlistKey?: string | null): string {
  if (text.trim().startsWith('#EXTM3U') || !playlistKey) return text;
  try {
    const key = Buffer.from(playlistKey, 'base64');
    const encrypted = Buffer.from(text.trim(), 'base64');
    if (!key.length || !encrypted.length) return text;
    const out = Buffer.alloc(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) out[i] = encrypted[i] ^ key[i % key.length];
    const decoded = out.toString('utf8');
    return decoded.startsWith('#EXTM3U') ? decoded : text;
  } catch {
    return text;
  }
}

function runDecrypt(wasmBytes: Uint8Array, frag1: Uint8Array, kf2: Uint8Array, tokenBytes: Uint8Array, seedInt: number): Uint8Array {
  const { step, transform } = parseWasmDecrypt(wasmBytes);
  const out = new Uint8Array(frag1.length);
  for (let i = 0; i < frag1.length; i++) {
    const c = (frag1[i] ^ kf2[i] ^ tokenBytes[i]) & 255;
    out[i] = (transform(c) ^ ((i * step + seedInt) & 255)) & 255;
  }
  return out;
}

async function decryptEmbed(html: string) {
  const data = parseJsLiteral(extractSsrObj(html));
  const seed = data.obfuscation_seed;
  if (!seed) throw new Error('obfuscation_seed missing');
  const fields = await deriveFields(seed);
  const obj = data.obfuscated_crypto_data?.[fields.containerName]?.[fields.arrayName]?.[0]?.[fields.objectName];
  if (!obj) throw new Error('obfuscated_crypto_data missing');

  const frag1 = b64toU8(obj[fields.keyField]);
  const iv = b64toU8(obj[fields.ivField]);
  const kf2 = b64toU8(data[fields.keyFrag2Field] ?? '');
  const token = data[fields.tokenField];
  if (!token) throw new Error('token field missing');

  const tokRes = await axios.get(`${FLIX}/api/m3u8/${token}`, {
    headers: { ...HEADERS, Referer: `${BASE}/` },
    timeout: 15000,
  });
  const tokData = tokRes.data;
  const vidKey = (await sha256hex(token + 'vid')).substring(0, 10);
  const keyKey = (await sha256hex(token + 'key')).substring(0, 10);
  const encryptedVideo = b64toU8(tokData[vidKey] ?? '');
  const tokenBytes = b64toU8(tokData[keyKey] ?? '');
  const wasmPayload = b64toU8(data.w_payload ?? '');
  if (!encryptedVideo.length || !tokenBytes.length || !wasmPayload.length) throw new Error('Token or wasm payload missing');

  const seedInt = parseInt(seed.substring(0, 8), 16);
  const wasmResult = await runWasmDecrypt(wasmPayload, frag1, kf2, tokenBytes, seedInt);
  const wasmOut = wasmResult.key;
  const keyMat = await crypto.subtle.importKey('raw', wasmOut, { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(seed), iterations: 1000, hash: 'SHA-256' }, keyMat, 256));
  for (let i = 0; i < 32; i++) derived[i] ^= seed.charCodeAt(i % seed.length);
  const aesKeyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', derived));
  const aesKey = await crypto.subtle.importKey('raw', aesKeyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, encryptedVideo);
  const url = dec.decode(plain).trim().replace(/\0+$/, '');
  if (!url.startsWith('http')) throw new Error(`Unexpected decrypted value: ${url.substring(0, 60)}`);

  return {
    url,
    playlistKey: wasmResult.playlistKey ? Buffer.from(wasmResult.playlistKey).toString('base64') : null,
    subtitles: data.subtitles ?? [],
    thumbnails_vtt: data.thumbnails_vtt ?? null,
    video_title: data.video_title ?? null,
    intro_chapter: data.intro_chapter ?? null,
    outro_chapter: data.outro_chapter ?? null,
  };
}

