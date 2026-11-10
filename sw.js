// TSLV service worker
// 更新したときは VERSION の数字を上げる（古いキャッシュが消えて新しい版に切り替わる）
const VERSION = "tslv-v8";
const CORE = [
  "./", "./index.html", "./kakeibo.html", "./manifest.webmanifest",
  "./firebase-app.js", "./firebase-auth.js", "./firebase-firestore.js",
  "./icon-192.png", "./apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== VERSION + "-fonts").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 画面本体：保存済みの画面ですぐ開き、裏で最新版を確認。変わっていたら画面に知らせる
  if (url.origin === location.origin && (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/kakeibo.html"))) {
    const key = url.pathname.endsWith("kakeibo.html") ? "./kakeibo.html" : "./index.html";
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(key);
      const net = fetch(req.url, {cache:"no-store"}).then(async res => {
        if (res.ok) {
          const fresh = await res.clone().text(), old = hit ? await hit.clone().text() : null;
          await c.put(key, res.clone());
          if (old !== null && old !== fresh) (await self.clients.matchAll()).forEach(cl => cl.postMessage({type:"tslv-updated"}));
        }
        return res;
      }).catch(() => hit);
      if (hit) { try{ e.waitUntil(net); }catch(_){} return hit; }
      return net;
    }));
    return;
  }
  // アプリの部品（アイコン・Firebaseの部品）：保存済みを優先
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
    return;
  }
  // 文字（Google Fonts）：保存済みを即表示し、裏で更新
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(VERSION + "-fonts").then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
  // それ以外（Firebaseの通信）はそのまま
});
