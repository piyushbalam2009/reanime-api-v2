import { webcrypto as crypto } from "node:crypto";



const enc = new TextEncoder();
const dec = new TextDecoder();
declare const WebAssembly: any;










async function sha256hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64toU8(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function deriveFields(seed: string) {
  let e = seed;
  for (let i = 0; i < 3; i++) e = await sha256hex(e + i);
  let l = e;
  for (let i = 0; i < 3; i++) l = await sha256hex(l + i);
  return {
    keyField: 'kf_' + e.substring(8, 16),
    ivField: 'ivf_' + e.substring(16, 24),
    containerName: 'cd_' + e.substring(24, 32),
    arrayName: 'ad_' + e.substring(32, 40),
    objectName: 'od_' + e.substring(40, 48),
    tokenField: e.substring(48, 64) + '_' + e.substring(56, 64),
    keyFrag2Field: l.substring(0, 16) + '_' + l.substring(16, 24),
  };
}

function extractSsrObj(html: string): string {
  const m = html.match(/\{type:"data",data:(\{)/);
  if (!m || m.index === undefined) throw new Error('SSR data block not found');
  let depth = 0;
  const start = html.indexOf('{', m.index + m[0].length - 1);
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      if (--depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('SSR brace matching failed');
}

function parseJsLiteral(src: string): any {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const parseString = (quote: string) => {
    let out = '';
    i++;
    while (i < src.length && src[i] !== quote) {
      if (src[i] !== '\\') {
        out += src[i++];
        continue;
      }
      i++;
      const ch = src[i++];
      if (ch === 'u') {
        const hex = src.slice(i, i + 4);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        out += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', "'": "'", '\\': '\\', '/': '/' } as Record<string, string>)[ch] ?? ch;
      }
    }
    i++;
    return out;
  };
  const parseKey = () => {
    ws();
    if (src[i] === '"' || src[i] === "'") return parseString(src[i]);
    const m = src.slice(i).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (!m) throw new Error(`Bad key at pos ${i}`);
    i += m[0].length;
    return m[0];
  };
  const parseValue = (): any => {
    ws();
    if (src[i] === '{') return parseObject();
    if (src[i] === '[') return parseArray();
    if (src[i] === '"' || src[i] === "'") return parseString(src[i]);
    if (src.startsWith('true', i)) return i += 4, true;
    if (src.startsWith('false', i)) return i += 5, false;
    if (src.startsWith('null', i)) return i += 4, null;
    if (src.startsWith('undefined', i)) return i += 9, null;
    if (src.startsWith('!0', i)) return i += 2, true;
    if (src.startsWith('!1', i)) return i += 2, false;
    const m = src.slice(i).match(/^-?[\d.]+(?:[eE][+-]?\d+)?/);
    if (m) {
      i += m[0].length;
      return parseFloat(m[0]);
    }
    throw new Error(`JS parse error at pos ${i}: ${src.slice(i, i + 30)}`);
  };
  const parseObject = () => {
    const obj: Record<string, any> = {};
    i++;
    ws();
    while (i < src.length && src[i] !== '}') {
      if (src[i] === ',') {
        i++;
        ws();
        continue;
      }
      const key = parseKey();
      ws();
      if (src[i] !== ':') throw new Error(`Expected colon at pos ${i}`);
      i++;
      obj[key] = parseValue();
      ws();
    }
    i++;
    return obj;
  };
  const parseArray = () => {
    const arr: any[] = [];
    i++;
    ws();
    while (i < src.length && src[i] !== ']') {
      if (src[i] === ',') {
        i++;
        ws();
        continue;
      }
      arr.push(parseValue());
      ws();
    }
    i++;
    return arr;
  };
  return parseValue();
}

function parseWasmDecrypt(wasmBytes: Uint8Array) {
  const b = wasmBytes;
  let pos = 8;
  while (pos < b.length) {
    const secId = b[pos++];
    let sz = 0, sh = 0, by = 0;
    do {
      by = b[pos++];
      sz |= (by & 127) << sh;
      sh += 7;
    } while (by & 128);
    if (secId === 10) {
      pos++;
      let sbs = 0, sh2 = 0, by2 = 0;
      do {
        by2 = b[pos++];
        sbs |= (by2 & 127) << sh2;
        sh2 += 7;
      } while (by2 & 128);
      pos += sbs;
      break;
    }
    pos += sz;
  }
  let rbs = 0, sh3 = 0, by3 = 0;
  do {
    by3 = b[pos++];
    rbs |= (by3 & 127) << sh3;
    sh3 += 7;
  } while (by3 & 128);
  const r = b.slice(pos, pos + rbs);
  const leb = (arr: Uint8Array, idx: number): [number, number] => {
    let v = 0, s = 0, byte = 0;
    do {
      byte = arr[idx++];
      v |= (byte & 127) << s;
      s += 7;
    } while (byte & 128);
    return [v, idx];
  };

  const xorEnd = [32, 2, 32, 5, 106, 45, 0, 0, 115, 33, 6];
  let txStart = -1;
  outer: for (let i = 0; i < r.length - xorEnd.length; i++) {
    for (let j = 0; j < xorEnd.length; j++) if (r[i + j] !== xorEnd[j]) continue outer;
    txStart = i + xorEnd.length;
    break;
  }
  if (txStart < 0) throw new Error('WASM: transform start not found');

  let txEnd = -1, step = 36;
  for (let i = txStart; i < r.length - 4; i++) {
    if (r[i] === 32 && r[i + 1] === 5 && r[i + 2] === 65) {
      const [val, ni] = leb(r, i + 3);
      if (r[ni] === 108) {
        txEnd = i;
        step = val;
        break;
      }
    }
  }
  if (txEnd < 0) throw new Error('WASM: keystream not found');
  const code = r.slice(txStart, txEnd);

  const transform = (inputByte: number) => {
    let local6 = inputByte & 255;
    const stk: number[] = [];
    let i = 0;
    while (i < code.length) {
      const op = code[i++];
      if (op === 32) {
        const [idx, ni] = leb(code, i);
        i = ni;
        stk.push(idx === 6 ? local6 : 0);
      } else if (op === 33) {
        const [idx, ni] = leb(code, i);
        i = ni;
        const v = stk.pop() ?? 0;
        if (idx === 6) local6 = v & 255;
      } else if (op === 65) {
        const [v, ni] = leb(code, i);
        i = ni;
        stk.push(v);
      } else if (op === 106) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a + b2) & 255);
      } else if (op === 107) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a - b2 + 256) & 255);
      } else if (op === 113) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a & b2) & 255);
      } else if (op === 114) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a | b2) & 255);
      } else if (op === 115) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a ^ b2) & 255);
      } else if (op === 116) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a << (b2 & 7)) & 255);
      } else if (op === 118) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a >>> (b2 & 7)) & 255);
      }
    }
    return local6;
  };
  return { step, transform };
}

async function runWasmDecrypt(wasmBytes: Uint8Array, frag1: Uint8Array, kf2: Uint8Array, tokenBytes: Uint8Array, seedInt: number): Promise<{ key: Uint8Array; playlistKey: Uint8Array | null }> {
  try {
    const wasm = await WebAssembly.instantiate(wasmBytes, {});
    const instance: any = 'instance' in wasm ? wasm.instance : wasm;
    const exports: any = instance.exports;
    const memory = exports.memory;
    if (!memory || typeof exports._s !== 'function' || typeof exports._r !== 'function') throw new Error('Required WASM exports missing');
    if (memory.buffer.byteLength === 0) memory.grow(1);
    const heap = new Uint8Array(memory.buffer);
    const len = frag1.length;
    const fragOffset = 1000;
    const keyFragOffset = fragOffset + len;
    const tokenOffset = keyFragOffset + len;
    const outOffset = tokenOffset + len;
    heap.set(frag1, fragOffset);
    heap.set(kf2, keyFragOffset);
    heap.set(tokenBytes, tokenOffset);
    exports._s(seedInt);
    exports._r(fragOffset, keyFragOffset, tokenOffset, outOffset, len);
    const key = new Uint8Array(len);
    key.set(new Uint8Array(memory.buffer).subarray(outOffset, outOffset + len));
    let playlistKey: Uint8Array | null = null;
    if (typeof exports._c === 'function') {
      const ptr = Number(exports._c());
      if (Number.isFinite(ptr) && ptr >= 0) {
        playlistKey = new Uint8Array(32);
        playlistKey.set(new Uint8Array(memory.buffer).subarray(ptr, ptr + 32));
      }
    }
    return { key, playlistKey };
  } catch {
    const { step, transform } = parseWasmDecrypt(wasmBytes);
    const key = new Uint8Array(frag1.length);
    for (let i = 0; i < frag1.length; i++) {
      const c = (frag1[i] ^ kf2[i] ^ tokenBytes[i]) & 255;
      key[i] = (transform(c) ^ ((i * step + seedInt) & 255)) & 255;
    }
    return { key, playlistKey: null };
  }
}

export interface FlixCloudDecrypted {
  url: string;
  playlistKey: string | null;
  subtitles: any[];
  thumbnails_vtt: string | null;
  video_title: string | null;
  intro_chapter: unknown;
  outro_chapter: unknown;
}

export async function decryptFlixCloudEmbed(
  html: string,
  getJson: (url: string, referer: string) => Promise<any>
): Promise<FlixCloudDecrypted> {
  const data = parseJsLiteral(extractSsrObj(html));
  const seed = data.obfuscation_seed;
  if (!seed) throw new Error("FlixCloud obfuscation_seed missing");
  const fields = await deriveFields(seed);
  const obj = data.obfuscated_crypto_data?.[fields.containerName]?.[fields.arrayName]?.[0]?.[fields.objectName];
  if (!obj) throw new Error("FlixCloud obfuscated_crypto_data missing");
  const frag1 = b64toU8(obj[fields.keyField]);
  const iv = b64toU8(obj[fields.ivField]);
  const kf2 = b64toU8(data[fields.keyFrag2Field] ?? "");
  const token = data[fields.tokenField];
  if (!token) throw new Error("FlixCloud token field missing");
  const tokenData = await getJson("https://flixcloud.cc/api/m3u8/" + encodeURIComponent(token), "https://reanime.cz/");
  const vidKey = (await sha256hex(token + "vid")).substring(0, 10);
  const keyKey = (await sha256hex(token + "key")).substring(0, 10);
  const encryptedVideo = b64toU8(tokenData[vidKey] ?? "");
  const tokenBytes = b64toU8(tokenData[keyKey] ?? "");
  const wasmPayload = b64toU8(data.w_payload ?? "");
  if (!encryptedVideo.length || !tokenBytes.length || !wasmPayload.length) throw new Error("FlixCloud token or WASM payload missing");
  const seedInt = parseInt(seed.substring(0, 8), 16);
  const wasmResult = await runWasmDecrypt(wasmPayload, frag1, kf2, tokenBytes, seedInt);
  const keyMaterial = await crypto.subtle.importKey("raw", wasmResult.key, { name: "PBKDF2" }, false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(seed), iterations: 1000, hash: "SHA-256" }, keyMaterial, 256));
  for (let i = 0; i < 32; i++) derived[i] ^= seed.charCodeAt(i % seed.length);
  const aesKeyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", derived));
  const aesKey = await crypto.subtle.importKey("raw", aesKeyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, encryptedVideo);
  const url = dec.decode(plain).trim().replace(/\0+$/, "");
  if (!url.startsWith("https://")) throw new Error("FlixCloud decrypted value is not an HTTPS URL");
  return {
    url,
    playlistKey: wasmResult.playlistKey ? Buffer.from(wasmResult.playlistKey).toString("base64") : null,
    subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
    thumbnails_vtt: data.thumbnails_vtt ?? null,
    video_title: data.video_title ?? null,
    intro_chapter: data.intro_chapter ?? null,
    outro_chapter: data.outro_chapter ?? null
  };
}
