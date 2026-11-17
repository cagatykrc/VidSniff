/**
 * VidSniff media detection — tek kaynak.
 * Ağ / DOM adaylarını sınıflandırır, gürültüyü eker, birincil videoyu skorlar.
 */

const PLAYLIST_MIME =
  /(mpegurl|dash\+xml|application\/vnd\.apple\.mpegurl|application\/x-mpegurl)/i;
const MEDIA_MIME = /^(video|audio)\//i;
const VIDEO_MIME = /^video\//i;
const AUDIO_MIME = /^audio\//i;

/** Tipik reklam / izleme hostları */
const SKIP_HOST =
  /(google-analytics|doubleclick|facebook\.com\/tr|googlesyndication|scorecardresearch|adservice|adnxs|adsystem|moatads|pubmatic|rubiconproject|criteo|taboola|outbrain|amazon-adsystem|2mdn\.net|googlevideo\.com\/videoplayback.*&(oad|adurl)=)/i;

/** Yol / dosya adı gürültüsü */
const SKIP_PATH =
  /(sprite|thumbnails?|\/thumb\/|preview[_-]?|favicon|tracking|beacon|analytics|\/ads?(?:\/|$)|\/ad[-_]|preroll|midroll|postroll|vast|vmap|\/logo|site\.webm|intro[_-]?|outro[_-]?|trailer_thumb|watermark|placeholder|poster|bluray_menu|menu_bg)/i;

/** HLS / DASH playlist ipuçları */
const HLS_PATH =
  /(\.m3u8(?:$|\?|#)|\/hls\/|master\.(?:txt|m3u8)|index\.(?:m3u8|txt)|playlist\.(?:m3u8|txt)|\/playlist\/|\/manifest\/|sublist_)/i;

/** İmzalı CDN / film host ailesi */
const STREAM_CDN = /(cdnimages|cdnstatic|playmix|cloudfront\.net|akamai|fastly|bunnycdn|stream\.)/i;

/** Ses-only playlist / dosya */
const AUDIO_ONLY =
  /(sublist_aud|\/aud\d|TYPE=AUDIO|\/audio\/|audio[_-]?(?:only|track)|index-a(?:flac)?\.m3u8|\.m4a(?:$|\?|#)|\.aac(?:$|\?|#))/i;

/** Altyazı */
const SUBTITLE_ONLY = /(sublist_sub|\/subs?\/|\.vtt(?:$|\?|#)|TYPE=SUBTITLES|subtitle)/i;

const MEDIA_EXT =
  /\.(m3u8|mpd|mp4|webm|mkv|m4v|mov|avi|flv|ts|m4s|mp3|m4a|aac|ogg|wav|txt)(?:$|\?|#|\/)/i;

export function isHlsUrl(url = "", contentType = "") {
  if (PLAYLIST_MIME.test(contentType)) return true;
  if (/\.m3u8(?:$|\?|#)/i.test(url)) return true;
  if (HLS_PATH.test(url)) return true;
  if (STREAM_CDN.test(url) && /\.mp4(?:$|\?|#|\/)/i.test(url)) return true;
  if (/master\.txt|index\.txt|playlist\.txt/i.test(url)) return true;
  return /mpegurl|apple\.mpegurl/.test(`${url} ${contentType}`.toLowerCase());
}

/**
 * @returns {"master"|"media"|"audio"|""}
 */
export function detectHlsKind(url = "", contentLength = 0) {
  if (AUDIO_ONLY.test(url)) return "audio";
  if (SUBTITLE_ONLY.test(url)) return "media";
  if (/master\.(txt|m3u8)|\/master(?:$|\?|#|\/)|\/txt\/master\./i.test(url)) return "master";
  if (/playlist\.(m3u8|txt)/i.test(url) && /master|variant.?list|quality.?list/i.test(url)) {
    return "master";
  }
  if (/sublist_|\/\d+p\/|\/video\/.*\.m3u8/i.test(url)) return "media";
  // Çok küçük playlist → genelde master veya kısa media list
  if (contentLength > 0 && contentLength < 4096 && /\/hls\//i.test(url)) {
    if (/master/i.test(url)) return "master";
  }
  if (contentLength > 0 && contentLength < 2048 && /\.m3u8/i.test(url) && /master/i.test(url)) {
    return "master";
  }
  return "media";
}

export function isLikelyMedia(url, contentType = "", contentLength = 0) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (SKIP_HOST.test(u.hostname)) return false;
  if (SKIP_PATH.test(u.pathname + u.search)) return false;
  if (SUBTITLE_ONLY.test(url) && !/\.m3u8/i.test(url)) return false;

  // Site kökü dekoratif mp4/webm
  if (/^\/[^/]+\.(webm|mp4)$/i.test(u.pathname) && !/\/hls\//i.test(u.pathname)) {
    return false;
  }

  if (isHlsUrl(url, contentType) || /\.mpd(?:$|\?|#)/i.test(url) || /dash\+xml/i.test(contentType)) {
    return true;
  }

  if (VIDEO_MIME.test(contentType)) {
    // Çok küçük video → poster / intro
    if (contentLength > 0 && contentLength < 250 * 1024) return false;
    return true;
  }

  if (AUDIO_MIME.test(contentType)) {
    if (contentLength > 0 && contentLength < 32 * 1024) return false;
    return true;
  }

  if (MEDIA_EXT.test(url)) {
    // Düz .txt yalnızca HLS bağlamında
    if (/\.txt(?:$|\?|#|\/)/i.test(url) && !HLS_PATH.test(url) && !STREAM_CDN.test(u.hostname)) {
      return false;
    }
    if (/\.(ts|m4s)(?:$|\?|#)/i.test(url)) {
      // Segmentleri listeye alma (ayrıca classify segment)
      return true;
    }
    if (/\.(mp4|webm|m4v|mov)(?:$|\?|#)/i.test(url)) {
      if (contentLength > 0 && contentLength < 400 * 1024) return false;
    }
    return true;
  }

  // Uzantısız ama büyük binary — olası progressive
  if (contentLength >= 1.5 * 1024 * 1024 && /octet-stream|binary|application\/mp4/i.test(contentType)) {
    return true;
  }

  return false;
}

export function classifyMedia(url, contentType = "") {
  if (isHlsUrl(url, contentType)) return "hls";
  const lower = `${url} ${contentType}`.toLowerCase();
  if (/\.mpd(?:$|\?|#)/.test(url) || /dash\+xml/.test(lower)) return "dash";
  if (AUDIO_ONLY.test(url) || AUDIO_MIME.test(contentType) || /\.(mp3|m4a|aac|ogg|wav)(?:$|\?|#)/.test(url)) {
    return "audio";
  }
  if (/\.(ts|m4s)(?:$|\?|#)/.test(url)) return "segment";
  return "video";
}

/** İndirme adayı mı? (segment / altyazı / saf ses playlist değil) */
export function isNoiseItem(it) {
  if (!it) return true;
  const url = it.url || "";
  const name = `${url} ${it.filename || ""} ${it.pageTitle || ""}`;
  if (it.type === "segment") return true;
  if (SUBTITLE_ONLY.test(name)) return true;
  if (SKIP_PATH.test(name)) return true;
  if (it.hlsKind === "audio" || (it.type === "audio" && !/\/hls\//i.test(url))) return true;
  if (AUDIO_ONLY.test(url) && /sublist_aud|\/aud\d|index-a/i.test(url)) return true;
  if (/site\.webm|\/logo\./i.test(name)) return true;
  // DOM'dan gelen çok kısa progressive — genelde gürültü (size 0 olabilir; path'e bak)
  if (it.source === "dom" && it.type === "video" && /\.(webm|mp4)$/i.test(url.split("?")[0]) && !/\/hls\//i.test(url)) {
    if (/banner|teaser|clip|sample|promo/i.test(url)) return true;
  }
  return false;
}

/** Ana film / video için uygun mu */
export function isPrimaryCandidate(it) {
  if (!it || isNoiseItem(it)) return false;
  if (it.type === "audio" && it.hlsKind !== "master") return false;
  if (it.hlsKind === "audio") return false;
  return true;
}

/**
 * Skor: yüksek = birincil indirme adayı.
 * Öncelik: HLS master > HLS media > büyük progressive > DOM.
 */
export function scoreItem(it) {
  if (!it || isNoiseItem(it)) return -1;
  let s = 0;
  const url = it.url || "";
  const size = Number(it.size) || 0;
  const ageMs = Date.now() - (Number(it.seenAt) || Date.now());
  const freshBoost = ageMs < 60_000 ? 3_000_000 : ageMs < 5 * 60_000 ? 1_000_000 : 0;

  if (it.type === "hls") {
    if (it.hlsKind === "master" || /master\.(txt|m3u8)/i.test(url)) {
      s += 80_000_000;
    } else if (it.hlsKind === "audio") {
      s += 500_000;
    } else {
      // media playlist — master yoksa işe yarar ama master'ın altında
      s += 25_000_000;
    }
    if (/\/hls\//i.test(url)) s += 5_000_000;
    if (STREAM_CDN.test(url)) s += 2_000_000;
  } else if (it.type === "dash") {
    s += 70_000_000;
  } else if (it.type === "video") {
    s += 10_000_000;
    // Progressive boyut ödülü (MB cinsinden, tavanlı)
    if (size > 0) {
      s += Math.min(size, 800 * 1024 * 1024) / 50;
    }
    // /hls/ içinde "video" gibi sınıflanmış sahte mp4 — master'a bırak
    if (/\/hls\//i.test(url) && /\.mp4/i.test(url) && !/master/i.test(url)) {
      s -= 40_000_000;
    }
  } else if (it.type === "audio") {
    s += 200_000;
  }

  if (VIDEO_MIME.test(it.contentType || "")) s += 2_000_000;
  if (it.source === "network") s += 1_500_000;
  else if (it.source === "dom") s += 200_000;
  if (it.source === "performance") s += 800_000;

  s += freshBoost;

  // Range/206 ile gelen büyük parça — gerçek oynatma sinyali
  if (it.statusCode === 206 && size > 500 * 1024) s += 1_000_000;

  return Math.floor(s);
}

export function guessFilename(url, contentType = "", pageTitle = "") {
  const type = classifyMedia(url, contentType);
  const title = String(pageTitle || "")
    .replace(/\s*[|\-–].*$/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .slice(0, 80);

  if (type === "hls" && (/master\.(txt|m3u8)/i.test(url) || /\/hls\//i.test(url))) {
    if (AUDIO_ONLY.test(url)) return `${title || "audio"}.m4a`;
    return `${title || "video"}.mp4`;
  }

  try {
    const u = new URL(url);
    const base = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "media");
    const clean = base.split("?")[0];
    if (/\.[a-z0-9]{2,5}$/i.test(clean) && !/^master\./i.test(clean) && !/^index\./i.test(clean)) {
      return clean.slice(0, 180);
    }
  } catch {
    /* ignore */
  }

  const ext =
    type === "hls"
      ? "mp4"
      : type === "dash"
        ? "mpd"
        : type === "audio"
          ? "mp3"
          : type === "segment"
            ? "ts"
            : "mp4";
  return `${title || `video_${Date.now()}`}.${ext}`;
}

export function ensureMp4Name(name) {
  let stem = String(name || "video").trim();
  while (/\.(m3u8|txt|ts|mp4|m4a|mkv|webm)$/i.test(stem)) {
    stem = stem.replace(/\.(m3u8|txt|ts|mp4|m4a|mkv|webm)$/i, "");
  }
  stem = stem.replace(/\.+$/, "").trim() || "video";
  return `${stem}.mp4`;
}

export function displayLabel(item) {
  const raw = item.displayName || item.filename || item.pageTitle || "video";
  if (
    item.type === "hls" ||
    item.hlsKind === "master" ||
    /master\.(txt|m3u8)/i.test(item.url || "") ||
    (/\/hls\//i.test(item.url || "") && !AUDIO_ONLY.test(item.url || ""))
  ) {
    return ensureMp4Name(raw);
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

/**
 * Liste anahtarı — imzalı query'yi stream path'lerde at (aynı film tek kayıt).
 */
export function mediaKey(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    if (
      /\/hls\//i.test(u.pathname) ||
      /master\.(txt|m3u8)$/i.test(u.pathname) ||
      /\.m3u8$/i.test(u.pathname) ||
      STREAM_CDN.test(u.hostname) ||
      /[?&](s|token|signature|expires|exp|sig|auth)=/i.test(u.search)
    ) {
      // Kaliteyi ayıran path segmentlerini koru; sadece imzayı sil
      u.search = "";
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Aynı akış ailesi (path, query yok) — taze imza seçimi için */
export function streamPathKey(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function sizeLabel(item) {
  if (item.type === "hls" || item.type === "dash") return "playlist";
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

/**
 * DOM / HTML içinden medya URL adayları çıkar.
 * @param {string} text
 * @param {number} [limit]
 * @returns {string[]}
 */
export function extractMediaUrlsFromText(text, limit = 60) {
  if (!text) return [];
  const found = [];
  const seen = new Set();
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  let m;
  while ((m = re.exec(text)) && found.length < limit) {
    let raw = m[0]
      .replace(/&amp;/g, "&")
      .replace(/\\u0026/g, "&")
      .replace(/\\+\//g, "/")
      .replace(/[),.;]+$/g, "");
    // JSON kaçış
    raw = raw.replace(/\\"/g, "").replace(/\\$/g, "");
    try {
      const u = new URL(raw);
      raw = u.toString();
    } catch {
      continue;
    }
    if (seen.has(raw)) continue;
    if (!isLikelyMedia(raw, "", 0) && !isHlsUrl(raw, "")) continue;
    if (classifyMedia(raw, "") === "segment") continue;
    seen.add(raw);
    found.push(raw);
  }
  return found;
}
