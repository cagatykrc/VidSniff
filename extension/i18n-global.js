/* Classic script for content.js (not an ES module). */
(function (g) {
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
    },
  };

  let lang = "tr";

  function setLang(v) {
    lang = String(v || "").toLowerCase().startsWith("en") ? "en" : "tr";
    return lang;
  }

  function t(key) {
    return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  }

  async function syncFromService() {
    try {
      const res = await fetch("http://127.0.0.1:17890/prefs", { cache: "no-store" });
      if (!res.ok) return lang;
      const data = await res.json();
      if (data?.lang) setLang(data.lang);
    } catch {
      /* keep */
    }
    return lang;
  }

  g.VidSniffI18n = { setLang, t, syncFromService, getLang: () => lang };
})(typeof globalThis !== "undefined" ? globalThis : window);