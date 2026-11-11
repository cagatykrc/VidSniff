import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const OWNER = "cagatykrc";
const REPO = "VidSniff";
const API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const USER_AGENT = "VidSniff-Updater";

function getApp() {
  try {
    return createRequire(import.meta.url)("electron").app;
  } catch {
    return null;
  }
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} 1 if a>b, -1 if a<b, 0 if equal
 */
export function compareVersions(a, b) {
  const pa = String(a || "0")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/vnd.github+json",
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location).then(resolve, reject);
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 404) {
            resolve(null);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("https") ? https.get : http.get;
    const req = get(
      url,
      {
        headers: { "User-Agent": USER_AGENT },
        timeout: 120000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, dest, onProgress).then(resolve, reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const total = Number(res.headers["content-length"] || 0);
        let got = 0;
        const out = fs.createWriteStream(dest);
        res.on("data", (chunk) => {
          got += chunk.length;
          if (onProgress && total) onProgress(Math.round((got / total) * 100));
        });
        res.pipe(out);
        out.on("finish", () => out.close(() => resolve(dest)));
        out.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("download timeout"));
    });
  });
}

function pickSetupAsset(assets = []) {
  const list = Array.isArray(assets) ? assets : [];
  const setup = list.find((a) => /VidSniff-Setup-.*\.exe$/i.test(a.name || ""));
  if (setup) return setup;
  return list.find((a) => /\.exe$/i.test(a.name || "") && /setup|installer/i.test(a.name || "")) || null;
}

/**
 * @returns {Promise<null | { version: string, tag: string, name: string, url: string, notes: string }>}
 */
export async function checkLatestRelease(currentVersion) {
  const cur =
    currentVersion ||
    getApp()?.getVersion?.() ||
    "0.0.0";
  const data = await fetchJson(API);
  if (!data) return null;
  const tag = String(data.tag_name || data.name || "").trim();
  const version = tag.replace(/^v/i, "");
  if (!version) return null;
  if (compareVersions(version, cur) <= 0) {
    return null;
  }
  const asset = pickSetupAsset(data.assets);
  if (!asset?.browser_download_url) {
    const err = new Error("NO_SETUP_ASSET");
    err.version = version;
    err.htmlUrl = data.html_url;
    throw err;
  }
  return {
    version,
    tag,
    name: asset.name,
    url: asset.browser_download_url,
    notes: String(data.body || "").slice(0, 800),
    htmlUrl: data.html_url,
  };
}

/**
 * Download setup and launch installer, then quit.
 * @param {{ url: string, name: string }} release
 * @param {(pct: number) => void} [onProgress]
 */
export async function downloadAndInstall(release, onProgress) {
  const electronApp = getApp();
  const tmpRoot = electronApp?.getPath?.("temp") || process.env.TEMP || process.cwd();
  const dir = path.join(tmpRoot, "VidSniff-updates");
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, release.name || `VidSniff-Setup-${release.version}.exe`);
  try {
    await fsp.unlink(dest);
  } catch {
    /* ignore */
  }
  await downloadFile(release.url, dest, onProgress);
  const child = spawn(dest, [], {
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  child.unref();
  return dest;
}
