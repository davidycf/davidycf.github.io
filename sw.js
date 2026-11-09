// Offline copy of the guide. Network first (4 s), the saved copy when the network fails.
// The page, app.js and the data files belong together (one release): fresh copies wait in a per-tab
// staging cache and replace the saved copy only when that tab reports it started up on all-fresh data
// (message jp27-commit), so a half-arrived update never mixes into the saved copy. Offline, those files
// all come from one copy that has the whole group.
// Content updates need no change here. Rename CORE only when this file's caching logic changes,
// or when a file joins FILES. A renamed CORE fills up next to the old one; the old copy is kept (and
// answers offline requests) until the new one has every file.
'use strict';
const CORE = 'jp27-core-v4', FONTS = 'jp27-fonts', STAGE = 'jp27-next-', TIMEOUT = 4000, FONT_MAX = 300;
const FILES = ['./', './app.js', './cloud.js',
  './data/days.json', './data/cards.json', './data/books.json', './data/base.json', './data/info.json',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];
// the page reads this list back from the cache to tell whether every file is saved
const LIST = './jp27-core.json';
const abs = f => new URL(f, self.registration.scope).href;
const ROOT = abs('./'), KEYS = new Set(FILES.map(abs));
const isRelease = u => u === ROOT || /\.(js|json)$/.test(new URL(u).pathname);
// files that change with a release; the rest (manifest, icons) are saved as they come
const RELEASE = new Set(FILES.map(abs).filter(isRelease));

// copy a response with the time it was saved (and, when served from the cache, a flag)
async function tagged(res, extra){
  const h = new Headers(res.headers);
  Object.entries(extra).forEach(([k, v]) => h.set(k, v));
  return new Response(await res.blob(), {status:res.status, statusText:res.statusText, headers:h});
}
const save = async (key, res, cache = CORE) => (await caches.open(cache)).put(key, await tagged(res, {'x-jp27-saved': new Date().toISOString()}));
const KEPT = n => n.startsWith('jp27-core-') && n !== CORE;
const complete = async c => (await Promise.all(FILES.map(f => c.match(abs(f))))).every(Boolean);
// a copy has a whole release when every release file on its own list is there (an earlier version's
// list may name fewer files than this one's)
async function whole(c){
  const l = await c.match(abs(LIST)), list = l ? (await l.json()).filter(isRelease) : [...RELEASE];
  return (await Promise.all(list.map(k => c.match(k)))).every(Boolean);
}
// the saved copies of earlier versions, newest first
const older = async () => (await caches.keys()).filter(KEPT).reverse();
// where offline requests for release files go: this version's copy once it has the whole release,
// otherwise the newest earlier copy that has it
async function home(){
  for (const n of [CORE, ...await older()]){ const c = await caches.open(n); if (await whole(c)) return c; }
  return null;
}
// once this version's copy has every file, the earlier ones go
async function dropOlder(){
  if (!(await complete(await caches.open(CORE)))) return;
  await Promise.all((await older()).map(n => caches.delete(n)));
}
// staged saves still being written, per tab: a commit waits for them
const staging = new Map();

// save what the cache doesn't have yet. Manifest and icons go in one by one; a file that fails now is
// tried again after the next page load that reaches the network. The release files go in only as a whole
// group: while an earlier copy has a whole release, they wait for a tab's commit (a clean start on fresh
// data); with nothing to fall back on (first visit) they are fetched together and kept only if all arrive.
async function fill(){
  const c = await caches.open(CORE);
  await Promise.allSettled(FILES.map(abs).filter(k => !RELEASE.has(k)).map(async k => {
    if (await c.match(k)) return;
    const res = await fetch(k, {cache:'no-cache'});
    if (res.ok) await save(k, res);
  }));
  if (!(await whole(c)) && !(await home())){
    const rs = await Promise.all([...RELEASE].map(k => fetch(k, {cache:'no-cache'}).then(r => r.ok ? r : null, () => null)));
    if (rs.every(Boolean)) await Promise.all([...RELEASE].map((k, i) => save(k, rs[i])));
  }
  await dropOlder();
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
    // staging and other leftovers go; an earlier saved copy stays until this one is complete
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('jp27-') && n !== CORE && n !== FONTS && !KEPT(n)).map(n => caches.delete(n)));
    await dropOlder();
    await self.clients.claim();
  })());
});

// a tab reports a clean start on fresh data: its staged files become the saved copy, once every one of
// them is written and the whole release is there (a slow or failed file keeps the previous copy as it is).
// Staging left by tabs that are gone is dropped.
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'jp27-commit' || !e.source) return;
  e.waitUntil((async () => {
    const name = STAGE+e.source.id;
    await Promise.allSettled(staging.get(e.source.id) || []);
    staging.delete(e.source.id);
    if (await caches.has(name)){
      const st = await caches.open(name), core = await caches.open(CORE);
      const got = await Promise.all([...RELEASE].map(k => st.match(k)));
      if (got.every(Boolean)){
        await Promise.all([...RELEASE].map((k, i) => core.put(k, got[i])));
        await dropOlder();
      }
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
  const keep = res => {
    if (!RELEASE.has(key)) return save(key, res);
    if (!tab) return null;
    const p = save(key, res, STAGE+tab);
    if (!staging.has(tab)) staging.set(tab, []);
    staging.get(tab).push(p);
    return p;
  };
  const net = fetch(e.request).then(res => { if (res.ok) saving = Promise.all([keep(res.clone()), key === ROOT && fill()]); return res; });
  e.waitUntil(net.then(() => saving, () => {}));
  // release files from the one copy that has the whole release (so the five JSONs and app.js agree);
  // otherwise this version's copy, or while it is still filling up, the newest earlier one that has the file
  const cached = async () => {
    const h = RELEASE.has(key) && await home();
    let r = h && await h.match(key);
    for (const n of r ? [] : [CORE, ...await older()]){ r = await (await caches.open(n)).match(key); if (r) break; }
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
