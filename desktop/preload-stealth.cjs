// Sayfa scriptlerinden önce çalışır — automation izlerini azaltır
try {
  Object.defineProperty(navigator, "webdriver", {
    get: () => undefined,
    configurable: true,
  });
} catch {
  /* ignore */
}
