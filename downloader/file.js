import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import http from "node:http";
import { pipeline } from "node:stream/promises";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** İndirmeden önce 1 byte iste — 404/403'ü hemen yakala */
export async function verifyUrl(url, headers = {}) {
  const res = await request(url, {
    method: "GET",
    headers: { ...headers, range: "bytes=0-0" },
  });
  const code = res.statusCode || 0;
  res.resume?.();
  if (code === 200 || code === 206) return true;
  if (code === 405 || code === 416) {
    // Range yok sayılmış olabilir — tam GET denemesini indirmeye bırak
    return true;
  }
  throw new Error(`HTTP ${code} — bağlantı reddedildi (çerez/Referer veya süresi dolmuş URL)`);
}

export async function downloadFile(url, outPath, { headers = {}, onProgress, connections = 4 } = {}) {
  let length = 0;
  let acceptsRanges = false;
  let finalUrl = url;

  try {
    const head = await request(url, { method: "HEAD", headers });
    if (head.statusCode < 400) {
      length = Number(head.headers["content-length"] || 0);
      acceptsRanges = /bytes/i.test(head.headers["accept-ranges"] || "");
      finalUrl = head.finalUrl || head.url || url;
      head.resume?.();
    } else {
      head.resume?.();
    }
  } catch {
    /* HEAD desteklemeyen sunucular */
  }

  // HEAD başarısız / uzunluk yoksa tek bağlantı GET
  if (!acceptsRanges || !length || connections <= 1 || length < 2 * 1024 * 1024) {
    await single(finalUrl, outPath, headers, length, onProgress);
    return outPath;
  }

  const parts = Math.min(connections, 8);
  const chunkSize = Math.ceil(length / parts);
  const tmpFiles = [];
  let done = 0;

  try {
    await Promise.all(
      Array.from({ length: parts }, async (_, i) => {
        const start = i * chunkSize;
        if (start >= length) return;
        const end = Math.min(length - 1, start + chunkSize - 1);
        const tmp = `${outPath}.part${i}`;
        tmpFiles.push({ i, tmp });
        await rangeDownload(finalUrl, tmp, start, end, headers, (n) => {
          done += n;
          onProgress?.(Math.round((done / length) * 100));
        });
      })
    );
  } catch (e) {
    for (const p of tmpFiles) await fsp.unlink(p.tmp).catch(() => {});
    // çok parçalı başarısızsa tek parçaya düş
    await single(finalUrl, outPath, headers, length, onProgress);
    return outPath;
  }

  tmpFiles.sort((a, b) => a.i - b.i);
  await fsp.writeFile(outPath, Buffer.alloc(0));
  for (const p of tmpFiles) {
    const buf = await fsp.readFile(p.tmp);
    await fsp.appendFile(outPath, buf);
    await fsp.unlink(p.tmp).catch(() => {});
  }
  onProgress?.(100);
  return outPath;
}

async function single(url, outPath, headers, length, onProgress) {
  const res = await request(url, { method: "GET", headers });
  if (res.statusCode >= 400) {
    res.resume?.();
    throw new Error(`HTTP ${res.statusCode}`);
  }
  const total = Number(res.headers["content-length"] || length || 0);
  let got = 0;
  await pipeline(
    res,
    async function* (source) {
      for await (const chunk of source) {
        got += chunk.length;
        if (total) onProgress?.(Math.round((got / total) * 100));
        yield chunk;
      }
    },
    fs.createWriteStream(outPath)
  );
  onProgress?.(100);
}

async function rangeDownload(url, outPath, start, end, headers, onBytes) {
  const res = await request(url, {
    method: "GET",
    headers: { ...headers, range: `bytes=${start}-${end}` },
  });
  if (res.statusCode !== 206 && res.statusCode !== 200) {
    res.resume?.();
    throw new Error(`Range HTTP ${res.statusCode}`);
  }
  await pipeline(
    res,
    async function* (source) {
      for await (const chunk of source) {
        onBytes?.(chunk.length);
        yield chunk;
      }
    },
    fs.createWriteStream(outPath)
  );
}

function request(url, { method = "GET", headers = {} } = {}, redirectLeft = 8) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = u.protocol === "http:" ? http : https;

    const hdrs = {
      "user-agent": DEFAULT_UA,
      accept: "*/*",
      "accept-encoding": "identity",
      connection: "close",
      ...Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
      ),
    };

    // Host'u URL'den bırak — elle basma
    delete hdrs.host;

    const req = lib.request(
      url,
      {
        method,
        headers: hdrs,
        timeout: 60_000,
      },
      (res) => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirectLeft > 0) {
          res.resume();
          const next = new URL(loc, url).toString();
          // Cross-origin redirect'te Authorization/Cookie düşürülebilir; Referer kalsın
          const nextHeaders = { ...headers };
          try {
            const a = new URL(url);
            const b = new URL(next);
            if (a.origin !== b.origin) {
              delete nextHeaders.cookie;
              delete nextHeaders.authorization;
              if (!nextHeaders.referer) nextHeaders.referer = url;
            }
          } catch {
            /* ignore */
          }
          request(next, { method, headers: nextHeaders }, redirectLeft - 1).then(resolve, reject);
          return;
        }
        res.url = url;
        res.finalUrl = url;
        resolve(res);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("zaman aşımı"));
    });
    req.on("error", reject);
    req.end();
  });
}
