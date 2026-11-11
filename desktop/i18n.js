/** Shared EN/TR strings for the desktop app. */

export const STRINGS = {
  en: {
    appName: "VidSniff",
    trayTooltip: "VidSniff",
    trayTooltipRunning: "VidSniff — {n} download(s)",
    trayPanel: "Download panel",
    traySetup: "Extension setup assistant",
    traySettings: "Settings",
    trayDownloads: "Downloads folder",
    trayCheckUpdate: "Check for updates",
    trayQuit: "Quit",

    panelSub: "Tray download panel",
    panelFolder: "Folder",
    panelSettings: "Settings",
    panelInstallHint: "Videos won’t be caught without the extension.",
    panelInstallBtn: "Install extension",
    panelEmpty: "No downloads yet.<br/>Download a video from the extension.",
    panelShow: "Show",
    panelFile: "file",

    setupTitle: "Extension setup assistant",
    setupLead: "VidSniff is running. Add the browser extension once.",
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
    settingsExtension: "Extension",
    settingsExtensionHint: "Open the assistant to install or reload the extension.",
    settingsExtBtn: "Extension setup assistant",
    settingsUpdates: "Updates",
    settingsUpdatesHint:
      "On every launch VidSniff checks GitHub Releases for a newer Setup.",
    settingsCheckUpdate: "Check for updates",
    settingsClose: "Close",

    updateAvailableTitle: "Update available",
    updateAvailableBody:
      "VidSniff {latest} is available (you have {current}).\n\nDownload and install now?",
    updateNoneTitle: "Up to date",
    updateNoneBody: "You already have the latest version ({current}).",
    updateDownloadingTitle: "Downloading update",
    updateDownloadingBody: "Downloading VidSniff {latest}… {pct}%",
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
    trayPanel: "İndirme paneli",
    traySetup: "Eklenti kurulum asistanı",
    traySettings: "Ayarlar",
    trayDownloads: "İndirmeler klasörü",
    trayCheckUpdate: "Güncellemeleri kontrol et",
    trayQuit: "Çıkış",

    panelSub: "Sistem tepsisi indirme paneli",
    panelFolder: "Klasör",
    panelSettings: "Ayarlar",
    panelInstallHint: "Eklenti yoksa video yakalanmaz.",
    panelInstallBtn: "Eklenti kur",
    panelEmpty: "Henüz indirme yok.<br/>Eklentiden video indir.",
    panelShow: "Göster",
    panelFile: "dosya",

    setupTitle: "Eklenti kurulum asistanı",
    setupLead: "VidSniff servisi çalışıyor. Tarayıcıya eklentiyi bir kez eklemen yeterli.",
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
    settingsExtension: "Eklenti",
    settingsExtensionHint:
      "Tarayıcı eklentisini kurmak veya yeniden yüklemek için asistanı aç.",
    settingsExtBtn: "Eklenti kurulum asistanı",
    settingsUpdates: "Güncellemeler",
    settingsUpdatesHint:
      "Her açılışta VidSniff, GitHub Releases’ta daha yeni Setup var mı diye bakar.",
    settingsCheckUpdate: "Güncellemeleri kontrol et",
    settingsClose: "Kapat",

    updateAvailableTitle: "Güncelleme var",
    updateAvailableBody:
      "VidSniff {latest} çıktı (şu an {current}).\n\nŞimdi indirip kurulsun mu?",
    updateNoneTitle: "Güncelsiniz",
    updateNoneBody: "En son sürüm zaten yüklü ({current}).",
    updateDownloadingTitle: "Güncelleme indiriliyor",
    updateDownloadingBody: "VidSniff {latest} indiriliyor… %{pct}",
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
