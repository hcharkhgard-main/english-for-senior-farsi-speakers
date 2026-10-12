// Is this sound file on the phone, as itself? It may be in the audio store or — the first sounds, emergency
// phrases included — in the app's own store (sw.js names both after this copy of the site). A stored copy
// that is not a sound of the expected size (a Wi-Fi login page kept by an older version) is deleted here,
// so that it is fetched again and Settings never counts it as ready.
export async function isStored(address, bytes) {
  try {
    if (!address || typeof caches === 'undefined') return false;
    const url = new URL(address, document.baseURI).href;
    const mine = `hamrah|${new URL('./', document.baseURI).pathname}|`;
    let good = false;
    for (const name of await caches.keys()) {
      if (!name.startsWith(mine)) continue;
      const c = await caches.open(name);
      const res = await c.match(url, { ignoreSearch: true });
      if (!res) continue;
      const type = res.headers.get('Content-Type') || '', len = res.headers.get('Content-Length');
      const ok = !/^text\//i.test(type) && (!bytes || len == null || +len === bytes);
      if (ok) good = true; else await c.delete(url, { ignoreSearch: true });
    }
    return good;
  } catch { return false; }
}
