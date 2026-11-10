# GitHub publish checklist

## About (repo description)

**EN:** IDM-like video sniffer — tray app + browser extension that catches streams and saves MP4.

**TR:** IDM tarzı video yakalayıcı — tepsi uygulaması + eklenti ile akışı yakalayıp MP4 kaydeder.

## Topics

`video-downloader` `hls` `mp4` `electron` `browser-extension` `chrome-extension` `idm`

## Release assets

After `npm run dist`, upload from `release/`:

- `VidSniff-Setup-1.7.0.exe`

Optional: `npm run dist:portable` → `VidSniff-Portable-1.7.0.exe`

## Notes for visitors

- Windows Setup installs Start Menu + Desktop shortcuts; app runs from tray.
- Extension must be loaded once (assistant guides Chrome/Edge).
- Autostart lives under **Settings**, not the extension wizard.
