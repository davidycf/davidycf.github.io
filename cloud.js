// 日本行程和家里人共用：Google 登录 + Firestore。和「家里的饭」同一个 Firebase 项目、同一份 members 名单、
// 同一个 SDK 版本（family-menu/cloud.js 不动）。数据在 trip/plan（方案）和 trip/ticks（勾选）两份文档；
// 访问规则在仓库根目录 firestore.rules。这份配置本来就是公开的，不是密码。
// app.js 只通过 connect() 返回的几个函数用它。两边的调用方式改了就把 CLOUD_API 加 1（app.js 里有同名常量）；
// 只改这里面的做法不用动。
export const CLOUD_API = 1;
const V = '13.1.0', SDK = 'https://www.gstatic.com/firebasejs/'+V+'/';
export const SDK_URLS = ['app', 'auth', 'firestore'].map(m => SDK+'firebase-'+m+'.js');
const CONFIG = {
  apiKey: 'AIzaSyAbENDfq1JBpvv_jXh2YOMveA22UnUSThU',
  authDomain: 'cyu-ghpages.firebaseapp.com',
  projectId: 'cyu-ghpages',
  storageBucket: 'cyu-ghpages.firebasestorage.app',
  messagingSenderId: '563979785450',
  appId: '1:563979785450:web:3b845662026909cb5fb393'
};
const FORMAT = 1;   // trip/plan 和 trip/ticks 的 v
const own = o => o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o) : [];
const netErr = e => !!e && ['unavailable', 'deadline-exceeded', 'failed-precondition'].includes(e.code);

// h.onAuth({state, user, error})
//   state: out 没登录 · checking 正在看是不是家里人 · guest 不在名单里 · member 是家里人（随后来数据）
//          · unreachable 连不上，查不了名单 · denied 读共用方案被拒（名单里删掉了）
// h.onData({plan, ticks, pending, fromCache}): plan、ticks 是两份文档的原样数据（不存在时为 null）；
//   两份文档一起变时（一次事务）只来一次
export async function connect(h){
  const [{initializeApp}, A, F] = await Promise.all(SDK_URLS.map(u => import(u)));
  const app = initializeApp(CONFIG), auth = A.getAuth(app);
  let db, persistent = true;
  try { db = F.initializeFirestore(app, {localCache: F.persistentLocalCache({tabManager: F.persistentMultipleTabManager()})}); }
  catch(e){ db = F.getFirestore(app); persistent = false; }   // 浏览器不让存（比如无痕模式）就不带离线副本
  const ref = {plan: F.doc(db, 'trip', 'plan'), ticks: F.doc(db, 'trip', 'ticks')};
  // 每次账号变化开一个新连接；旧连接的查询、事务和快照回来时已经作废，不再碰页面
  let conn = 0, unsubs = [], cur = null, user = null;

  function subscribe(my){
    const parts = {}, meta = {}, seen = new Set();
    let queued = false;
    const flush = () => { queued = false; if (my !== conn) return;
      cur = {plan: parts.plan, ticks: parts.ticks, pending: !!(meta.plan.pending || meta.ticks.pending), fromCache: !!(meta.plan.cache || meta.ticks.cache)};
      h.onData(cur); };
    ['plan', 'ticks'].forEach(p => unsubs.push(F.onSnapshot(ref[p], {includeMetadataChanges: true}, snap => {
      if (my !== conn) return;
      parts[p] = snap.exists() ? snap.data() : null;
      meta[p] = {pending: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache};
      seen.add(p);
      // 两份都到了才给页面；一次事务改两份时合成一次
      if (seen.size === 2 && !queued){ queued = true; setTimeout(flush, 0); }
    }, e => { if (my !== conn) return;
      stop();
      h.onAuth({state: e.code === 'permission-denied' ? 'denied' : 'unreachable', user, error: e.code || e.message}); })));
  }
  function stop(){ conn++; unsubs.forEach(f => f()); unsubs = []; cur = null; }

  A.onAuthStateChanged(auth, async u => {
    stop();
    const my = conn;
    if (!u){ user = null; h.onAuth({state: 'out'}); return; }
    const me = user = {uid: u.uid, email: u.email || '', name: u.displayName || ''};
    h.onAuth({state: 'checking', user: me});
    let member;
    // 名单一定问服务端（本机缓存里的“是成员”可能已经过期）
    try { member = (await F.getDocFromServer(F.doc(db, 'members', u.uid))).exists(); }
    catch(e){
      if (my !== conn) return;
      if (e.code === 'permission-denied') member = false;
      else { h.onAuth({state: 'unreachable', user: me, error: e.code || e.message}); return; }
    }
    if (my !== conn) return;
    if (!member){ h.onAuth({state: 'guest', user: me}); return; }
    h.onAuth({state: 'member', user: me});
    subscribe(my);
  });

  // 一次改动 → 字段级写入：每个日期记录整条替换，其他日期、其他组不动；删除用 deleteField()
  function writes(w, ch){
    const del = F.deleteField(), P = (...a) => new F.FieldPath(...a), pl = [], tk = [];
    ['days', 'booked', 'visited'].forEach(sec => own(ch[sec]).forEach(([k, v]) => pl.push(P(sec, k), v === null ? del : v)));
    ['opts', 'groups'].forEach(sec => own(ch[sec]).forEach(([cid, m]) => own(m).forEach(([k, v]) => pl.push(P(sec, cid, k), v === null ? del : v))));
    own(ch.ticks).forEach(([k, v]) => tk.push(P('items', k), v ? true : del));
    if (pl.length) w.update(ref.plan, ...pl);
    if (tk.length) w.update(ref.ticks, ...tk);
  }
  const data = s => s.exists() ? s.data() : null;

  return {
    persistent,
    signIn: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    signOut: () => A.signOut(auth),
    waitForSync: () => F.waitForPendingWrites(db),
    get user(){ return user; },
    // o.kind: plain 直接写（断网进队列）；checked 在线时事务里先 o.check，断网时对照本机看到的，再排队；
    //   online 只在线做（事务里 o.check）。o.check(plan, ticks) → null 或 {conflict}/{unknown}。
    // 结果：{ok, pending}（pending：服务端确认写入时 resolve）、{conflict}、{unknown}、{offline}、{stale}
    async apply(ch, o){
      const my = conn;
      if (!cur || !cur.plan) return {readonly: true};
      if (o.kind === 'online' && cur.fromCache) return {offline: true};
      if (o.kind !== 'plain' && !cur.fromCache){
        try {
          const bad = await F.runTransaction(db, async tx => {
            const p = await tx.get(ref.plan), t = await tx.get(ref.ticks);
            const r = o.check ? o.check(data(p), data(t)) : null;
            if (r) return r;
            writes(tx, ch);
            return null;
          });
          if (my !== conn) return {stale: true};
          return bad || {ok: true, pending: Promise.resolve()};
        } catch(e){ if (o.kind === 'online' || !netErr(e)) throw e; }
      }
      const bad = o.check ? o.check(cur.plan, cur.ticks) : null;
      if (bad) return bad;
      const b = F.writeBatch(db);
      writes(b, ch);
      return {ok: true, pending: b.commit()};
    },
    // 第一次：两份都不存在时用这台设备的方案和勾选建；缺哪份建哪份，已有的不动
    async create(seed){
      return F.runTransaction(db, async tx => {
        const p = await tx.get(ref.plan), t = await tx.get(ref.ticks);
        if (!p.exists()) tx.set(ref.plan, {v: FORMAT, ...seed.plan});
        if (!t.exists()) tx.set(ref.ticks, {v: FORMAT, items: p.exists() ? {} : seed.ticks});
        return {created: !p.exists()};
      });
    }
  };
}
