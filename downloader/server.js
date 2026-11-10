import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { downloadHls, probeHls, remuxFiles } from "./hls.js";
import { downloadFile } from "./file.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.VIDSNIFF_PORT || 17890);

function resolveDownloadDir() {
  if (process.env.VIDSNIFF_DOWNLOAD_DIR) return process.env.VIDSNIFF_DOWNLOAD_DIR;
  // Paketli Electron (asar) içine yazılamaz
  if (__dirname.includes(".asar") || process.env.PORTABLE_EXECUTABLE_DIR) {
    const base =
      process.env.LOCALAPPDATA ||
      process.env.USERPROFILE ||
      process.cwd();
    return path.join(base, "VidSniff", "downloads");
  }
  return path.join(ROOT, "downloads");
}

let DOWNLOAD_DIR = resolveDownloadDir();
/** @type {{ lang?: string }} */
let PREFS = { lang: "tr" };

/** @type {Map<string, object>} */
const jobs = new Map();
/** @type {import('node:http').Server | null} */
let server = null;

export function setPrefs(next = {}) {
  PREFS = { ...PREFS, ...next };
  return PREFS;
}

export function getPrefs() {
  return { ...PREFS };
}

function loadPrefsFromDisk() {
  try {
    const prefsPath = path.join(path.dirname(DOWNLOAD_DIR), "prefs.json");
    if (fs.existsSync(prefsPath)) {
      const raw = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
      if (raw && typeof raw === "object") PREFS = { ...PREFS, ...raw };
    }
  } catch {
    /* ignore */
  }
}

export function getJobs() {
  return [...jobs.values()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export function getDownloadDir() {
  return DOWNLOAD_DIR;
}

export async function startDownloader({ port = PORT, downloadDir, prefs } = {}) {
  if (downloadDir) DOWNLOAD_DIR = downloadDir;
  else DOWNLOAD_DIR = resolveDownloadDir();
  await fsp.mkdir(DOWNLOAD_DIR, { recursive: true });
  loadPrefsFromDisk();
  if (prefs) setPrefs(prefs);

  if (server?.listening) {
    return { server, port, downloadDir: DOWNLOAD_DIR, jobs };
  }

  server = http.createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, {
          ok: true,
          downloadDir: DOWNLOAD_DIR,
          jobs: jobs.size,
          lang: PREFS.lang || "tr",
        });
      }

      if (req.method === "GET" && url.pathname === "/prefs") {
        loadPrefsFromDisk();
        return json(res, 200, getPrefs());
      }

      if (req.method === "GET" && url.pathname === "/jobs") {
        return json(res, 200, { jobs: getJobs() });
      }

      if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
        const id = url.pathname.slice("/jobs/".length);
        const job = jobs.get(id);
        if (!job) return json(res, 404, { error: "job yok" });
        return json(res, 200, job);
      }

      if (req.method === "POST" && url.pathname === "/probe") {
        const body = await readJson(req);
        if (!body?.url) return json(res, 400, { error: "url gerekli" });
        const result = await probeHls(body.url, { headers: body.headers || {} });
        return json(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/download") {
        const body = await readJson(req);
        if (!body?.url) return json(res, 400, { error: "url gerekli" });

        const existing = [...jobs.values()].find(
          (j) => j.url === body.url && j.status === "running"
        );
        if (existing) {
          return json(res, 200, existing);
        }

        const headers = normalizeHeaders(body.headers || {});
        if (body.verify !== false && body.type !== "hls" && !/\.m3u8(\?|#|$)/i.test(body.url)) {
          try {
            const { verifyUrl } = await import("./file.js");
            await verifyUrl(body.url, headers);
          } catch (e) {
            return json(res, 400, {
              error: e?.message || "URL doğrulanamadı (404/403). Videoyu sayfada yeniden oynat.",
            });
          }
        }

        const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        let filename = sanitize(body.filename || guessName(body.url, body.type));
        // IDM gibi doğrudan .mp4 adı
        if (body.type === "hls" || /\.m3u8(\?|#|$)/i.test(body.url) || /master\.txt/i.test(body.url)) {
          filename = filename.replace(/\.(m3u8|txt|ts)$/i, "") + ".mp4";
        }
        const outPath = uniquePath(path.join(DOWNLOAD_DIR, filename));
        const quality = body.quality || "auto";

        const job = {
          id,
          url: body.url,
          type: body.type || "video",
          quality,
          audioUrls: Array.isArray(body.audioUrls) ? body.audioUrls : [],
          path: outPath,
          status: "running",
          progress: 0,
          error: null,
          startedAt: Date.now(),
          finishedAt: null,
        };
        jobs.set(id, job);
        json(res, 200, job);

        runJob(job, headers).catch(() => {});
        return;
      }

      if (req.method === "POST" && url.pathname === "/open-downloads") {
        return json(res, 200, { path: DOWNLOAD_DIR });
      }

      if (req.method === "POST" && url.pathname === "/remux") {
        const body = await readJson(req);
        const video = body.video || path.join(DOWNLOAD_DIR, "master.ts");
        const audio = body.audio;
        if (!audio) return json(res, 400, { error: "audio yolu gerekli" });
        const out = body.out || path.join(DOWNLOAD_DIR, `muxed_${Date.now()}.mp4`);
        await remuxFiles(video, audio, out);
        return json(res, 200, { ok: true, path: out });
      }

      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 500, { error: e?.message || String(e) });
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        console.log(`VidSniff downloader → http://127.0.0.1:${port}`);
        console.log(`İndirmeler → ${DOWNLOAD_DIR}`);
        resolve();
      });
    });
  } catch (e) {
    server = null;
    throw e;
  }

  return { server, port, downloadDir: DOWNLOAD_DIR, jobs };
}

export async function stopDownloader() {
  if (!server) return;
  await new Promise((resolve) => server.close(() => resolve()));
  server = null;
}

async function runJob(job, headers) {
  try {
    const onProgress = (p) => {
      job.progress = Math.max(0, Math.min(100, Number(p) || 0));
    };

    if (job.type === "hls" || /\.m3u8(\?|#|$)/i.test(job.url) || /master\.txt/i.test(job.url)) {
      const finalPath = await downloadHls(job.url, job.path, {
        headers,
        onProgress,
        quality: job.quality || "auto",
        audioUrls: job.audioUrls || [],
      });
      job.path = finalPath;
    } else {
      await downloadFile(job.url, job.path, { headers, onProgress, connections: 4 });
    }

    job.status = "done";
    job.progress = 100;
    job.finishedAt = Date.now();
    console.log(`[done] ${job.path}`);
  } catch (e) {
    job.status = "error";
    job.error = e?.message || String(e);
    job.finishedAt = Date.now();
    console.error(`[error] ${job.id}`, job.error);
    try {
      if (job.path && fs.existsSync(job.path) && fs.statSync(job.path).size < 10_000) {
        await fsp.unlink(job.path);
      }
    } catch {
      /* ignore */
    }
  }
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function normalizeHeaders(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!v) continue;
    const key = String(k).toLowerCase();
    // HTTP/2 yasak / hop-by-hop
    if (["host", "connection", "content-length", "transfer-encoding", "range"].includes(key)) continue;
    out[key] = String(v);
  }
  return out;
}

function sanitize(name) {
  const base = String(name || "video.mp4").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 160);
  return base || "video.mp4";
}

function guessName(url, type) {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    if (last && /\.[a-z0-9]{2,5}$/i.test(last) && !/\.m3u8$/i.test(last)) return last;
  } catch {
    /* ignore */
  }
  const ext = type === "audio" ? "mp3" : "mp4";
  return `vidsniff_${Date.now()}.${ext}`;
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p);
  const stem = p.slice(0, -ext.length);
  let i = 1;
  while (fs.existsSync(`${stem} (${i})${ext}`)) i += 1;
  return `${stem} (${i})${ext}`;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  startDownloader().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
