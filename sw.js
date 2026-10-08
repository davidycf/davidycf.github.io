// Offline copy of the guide. Network first (4 s), the saved copy when the network fails.
// The page, app.js and the data files belong together (one release): fresh copies wait in a per-tab
// staging cache and replace the saved copy only when that tab reports it started up on all-fresh data
// (message jp27-commit), so a half-arrived update never mixes into the saved copy.
// Content updates need no change here. Rename CORE only when this file's caching logic changes,
// or when a file joins FILES.
'use strict';
const CORE = 'jp27-core-v2', FONTS = 'jp27-fonts', STAGE = 'jp27-next-', TIMEOUT = 4000, FONT_MAX = 300;
const FILES = ['./', './app.js',
  './data/days.json', './data/cards.json', './data/books.json', './data/base.json', './data/info.json',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];
// the page reads this list back from the cache to tell whether every file is saved
const LIST = './jp27-core.json';
const abs = f => new URL(f, self.registration.scope).href;
const ROOT = abs('./'), KEYS = new Set(FILES.map(abs));
// files that change with a release; the rest (manifest, icons) are saved as they come
const RELEASE = new Set(FILES.filter(f => f === './' || /\.(js|json)$/.test(f)).map(abs));

// copy a response with the time it was saved (and, when served from the cache, a flag)
async function tagged(res, extra){
  const h = new Headers(res.headers);
  Object.entries(extra).forEach(([k, v]) => h.set(k, v));
  return new Response(await res.blob(), {status:res.status, statusText:res.statusText, headers:h});
}
const save = async (key, res, cache = CORE) => (await caches.open(cache)).put(key, await tagged(res, {'x-jp27-saved': new Date().toISOString()}));

// save every listed file the cache doesn't have yet. A file that fails now (a dropped request on the
// first visit) is tried again after the next page load that reaches the network.
async function fill(){
  const c = await caches.open(CORE);
  await Promise.allSettled(FILES.map(async f => {
    if (await c.match(abs(f))) return;
    const res = await fetch(abs(f), {cache:'no-cache'});
    if (res.ok) await save(abs(f), res);
  }));
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await c.put(abs(LIST), new Response(JSON.stringify(FILES.map(abs)), {headers:{'content-type':'application/json'}}));
    await fill();
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

// a tab reports a clean start on fresh data: its staged files become the saved copy.
// Staging left by tabs that are gone is dropped.
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'jp27-commit' || !e.source) return;
  e.waitUntil((async () => {
    const name = STAGE+e.source.id;
    if (await caches.has(name)){
      const st = await caches.open(name), core = await caches.open(CORE);
      await Promise.all((await st.keys()).map(async k => core.put(k, await st.match(k))));
    }
    const live = new Set((await self.clients.matchAll()).map(c => STAGE+c.id));
    await Promise.all((await caches.keys()).filter(n => n.startsWith(STAGE) && (n === name || !live.has(n))).map(n => caches.delete(n)));
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
  // release files wait in this tab's staging cache; manifest and icons are saved straight away.
  // The page itself loaded from the network: also top up anything still missing.
  const tab = e.request.mode === 'navigate' ? e.resultingClientId : e.clientId;
  const keep = res => !RELEASE.has(key) ? save(key, res) : tab ? save(key, res, STAGE+tab) : null;
  const net = fetch(e.request).then(res => { if (res.ok) saving = Promise.all([keep(res.clone()), key === ROOT && fill()]); return res; });
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
