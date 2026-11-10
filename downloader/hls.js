import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SIBLING_AUDIO_NAMES = [
  "sublist_aud1.txt",
  "sublist_aud0.txt",
  "sublist_aud2.txt",
  "sublist_aud3.txt",
  "audio.txt",
  "aud1.txt",
  "audio.m3u8",
  "index-aflac.m3u8",
  "index-a.m3u8",
];

export async function probeHls(masterUrl, { headers = {} } = {}) {
  const masterText = await fetchText(masterUrl, headers);
  if (!isPlaylist(masterText)) {
    throw new Error("Geçerli HLS playlist değil (CDN engeli veya süresi dolmuş URL)");
  }

  if (!masterText.includes("#EXT-X-STREAM-INF")) {
    return {
      master: false,
      qualities: [
        {
          id: "media",
          label: "Tek akış",
          bandwidth: 0,
          resolution: "",
          url: masterUrl,
          auto: true,
        },
      ],
      audios: [],
      autoId: "media",
    };
  }

  const audios = parseAudioRenditions(masterText, masterUrl);
  const qualities = parseVariants(masterText, masterUrl);
  if (!qualities.length) throw new Error("HLS varyant bulunamadı");
  const auto = qualities[0];
  for (const q of qualities) q.auto = q.id === auto.id;
  return { master: true, qualities, audios, autoId: auto.id };
}

export async function downloadHls(
  masterUrl,
  outPath,
  { headers = {}, onProgress, quality = "auto", audio = "auto", audioUrls = [] } = {}
) {
  const hdrs = normalizeHeaders(headers);
  const masterText = await fetchText(masterUrl, hdrs);
  if (!isPlaylist(masterText)) {
    throw new Error("Playlist alınamadı — Referer/çerez veya imzalı URL geçersiz");
  }

  let videoPlaylistUrl = masterUrl;
  let selected = null;
  let audios = [];

  if (masterText.includes("#EXT-X-STREAM-INF")) {
    audios = parseAudioRenditions(masterText, masterUrl);
    const variants = parseVariants(masterText, masterUrl);
    selected = pickVariant(variants, quality);
    videoPlaylistUrl = selected.url;
  }

  const audioCandidates = buildAudioCandidates({
    masterUrl,
    selected,
    audios,
    audio,
    audioUrls,
  });

  const base = outPath.replace(/\.(ts|mp4|m3u8|part)$/i, "");
  const videoPart = `${base}.video.ts`;
  const audioPart = `${base}.audio.ts`;
  const muxedMp4 = `${base}.mp4`;

  await downloadMediaPlaylist(videoPlaylistUrl, videoPart, hdrs, (p) => {
    onProgress?.(audioCandidates.length ? Math.round(p * 0.65) : Math.round(p * 0.9));
  });

  let audioOk = false;
  let lastAudioErr = null;
  for (const aUrl of audioCandidates) {
    try {
      console.log("[hls] ses deneniyor:", aUrl);
      await downloadMediaPlaylist(aUrl, audioPart, hdrs, (p) => {
        onProgress?.(65 + Math.round(p * 0.2));
      });
      const st = fs.statSync(audioPart);
      if (st.size > 50_000) {
        audioOk = true;
        break;
      }
      lastAudioErr = new Error(`ses çok küçük (${st.size} B)`);
      await fsp.unlink(audioPart).catch(() => {});
    } catch (e) {
      lastAudioErr = e;
      console.warn("[hls] ses adayı başarısız:", e?.message || e);
      await fsp.unlink(audioPart).catch(() => {});
      await fsp.unlink(`${audioPart}.part`).catch(() => {});
    }
  }

  if (!audioOk && lastAudioErr) {
    console.warn("[hls] ses alınamadı, video-only mp4 denenecek:", lastAudioErr.message);
  }

  onProgress?.(88);

  let finalPath = muxedMp4;
  if (audioOk) {
    await muxAv(videoPart, audioPart, muxedMp4);
    await fsp.unlink(videoPart).catch(() => {});
    await fsp.unlink(audioPart).catch(() => {});
  } else {
    // IDM gibi yine .mp4 üret (sessiz olsa bile)
    try {
      await remuxTsToMp4(videoPart, muxedMp4);
      await fsp.unlink(videoPart).catch(() => {});
    } catch {
      const fallback = `${base}.ts`;
      await fsp.rename(videoPart, fallback).catch(async () => {
        await fsp.copyFile(videoPart, fallback);
        await fsp.unlink(videoPart).catch(() => {});
      });
      finalPath = fallback;
    }
  }

  onProgress?.(100);
  if (!audioOk) {
    console.warn("[hls] uyarı: ses birleştirilemedi →", finalPath);
  }
  return finalPath;
}

export async function remuxFiles(videoPath, audioPath, outPath) {
  await muxAv(videoPath, audioPath, outPath);
  return outPath;
}

function buildAudioCandidates({ masterUrl, selected, audios, audio, audioUrls }) {
  const out = [];
  const add = (u) => {
    if (!u || out.includes(u)) return;
    out.push(u);
  };

  for (const u of audioUrls || []) add(u);

  if (selected?.audioGroup && audios?.length) {
    const track = pickAudio(audios, selected.audioGroup, audio);
    if (track?.url) add(track.url);
  }
  if (audios?.length) {
    const track = pickAudio(audios, audios[0].groupId, audio);
    if (track?.url) add(track.url);
    for (const a of audios) add(a.url);
  }

  // Bu CDN ailesi: .../txt/master.txt yanında sublist_aud1.txt (aynı imza query)
  for (const name of SIBLING_AUDIO_NAMES) add(siblingUrl(masterUrl, name));

  return out;
}

function siblingUrl(masterUrl, filename) {
  try {
    const u = new URL(masterUrl);
    u.pathname = u.pathname.replace(/[^/]+$/, filename);
    return u.toString();
  } catch {
    return null;
  }
}

async function downloadMediaPlaylist(playlistUrl, outFile, headers, onProgress) {
  const text = await fetchText(playlistUrl, headers);
  if (!isPlaylist(text)) throw new Error(`Media playlist değil: ${playlistUrl.slice(0, 100)}`);
  if (/METHOD=SAMPLE-AES/i.test(text)) {
    throw new Error("SAMPLE-AES (DRM benzeri) desteklenmiyor");
  }

  const { initSegment, segments } = parseMediaPlaylist(text, playlistUrl);
  if (!segments.length) throw new Error("HLS segment bulunamadı");

  const keyCache = new Map();
  const tmp = `${outFile}.part`;
  const out = fs.createWriteStream(tmp);
  const writeBuf = (buf) =>
    new Promise((resolve, reject) => {
      out.write(buf, (err) => (err ? reject(err) : resolve()));
    });

  if (initSegment) {
    await writeBuf(await fetchBufferRetry(initSegment.url, headers));
  }

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    let buf = await fetchBufferRetry(seg.url, headers);
    if (seg.key?.method === "AES-128") {
      const keyBuf = await getKey(seg.key.uri, headers, keyCache);
      const iv = seg.key.iv || sequenceIv(seg.seq);
      buf = decryptAes128(buf, keyBuf, iv);
    }
    await writeBuf(buf);
    onProgress?.(Math.round(((i + 1) / segments.length) * 100));
    // CDN rate-limit / ECONNRESET azaltmak için kısa nefes
    if (i > 0 && i % 20 === 0) await sleep(150);
  }

  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  await fsp.rename(tmp, outFile).catch(async () => {
    await fsp.copyFile(tmp, outFile);
    await fsp.unlink(tmp);
  });
}

function parseAudioRenditions(text, baseUrl) {
  const list = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("#EXT-X-MEDIA:")) continue;
    if (!/TYPE=AUDIO/i.test(line)) continue;
    const groupId = (line.match(/GROUP-ID="([^"]+)"/) || [])[1] || "";
    const name = (line.match(/NAME="([^"]+)"/) || [])[1] || "audio";
    const language = (line.match(/LANGUAGE="([^"]+)"/) || [])[1] || "";
    const uri = (line.match(/URI="([^"]+)"/) || [])[1];
    const isDefault = /DEFAULT=YES/i.test(line);
    const autoselect = /AUTOSELECT=YES/i.test(line);
    if (!uri) continue;
    list.push({
      id: `a${list.length}`,
      groupId,
      name,
      language,
      default: isDefault,
      autoselect,
      url: new URL(uri, baseUrl).toString(),
    });
  }
  return list;
}

function parseVariants(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const list = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const uri = lines[i + 1]?.trim();
    if (!uri || uri.startsWith("#")) continue;

    const bandwidth = Number((line.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
    const resolution = (line.match(/RESOLUTION=([\dx]+)/i) || [])[1] || "";
    const name = (line.match(/NAME="([^"]+)"/) || [])[1] || "";
    const codecs = (line.match(/CODECS="([^"]+)"/) || [])[1] || "";
    const audioGroup = (line.match(/AUDIO="([^"]+)"/) || [])[1] || "";
    const height = Number(resolution.split("x")[1] || 0);
    const label =
      name ||
      (resolution ? `${resolution}${bandwidth ? ` · ${formatBw(bandwidth)}` : ""}` : null) ||
      (bandwidth ? formatBw(bandwidth) : `varyant-${list.length + 1}`);

    list.push({
      id: `q${list.length}`,
      label,
      bandwidth,
      resolution,
      height,
      codecs,
      audioGroup,
      url: new URL(uri, baseUrl).toString(),
      auto: false,
    });
  }
  return list.sort((a, b) => b.bandwidth - a.bandwidth || b.height - a.height);
}

function pickVariant(variants, quality) {
  if (!variants.length) throw new Error("HLS varyant bulunamadı");
  if (!quality || quality === "auto") return variants[0];
  return (
    variants.find((v) => v.id === quality) ||
    variants.find((v) => v.url === quality) ||
    variants.find((v) => v.height === Number(String(quality).replace(/p$/i, ""))) ||
    variants[0]
  );
}

function pickAudio(audios, groupId, preference = "auto") {
  const inGroup = audios.filter((a) => !groupId || a.groupId === groupId);
  const pool = inGroup.length ? inGroup : audios;
  if (!pool.length) return null;
  if (preference && preference !== "auto") {
    const byId = pool.find((a) => a.id === preference || a.name === preference);
    if (byId) return byId;
  }
  const tr = pool.find((a) => /tr|tur|türk|dublaj|dual/i.test(`${a.name} ${a.language}`));
  if (tr) return tr;
  return pool.find((a) => a.default) || pool.find((a) => a.autoselect) || pool[0];
}

async function muxAv(videoPath, audioPath, outPath) {
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg yok");
  await runCmd(ffmpeg, [
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c",
    "copy",
    "-shortest",
    outPath,
  ]);
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1000) {
    throw new Error("mux çıktısı boş");
  }
}

async function remuxTsToMp4(tsPath, outPath) {
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg yok");
  await runCmd(ffmpeg, ["-y", "-i", tsPath, "-c", "copy", "-bsf:a", "aac_adtstoasc", outPath]);
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1000) {
    // audio bitstream filter fail → without bsf
    await runCmd(ffmpeg, ["-y", "-i", tsPath, "-c", "copy", outPath]);
  }
}

function findFfmpeg() {
  return new Promise((resolve) => {
    const candidates = ["ffmpeg", "ffmpeg.exe"];
    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) {
        const winget = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
        resolve(resolveFfmpegInDir(winget) || null);
        return;
      }
      const bin = candidates[i++];
      const p = spawn(bin, ["-version"]);
      p.on("error", tryNext);
      p.on("close", (code) => (code === 0 ? resolve(bin) : tryNext()));
    };
    tryNext();
  });
}

function resolveFfmpegInDir(root) {
  try {
    if (!fs.existsSync(root)) return null;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isFile() && /^ffmpeg\.exe$/i.test(e.name)) return full;
        if (e.isDirectory() && !/node_modules/i.test(e.name)) stack.push(full);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function runCmd(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 4000) err = err.slice(-4000);
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`));
    });
  });
}

function isPlaylist(text) {
  return typeof text === "string" && text.includes("#EXTM3U");
}

function normalizeHeaders(headers = {}) {
  const out = {
    "user-agent": DEFAULT_UA,
    accept: "*/*",
    "accept-encoding": "identity",
  };
  for (const [k, v] of Object.entries(headers || {})) {
    if (!v) continue;
    const key = String(k).toLowerCase();
    if (["host", "connection", "content-length", "transfer-encoding", "range"].includes(key)) continue;
    out[key] = String(v);
  }
  return out;
}

function parseMediaPlaylist(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  let seq = 0;
  let key = null;
  let initSegment = null;
  const segments = [];
  let pending = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      seq = Number(line.slice("#EXT-X-MEDIA-SEQUENCE:".length).trim()) || 0;
      continue;
    }
    if (line.startsWith("#EXT-X-KEY:")) {
      key = parseKeyLine(line, baseUrl);
      continue;
    }
    if (line.startsWith("#EXT-X-MAP:")) {
      const uri = (line.match(/URI="([^"]+)"/) || [])[1];
      if (uri) initSegment = { url: new URL(uri, baseUrl).toString() };
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      pending = true;
      continue;
    }
    if (pending && !line.startsWith("#")) {
      segments.push({ url: new URL(line, baseUrl).toString(), key, seq: seq + segments.length });
      pending = false;
    }
  }
  return { initSegment, segments };
}

function parseKeyLine(line, baseUrl) {
  const method = (line.match(/METHOD=([^,]+)/) || [])[1] || "NONE";
  if (method === "NONE") return null;
  if (method !== "AES-128") return { method, uri: null, iv: null };
  const uriRaw = (line.match(/URI="([^"]+)"/) || [])[1];
  if (!uriRaw) throw new Error("AES-128 anahtar URI yok");
  const ivHex = (line.match(/IV=0x([0-9a-fA-F]+)/) || [])[1];
  return {
    method: "AES-128",
    uri: new URL(uriRaw, baseUrl).toString(),
    iv: ivHex ? Buffer.from(ivHex.padStart(32, "0").slice(-32), "hex") : null,
  };
}

function sequenceIv(seq) {
  const iv = Buffer.alloc(16);
  iv.writeUInt32BE(seq >>> 0, 12);
  return iv;
}

async function getKey(uri, headers, cache) {
  if (cache.has(uri)) return cache.get(uri);
  const buf = await fetchBufferRetry(uri, headers);
  if (buf.length < 16) throw new Error("AES anahtarı geçersiz");
  const key = buf.subarray(0, 16);
  cache.set(uri, key);
  return key;
}

function decryptAes128(data, key, iv) {
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function formatBw(bps) {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1000) return `${Math.round(bps / 1000)} kbps`;
  return `${bps} bps`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err) {
  const msg = String(err?.message || err || "");
  const code = err?.code || "";
  return (
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|socket hang up|zaman aşımı|network/i.test(
      `${code} ${msg}`
    ) || Number(err?.statusCode) === 429 || Number(err?.statusCode) === 503
  );
}

function fetchText(url, headers) {
  return fetchBufferRetry(url, headers).then((b) => b.toString("utf8"));
}

async function fetchBufferRetry(url, headers, tries = 6) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fetchBuffer(url, headers);
    } catch (e) {
      last = e;
      if (!isRetryable(e) || i === tries - 1) throw e;
      const wait = Math.min(8000, 400 * 2 ** i) + Math.floor(Math.random() * 200);
      console.warn(`[hls] retry ${i + 1}/${tries - 1} (${e.message || e}) wait ${wait}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

function fetchBuffer(url, headers) {
  return new Promise((resolve, reject) => {
    get(url, headers, (res) => {
      if (res.statusCode >= 400) {
        const err = new Error(`HTTP ${res.statusCode} → ${url.slice(0, 120)}`);
        err.statusCode = res.statusCode;
        reject(err);
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }, reject);
  });
}

const insecureAgent = new https.Agent({
  keepAlive: false,
  maxSockets: 4,
  rejectUnauthorized: true,
});
const httpAgent = new http.Agent({ keepAlive: false, maxSockets: 4 });

function get(url, headers, onRes, onErr, redirectLeft = 8) {
  try {
    new URL(url);
  } catch (e) {
    onErr(e);
    return;
  }
  const u = new URL(url);
  const lib = u.protocol === "http:" ? http : https;
  const agent = u.protocol === "http:" ? httpAgent : insecureAgent;
  const hdrs = normalizeHeaders(headers);
  const req = lib.get(
    url,
    {
      headers: hdrs,
      timeout: 90_000,
      agent,
    },
    (res) => {
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirectLeft > 0) {
        res.resume();
        const next = new URL(loc, url).toString();
        const nextHeaders = { ...headers };
        try {
          if (new URL(url).origin !== new URL(next).origin) {
            delete nextHeaders.cookie;
            delete nextHeaders.authorization;
            if (!nextHeaders.referer) nextHeaders.referer = url;
          }
        } catch {
          /* ignore */
        }
        get(next, nextHeaders, onRes, onErr, redirectLeft - 1);
        return;
      }
      onRes(res);
    }
  );
  req.on("timeout", () => {
    req.destroy(new Error("zaman aşımı"));
  });
  req.on("error", onErr);
}
