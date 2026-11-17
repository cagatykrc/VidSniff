/** Shared EN/TR strings for the desktop app. */

export const STRINGS = {
  en: {
    appName: "VidSniff",
    trayTooltip: "VidSniff",
    trayTooltipRunning: "VidSniff — {n} download(s)",
    trayBrowser: "Open VidSniff",
    trayPanel: "Open VidSniff",
    traySetup: "Extension setup (optional)",
    browserDownloadShort: "MP4",
    browserPlayHintShort: "Play a video to capture",
    browserJobs: "Downloads",
    panelEmptyShort: "No downloads yet",
    browserStop: "Stop",
    browserRemove: "✕",
    browserRemoveHint: "Remove from list",
    browserCancelled: "Stopped",
    browserStatusRunning: "running",
    browserStatusDone: "done",
    browserStatusCancelled: "stopped",
    browserStatusError: "error",
    traySettings: "Settings",
    trayDownloads: "Downloads folder",
    trayCheckUpdate: "Check for updates",
    trayQuit: "Quit",

    panelSub: "Tray download panel",
    panelFolder: "Folder",
    panelSettings: "Settings",
    panelBrowserHint: "Open the built-in browser, play a video, then download.",
    panelBrowserBtn: "Open browser",
    panelInstallHint: "Optional: catch videos in Chrome/Edge via extension.",
    panelInstallBtn: "Extension (optional)",
    panelEmpty: "No downloads yet.<br/>Open the browser, play a video, then download.",
    panelShow: "Show",
    panelFile: "file",
    panelClear: "Clear list",

    browserUrlPlaceholder: "https://…",
    browserGo: "Go",
    browserDownload: "Download MP4",
    browserNoCapture: "No video yet",
    browserPlayHint: "Open a site, play the video — it appears here",
    browserPlayFirst: "Play the video on the page first",
    browserVideo: "Video",
    browserProbing: "Probing…",
    browserQualityAuto: "Auto (best)",
    browserStarting: "Starting…",
    browserDownloading: "Downloading…",
    browserStarted: "Started",
    browserDone: "Saved",
    browserFailed: "Failed",

    setupTitle: "Extension setup (optional)",
    setupLead:
      "You don’t need an extension — use VidSniff’s built-in browser. This is only if you want Chrome/Edge capture.",
    setupStep1: "Extension folder",
    setupStep1Body: "Choose this folder with “Load unpacked”.",
    setupOpenFolder: "Open folder",
    setupCopyPath: "Copy path",
    setupStep2: "Load in browser",
    setupStep2Body: "Developer mode → Load unpacked → select the folder above.",
    setupChrome: "Install for Chrome",
    setupEdge: "Install for Edge",
    setupBrave: "Brave",
    setupFfNote:
      "Firefox / Zen: permanent install is limited. about:debugging → Load Temporary Add-on →",
    setupFfFolder: "Firefox extension folder",
    setupDone: "Done",
    setupFolderOpened: "Folder opened — select it in the browser.",
    setupPathCopied: "Path copied to clipboard.",
    setupChromeOpened:
      "Chrome extensions page opened. Developer mode → Load unpacked.",
    setupEdgeOpened:
      "Edge extensions page opened. Developer mode → Load unpacked.",
    setupBraveOpened: "Brave extensions page opened.",
    setupBrowserMissing: "{browser} not found",

    settingsTitle: "Settings",
    settingsLead: "App preferences",
    settingsStartup: "Startup",
    settingsAutostart: "Launch VidSniff when Windows starts",
    settingsAutostartHint:
      "Runs quietly in the tray so the download service is ready.",
    settingsLanguage: "Language",
    settingsLanguageHint: "UI language for the app and browser extension.",
    settingsDownloads: "Downloads",
    settingsDownloadsHint: "Default: your Windows Downloads folder. Change anytime.",
    settingsOpenFolder: "Open folder",
    settingsPickFolder: "Choose folder",
    settingsResetFolder: "Use Downloads",
    settingsExtension: "Extension (optional)",
    settingsExtensionHint:
      "Only needed for Chrome/Edge. Prefer the built-in browser for everyday use.",
    settingsExtBtn: "Extension setup assistant",
    settingsUpdates: "Updates",
    settingsUpdatesHint:
      "On launch VidSniff checks GitHub Releases and can install silently in the background.",
    settingsCheckUpdate: "Check for updates",
    settingsClose: "Close",

    updateAvailableTitle: "Update available",
    updateAvailableBody:
      "VidSniff {latest} is available (you have {current}).\n\nDownload and install silently now? (no setup wizard)",
    updateNoneTitle: "Up to date",
    updateNoneBody: "You already have the latest version ({current}).",
    updateDownloadingTitle: "Downloading update",
    updateDownloadingBody: "Downloading VidSniff {latest}… {pct}%",
    updateInstallingTitle: "Installing update",
    updatePhaseDownload: "Downloading…",
    updatePhaseInstall: "Installing silently…",
    updateErrorTitle: "Update failed",
    updateErrorBody: "Could not update: {error}",
    updateNoAsset:
      "Version {latest} exists on GitHub but no Setup .exe was attached to the Release.",
    updateYes: "Update",
    updateLater: "Later",
    updateOk: "OK",

    errOpenTitle: "VidSniff failed to start",
  },
  tr: {
    appName: "VidSniff",
    trayTooltip: "VidSniff",
    trayTooltipRunning: "VidSniff — {n} indirme",
    trayBrowser: "VidSniff’i aç",
    trayPanel: "VidSniff’i aç",
    traySetup: "Eklenti kurulumu (isteğe bağlı)",
    browserDownloadShort: "MP4",
    browserPlayHintShort: "Videoyu oynat → burada görünür",
    browserJobs: "İndirmeler",
    panelEmptyShort: "Henüz indirme yok",
    browserStop: "Durdur",
    browserRemove: "✕",
    browserRemoveHint: "Listeden kaldır",
    browserCancelled: "Durduruldu",
    browserStatusRunning: "iniyor",
    browserStatusDone: "bitti",
    browserStatusCancelled: "durdu",
    browserStatusError: "hata",
    traySettings: "Ayarlar",
    trayDownloads: "İndirmeler klasörü",
    trayCheckUpdate: "Güncellemeleri kontrol et",
    trayQuit: "Çıkış",

    panelSub: "Sistem tepsisi indirme paneli",
    panelFolder: "Klasör",
    panelSettings: "Ayarlar",
    panelBrowserHint: "Gömülü tarayıcıyı aç, videoyu oynat, sonra indir.",
    panelBrowserBtn: "Tarayıcıyı aç",
    panelInstallHint: "İsteğe bağlı: Chrome/Edge eklentisi.",
    panelInstallBtn: "Eklenti (isteğe bağlı)",
    panelEmpty: "Henüz indirme yok.<br/>Tarayıcıyı aç, videoyu oynat, indir.",
    panelShow: "Göster",
    panelFile: "dosya",
    panelClear: "Listeyi temizle",

    browserUrlPlaceholder: "https://…",
    browserGo: "Git",
    browserDownload: "MP4 indir",
    browserNoCapture: "Henüz video yok",
    browserPlayHint: "Siteye gir, videoyu oynat — burada görünür",
    browserPlayFirst: "Önce sayfada videoyu oynat",
    browserVideo: "Video",
    browserProbing: "Çözünürlük bakılıyor…",
    browserQualityAuto: "Otomatik (en iyi)",
    browserStarting: "Başlatılıyor…",
    browserDownloading: "İndiriliyor…",
    browserStarted: "Başladı",
    browserDone: "Kaydedildi",
    browserFailed: "Başarısız",

    setupTitle: "Eklenti kurulumu (isteğe bağlı)",
    setupLead:
      "Eklenti şart değil — VidSniff’in kendi tarayıcısını kullan. Bu sadece Chrome/Edge’de yakalamak isteyenler için.",
    setupStep1: "Eklenti klasörü",
    setupStep1Body: "Bu klasörü “Paketlenmemiş öğe yükle” ile seçeceksin.",
    setupOpenFolder: "Klasörü aç",
    setupCopyPath: "Yolu kopyala",
    setupStep2: "Tarayıcıda yükle",
    setupStep2Body:
      "Geliştirici modu → Paketlenmemiş öğe yükle → yukarıdaki klasör.",
    setupChrome: "Chrome için kur",
    setupEdge: "Edge için kur",
    setupBrave: "Brave",
    setupFfNote:
      "Firefox / Zen: kalıcı kurulum sınırlı. about:debugging → Load Temporary Add-on →",
    setupFfFolder: "Firefox eklenti klasörü",
    setupDone: "Tamam",
    setupFolderOpened: "Klasör açıldı — bunu tarayıcıda seç.",
    setupPathCopied: "Yol panoya kopyalandı.",
    setupChromeOpened:
      "Chrome eklenti sayfası açıldı. Geliştirici modu → Paketlenmemiş yükle.",
    setupEdgeOpened:
      "Edge eklenti sayfası açıldı. Geliştirici modu → Paketlenmemiş yükle.",
    setupBraveOpened: "Brave eklenti sayfası açıldı.",
    setupBrowserMissing: "{browser} yüklü görünmüyor",

    settingsTitle: "Ayarlar",
    settingsLead: "Uygulama tercihleri",
    settingsStartup: "Başlangıç",
    settingsAutostart: "Windows açılınca VidSniff’i başlat",
    settingsAutostartHint:
      "Kurulumdan sonra tepside sessizce çalışır; indirme servisi hazır olur.",
    settingsLanguage: "Dil",
    settingsLanguageHint: "Uygulama ve tarayıcı eklentisi arayüz dili.",
    settingsDownloads: "İndirmeler",
    settingsDownloadsHint: "Varsayılan: Windows İndirilenler klasörü. İstediğin zaman değiştir.",
    settingsOpenFolder: "Klasörü aç",
    settingsPickFolder: "Klasör seç",
    settingsResetFolder: "İndirilenler’e dön",
    settingsExtension: "Eklenti (isteğe bağlı)",
    settingsExtensionHint:
      "Sadece Chrome/Edge için. Günlük kullanımda gömülü tarayıcı yeterli.",
    settingsExtBtn: "Eklenti kurulum asistanı",
    settingsUpdates: "Güncellemeler",
    settingsUpdatesHint:
      "Her açılışta GitHub Releases kontrol edilir; onaylarsan sessizce arka planda kurulur.",
    settingsCheckUpdate: "Güncellemeleri kontrol et",
    settingsClose: "Kapat",

    updateAvailableTitle: "Güncelleme var",
    updateAvailableBody:
      "VidSniff {latest} çıktı (şu an {current}).\n\nŞimdi sessizce indirip kurulsun mu? (Setup sihirbazı açılmaz)",
    updateNoneTitle: "Güncelsiniz",
    updateNoneBody: "En son sürüm zaten yüklü ({current}).",
    updateDownloadingTitle: "Güncelleme indiriliyor",
    updateDownloadingBody: "VidSniff {latest} indiriliyor… %{pct}",
    updateInstallingTitle: "Güncelleme kuruluyor",
    updatePhaseDownload: "İndiriliyor…",
    updatePhaseInstall: "Sessiz kurulum…",
    updateErrorTitle: "Güncelleme başarısız",
    updateErrorBody: "Güncellenemedi: {error}",
    updateNoAsset:
      "GitHub’da {latest} sürümü var ama Release’e Setup .exe eklenmemiş.",
    updateYes: "Güncelle",
    updateLater: "Sonra",
    updateOk: "Tamam",

    errOpenTitle: "VidSniff açılamadı",
  },
};

export function normalizeLang(lang) {
  const v = String(lang || "").toLowerCase();
  if (v.startsWith("en")) return "en";
  if (v.startsWith("tr")) return "tr";
  return "tr";
}

export function t(lang, key, vars = {}) {
  const L = normalizeLang(lang);
  let s = STRINGS[L]?.[key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
