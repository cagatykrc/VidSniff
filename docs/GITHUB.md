# GitHub publish notes

## About (repo description)

**English:**  
`IDM-like video sniffer — tray app + browser extension that catches streams and saves MP4`

**Türkçe:**  
`IDM tarzı video yakalayıcı — tepsi uygulaması + eklenti ile akışı yakalayıp MP4 kaydeder`

## Topics

`video-downloader` `hls` `mp4` `electron` `browser-extension` `chrome-extension` `idm`

## Auto-update (important)

VidSniff checks **GitHub Releases** on every launch (not plain git commits).

### Publish a new version

1. Bump `version` in `package.json` (e.g. `1.8.0`)
2. Build: `npm run dist` → `release/VidSniff-Setup-1.8.0.exe`
3. On GitHub → **Releases** → **Draft a new release**
4. Tag: `v1.8.0` (or `1.8.0`)
5. Upload **`VidSniff-Setup-1.8.0.exe`** as a release asset
6. Publish the release

Installed apps will see the new version on next start and offer to download/install the Setup.

### Release asset name

Must match: `VidSniff-Setup-*.exe`
