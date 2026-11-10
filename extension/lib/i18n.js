/** EN/TR strings for the browser extension (synced via downloader /prefs). */

const STRINGS = {
  en: {
    download: "Download",
    downloadAsMp4: "Download as MP4",
    close: "Close",
    video: "Video",
    starting: "Starting…",
    playFirst: "Play the video first",
    downloading: "Downloading",
    started: "Started",
    failed: "Failed",
    done: "Done",
    error: "Error",
    mp4Best: "MP4 · best quality",
    waitingCapture: "Ready when a video is captured",
    serviceOn: "service on",
    serviceOff: "service off",
    emptyPrimary: "Appears when you play a video",
    emptyPrimaryMeta: "Start the video on the page → MP4 download shows up",
    mp4Download: "Download MP4",
    downloadingEllipsis: "Downloading…",
    startMp4: "Starting MP4 download…",
    complete: "Done: {name}",
    bgJobs: "Background downloads",
    noOther: "No other captures",
    popupSub: "Download this video",
    nowPlaying: "Now playing",
    moreCaptures: "All captures",
    openFolder: "Open folder",
    footerHint: "The orange player panel does the same job",
    jobDone: "done",
    jobError: "error",
  },
  tr: {
    download: "İndir",
    downloadAsMp4: "MP4 olarak indir",
    close: "Kapat",
    video: "Video",
    starting: "Başlatılıyor…",
    playFirst: "Önce videoyu oynat",
    downloading: "İndirme sürüyor",
    started: "Başladı",
    failed: "Başarısız",
    done: "Tamam",
    error: "Hata",
    mp4Best: "MP4 · en iyi kalite",
    waitingCapture: "Video yakalanınca hazır",
    serviceOn: "servis açık",
    serviceOff: "servis kapalı",
    emptyPrimary: "Video oynatınca burada görünür",
    emptyPrimaryMeta: "Sayfada videoyu başlat → MP4 indirme çıkar",
    mp4Download: "MP4 İndir",
    downloadingEllipsis: "İndiriliyor…",
    startMp4: "MP4 indirme başlatılıyor…",
    complete: "Tamam: {name}",
    bgJobs: "Arka plan indirmeleri",
    noOther: "Başka yakalama yok",
    popupSub: "Bu videoyu indir",
    nowPlaying: "Şu anki video",
    moreCaptures: "Tüm yakalananlar",
    openFolder: "Klasörü aç",
    footerHint: "Oynatıcıdaki turuncu panel de aynı işi yapar",
    jobDone: "tamam",
    jobError: "hata",
  },
};

let currentLang = "tr";

export function setLang(lang) {
  const v = String(lang || "").toLowerCase();
  currentLang = v.startsWith("en") ? "en" : "tr";
  return currentLang;
}

export function getLang() {
  return currentLang;
}

export function t(key, vars = {}) {
  let s = STRINGS[currentLang]?.[key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export async function syncLangFromService(apiBase = "http://127.0.0.1:17890") {
  try {
    const res = await fetch(`${apiBase}/prefs`, { cache: "no-store" });
    if (!res.ok) return currentLang;
    const data = await res.json();
    if (data?.lang) setLang(data.lang);
  } catch {
    /* keep current */
  }
  return currentLang;
}
