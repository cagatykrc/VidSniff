# VidSniff

## English

Browser video sniffer + local MP4 downloader. A tray app and browser extension that catch HLS/media streams and save them as MP4.

## Türkçe

Tarayıcıdan video yakalayan, yerel olarak MP4 indiren araç. Tepsi uygulaması ve eklenti ile HLS/medya akışlarını yakalayıp MP4 olarak kaydeder.


---

## Features / Özellikler

| English | Türkçe |
| --- | --- |
| Floating **Download** button on video players | Video üzerinde yüzen **İndir** butonu |
| Tray download panel with progress | Tepsi indirme paneli + ilerleme |
| HLS → MP4 (with audio when available) | HLS → MP4 (mümkünse sesli) |
| Extension install assistant | Eklenti kurulum asistanı |
| Settings: language (EN/TR) + start with Windows | Ayarlar: dil (EN/TR) + Windows ile başlat |
| Chrome / Edge / Brave (+ Firefox temporary) | Chrome / Edge / Brave (+ Firefox geçici) |


---

## Install / Kurulum

### English

1. Download `VidSniff-Setup-x.y.z.exe` from [Releases](../../releases)
2. Install → open from Start Menu (runs in the system tray)
3. Open **Settings** to pick **English** or **Türkçe**, and optionally “Launch when Windows starts”
4. Use **Install extension** → Load unpacked → `%LOCALAPPDATA%\VidSniff\extension-chrome`
5. Play a video → click **Download** → files go to `%LOCALAPPDATA%\VidSniff\downloads`

### Türkçe

1. [Releases](../../releases) sayfasından `VidSniff-Setup-x.y.z.exe` indir
2. Kur → Başlat menüsünden aç (sistem tepsisinde çalışır)
3. **Ayarlar**’dan **English** / **Türkçe** seç; istersen “Windows açılınca başlat”ı aç
4. **Eklenti kur** → Paketlenmemiş öğe yükle → `%LOCALAPPDATA%\VidSniff\extension-chrome`
5. Videoyu oynat → **İndir** → dosyalar: `%LOCALAPPDATA%\VidSniff\downloads`

**Firefox / Zen:** `about:debugging` → Load Temporary Add-on →  
`%LOCALAPPDATA%\VidSniff\extension-firefox\manifest.json`

---

## Project layout / Proje yapısı

```
desktop/       Electron tray app (panel, setup, settings, i18n)
downloader/    Local HTTP download service (HLS → MP4)
extension/     Browser extension (Chrome + Firefox)
docs/          Screenshots & publish notes
scripts/       Build helpers
```

---

## Develop / Geliştirme

```bash
npm install
npm run app           # tray app + downloader
npm start             # downloader only
npm run pack:ext      # copy extension to LocalAppData
npm run dist          # Windows Setup (NSIS)
npm run dist:portable # optional portable exe
```

Requires Node.js 18+ on Windows. Optional: `ffmpeg` on PATH.

---

## GitHub About

**English:** IDM-like video sniffer — tray app + browser extension that catches streams and saves MP4.

**Türkçe:** IDM tarzı video yakalayıcı — tepsi uygulaması + eklenti ile akışı yakalayıp MP4 kaydeder.

---

## License

MIT — see [LICENSE](LICENSE).

Use only for content you have the right to download.
