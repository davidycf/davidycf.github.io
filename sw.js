// Offline copy of the guide. Network first (4 s), the saved copy when the network fails.
// Content updates need no change here: every successful fetch refreshes the saved copy.
// Rename CORE only when this file's caching logic changes, or when a file joins FILES.
'use strict';
const CORE = 'jp27-core-v1', FONTS = 'jp27-fonts', TIMEOUT = 4000, FONT_MAX = 300;
const FILES = ['./', './app.js',
  './data/days.json', './data/cards.json', './data/books.json', './data/base.json', './data/info.json',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];
// the page reads this list back from the cache to tell whether every file is saved
const LIST = './jp27-core.json';
const abs = f => new URL(f, self.registration.scope).href;
const ROOT = abs('./'), KEYS = new Set(FILES.map(abs));

// copy a response with the time it was saved (and, when served from the cache, a flag)
async function tagged(res, extra){
  const h = new Headers(res.headers);
  Object.entries(extra).forEach(([k, v]) => h.set(k, v));
  return new Response(await res.blob(), {status:res.status, statusText:res.statusText, headers:h});
}
const save = async (key, res) => (await caches.open(CORE)).put(key, await tagged(res, {'x-jp27-saved': new Date().toISOString()}));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await c.put(abs(LIST), new Response(JSON.stringify(FILES.map(abs)), {headers:{'content-type':'application/json'}}));
    // one file failing leaves it for the next online visit to fill in
    await Promise.allSettled(FILES.map(async f => {
      const res = await fetch(abs(f), {cache:'no-cache'});
      if (res.ok) await save(abs(f), res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('jp27-') && n !== CORE && n !== FONTS).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// the cache key for a core file: the page itself (any query or hash) is ROOT
function coreKey(req, u){
  const bare = u.origin + u.pathname;
  if (bare === ROOT || bare === abs('./index.html')) return ROOT;
  return req.mode !== 'navigate' && KEYS.has(bare) ? bare : null;
}

function networkFirst(e, key){
  let saving;
  const net = fetch(e.request).then(res => { if (res.ok) saving = save(key, res.clone()); return res; });
  e.waitUntil(net.then(() => saving, () => {}));
  const cached = async () => {
    const r = await (await caches.open(CORE)).match(key);
    return r && tagged(r, {'x-jp27-from-cache': '1'});
  };
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = r => { if (!done){ done = true; clearTimeout(timer); resolve(r); } };
    // slow network: the saved copy if there is one, otherwise keep waiting
    const timer = setTimeout(() => cached().then(r => r && finish(r)), TIMEOUT);
    net.then(async res => finish(res.ok ? res : (await cached()) || res),
      async err => { const r = await cached(); if (r) finish(r); else if (!done){ done = true; clearTimeout(timer); reject(err); } });
  });
}

// Google Fonts: the saved copy first. The stylesheet refreshes in the background; font files have
// versioned URLs that never change. Fonts are a bonus: the CSS falls back to system fonts without them.
async function fontFirst(e, u){
  const c = await caches.open(FONTS), hit = await c.match(e.request);
  const net = fetch(e.request).then(async res => {
    if (res.ok || res.type === 'opaque'){
      await c.put(e.request, res.clone());
      const keys = await c.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - FONT_MAX)).map(k => c.delete(k)));
    }
    return res;
  });
  if (!hit) return net;
  if (u.hostname === 'fonts.googleapis.com') e.waitUntil(net.catch(() => {}));
  return hit;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin === self.location.origin){
    const key = coreKey(e.request, u);
    if (key) e.respondWith(networkFirst(e, key));
  } else if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com'){
    e.respondWith(fontFirst(e, u));
  }
});
