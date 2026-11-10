const MEDIA_EXT = /\.(m3u8|mpd|mp4|webm|mkv|m4v|mov|avi|flv|ts|m4s|mp3|m4a|aac|ogg|wav)(?:$|\?|#)/i;
const MEDIA_MIME = /^(video|audio)\//i;
const PLAYLIST_MIME = /(mpegurl|dash\+xml|application\/vnd\.apple\.mpegurl|application\/x-mpegurl)/i;

const SKIP_HOST = /(google-analytics|doubleclick|facebook\.com\/tr|googlesyndication|scorecardresearch|adservice)/i;
const SKIP_PATH =
  /(sprite|thumbnail|thumbnails?|preview|favicon|tracking|beacon|analytics|\/ads?\/|\/logo|site\.webm|intro\.|trailer_thumb)/i;

export function isHlsUrl(url = "", contentType = "") {
  const lower = `${url} ${contentType}`.toLowerCase();
  if (PLAYLIST_MIME.test(contentType) || /\.m3u8(?:$|\?|#)/i.test(url)) return true;
  // Bu sitelerde /hls/.../*.mp4 çoğu zaman düz mp4 değil, HLS yolu
  if (/\/hls\//i.test(url)) return true;
  if (/master\.(txt|m3u8)(?:$|\?|#)/i.test(url)) return true;
  if (/index\.(m3u8|txt)(?:$|\?|#)/i.test(url)) return true;
  if (/playmix\.|cdnimages|cdnstatic/i.test(url) && /\.mp4(?:$|\?|#|\/)/i.test(url)) return true;
  return /mpegurl|apple\.mpegurl/.test(lower);
}

export function detectHlsKind(url = "", contentLength = 0) {
  if (/master\.(txt|m3u8)|\/master(?:$|\?|#|\/)/i.test(url)) return "master";
  if (contentLength > 0 && contentLength < 2048) return "master";
  return "media";
}

export function isLikelyMedia(url, contentType = "", contentLength = 0) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (SKIP_HOST.test(u.hostname)) return false;
    if (SKIP_PATH.test(u.pathname)) return false;
    // site kökündeki dekoratif webm/mp4
    if (/^\/[^/]+\.(webm|mp4)$/i.test(u.pathname) && !/\/hls\//i.test(u.pathname)) {
      return false;
    }
  } catch {
    return false;
  }

  if (isHlsUrl(url, contentType)) return true;

  if (MEDIA_MIME.test(contentType)) {
    if (contentLength > 0 && contentLength < 100 * 1024) return false;
    return true;
  }

  if (MEDIA_EXT.test(url)) {
    if (/\.(mp4|webm|m4v|mov)(?:$|\?|#)/i.test(url) && contentLength > 0 && contentLength < 200 * 1024) {
      return false;
    }
    return true;
  }

  if (contentLength >= 512 * 1024 && /octet-stream|binary/i.test(contentType)) {
    return true;
  }

  return false;
}

export function classifyMedia(url, contentType = "") {
  if (isHlsUrl(url, contentType)) return "hls";
  const lower = `${url} ${contentType}`.toLowerCase();
  if (/\.mpd|dash\+xml/.test(lower)) return "dash";
  if (/\.(mp3|m4a|aac|ogg|wav)(?:$|\?|#)/.test(lower) || /^audio\//.test(contentType)) return "audio";
  if (/\.(ts|m4s)(?:$|\?|#)/.test(lower)) return "segment";
  return "video";
}

export function guessFilename(url, contentType = "", pageTitle = "") {
  const type = classifyMedia(url, contentType);
  const title = String(pageTitle || "")
    .replace(/\s*[|\-–].*$/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .slice(0, 80);

  // IDM gibi: ana film akışı doğrudan .mp4 adıyla görünsün
  if (type === "hls" && (/master\.(txt|m3u8)/i.test(url) || /\/hls\//i.test(url))) {
    if (/sublist_aud|\/aud|audio/i.test(url)) {
      return `${title || "audio"}.m4a`;
    }
    return `${title || "video"}.mp4`;
  }

  try {
    const u = new URL(url);
    const base = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "media");
    const clean = base.split("?")[0];
    if (/\.[a-z0-9]{2,5}$/i.test(clean)) return clean.slice(0, 180);
  } catch {
    /* ignore */
  }

  const ext =
    type === "hls" ? "mp4" :
    type === "dash" ? "mpd" :
    type === "audio" ? "mp3" :
    type === "segment" ? "ts" : "mp4";
  return `${title || `video_${Date.now()}`}.${ext}`;
}

export function displayLabel(item) {
  if (item.type === "hls" && (/master/i.test(item.filename || "") || item.hlsKind === "master" || /master\.(txt|m3u8)/i.test(item.url || ""))) {
    return item.filename?.endsWith(".mp4") ? item.filename : `${(item.filename || "video").replace(/\.[^.]+$/, "")}.mp4`;
  }
  if (item.type === "hls" && /\/hls\//i.test(item.url || "") && !/aud|audio|sublist/i.test(item.url || "")) {
    return (item.filename || "video.mp4").replace(/\.(m3u8|txt)$/i, ".mp4");
  }
  return item.filename || "media";
}

export function formatBytes(n) {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Liste anahtarı — imzalı query'yi koru, sadece hash'i at. */
export function mediaKey(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

export function sizeLabel(item) {
  if (item.type === "hls" || item.type === "dash") {
    return "playlist";
  }
  return formatBytes(item.size);
}

export function pickHeader(headers, name) {
  if (!headers) return "";
  const want = name.toLowerCase();
  if (headers[want]) return headers[want];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return "";
}
