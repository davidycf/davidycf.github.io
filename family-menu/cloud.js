// 和家里人共用一份菜单：Google 登录 + Firestore。
// 页面是公开的；数据只有 members/{uid} 里有名字的人能读写（规则在仓库根目录 firestore.rules）。
// 这份配置本来就是公开的，不是密码。
import { normalize, applyTo, cleanRecipe } from './store.js';

const V = '13.1.0', SDK = 'https://www.gstatic.com/firebasejs/'+V+'/';
const CONFIG = {
  apiKey: 'AIzaSyAbENDfq1JBpvv_jXh2YOMveA22UnUSThU',
  authDomain: 'cyu-ghpages.firebaseapp.com',
  projectId: 'cyu-ghpages',
  storageBucket: 'cyu-ghpages.firebasestorage.app',
  messagingSenderId: '563979785450',
  appId: '1:563979785450:web:3b845662026909cb5fb393'
};
const PARTS = ['settings', 'plan', 'recipes', 'have'];
const MERGED = 'family-menu-cloud-merged';

// onStatus({state, user, pending, error})
//   state: out 没登录 · checking 正在看是不是家里人 · guest 登录了但还没加进家里 · member 共用中 · error
// onStore(store 或 null)：拿到共用的 store 就换上；null 换回本机
export async function connect({defaults, localData, onStatus, onStore}){
  const [{initializeApp}, A, F] = await Promise.all(['app', 'auth', 'firestore'].map(m => import(SDK+'firebase-'+m+'.js')));
  const app = initializeApp(CONFIG), auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, {localCache: F.persistentLocalCache({tabManager: F.persistentMultipleTabManager()})}); }
  catch(e){ db = F.getFirestore(app); }   // 浏览器不让存（比如无痕模式）就不带离线副本
  const ref = Object.fromEntries(PARTS.map(p => [p, F.doc(db, 'menu', p)]));
  let unsubs = [], status = {state: 'checking'};
  const say = s => { status = s; onStatus(s); };

  function subscribe(user){
    const parts = {}, pending = {}, seen = new Set();
    let data = null, ready = false;
    const store = {
      kind: 'cloud', user,
      get data(){ return data; },
      apply(ch){ commit(ch).catch(e => say({...status, error: '没存上（'+(e.code || e.message)+'），刷新一下再试'})); }
    };
    // 每一项改动只写它碰到的那几个字段，两个人同时改不同的菜、勾不同的东西不会互相盖掉
    function commit(ch){
      const b = F.writeBatch(db), del = F.deleteField(), merge = {merge: true};
      if (ch.settings) b.set(ref.settings, applyTo(data, {settings: ch.settings}).settings, merge);
      if (ch.plan) b.set(ref.plan, {slots: ch.plan.slots, extras: ch.plan.extras || []});
      if (ch.slots || ch.extras){
        const o = {};
        if (ch.slots) o.slots = Object.fromEntries(Object.entries(ch.slots).map(([k, v]) => [k, v ? {id: v.id, locked: !!v.locked} : del]));
        if (ch.extras) o.extras = ch.extras;
        b.set(ref.plan, o, merge);
      }
      if (ch.recipesAll) b.set(ref.recipes, {items: ch.recipesAll});
      if (ch.recipes) b.set(ref.recipes, {items: Object.fromEntries(Object.entries(ch.recipes).map(([id, r]) => [id, r ? cleanRecipe(r) : del]))}, merge);
      if (ch.haveAll) b.set(ref.have, {items: ch.haveAll});
      if (ch.have) b.set(ref.have, {items: Object.fromEntries(Object.entries(ch.have).map(([k, v]) => [k, v ? true : del]))}, merge);
      return b.commit();
    }
    function emit(){
      data = normalize({settings: parts.settings, plan: parts.plan, recipes: parts.recipes, have: parts.have}, defaults);
      say({state: 'member', user, pending: PARTS.some(p => pending[p])});
      onStore(store);
    }
    // 第一次有人登录：把这台设备上的菜谱、菜单、勾选整份放上去。
    // 之后每台设备第一次登录：只把这台设备上自己加的、共用菜谱里没有的菜加进去。
    function firstLoad(){
      const local = localData();
      if (!parts.recipes){
        const b = F.writeBatch(db);
        b.set(ref.settings, local.settings); b.set(ref.plan, local.plan); b.set(ref.recipes, local.recipes); b.set(ref.have, local.have);
        b.commit().catch(e => say({...status, error: '没存上（'+(e.code || e.message)+'）'}));
        try { localStorage.setItem(MERGED, user.uid); } catch(e){}
        return;
      }
      let done = null; try { done = localStorage.getItem(MERGED); } catch(e){}
      if (done === user.uid) return;
      const names = new Set(Object.values((parts.recipes && parts.recipes.items) || {}).map(r => r.name));
      const add = Object.values(local.recipes.items).filter(r => !/^r\d+$/.test(r.id) && !names.has(r.name));
      if (add.length) commit({recipes: Object.fromEntries(add.map(r => [r.id, r]))}).catch(() => {});
      try { localStorage.setItem(MERGED, user.uid); } catch(e){}
    }
    PARTS.forEach(p => unsubs.push(F.onSnapshot(ref[p], {includeMetadataChanges: true}, snap => {
      parts[p] = snap.exists() ? snap.data() : undefined;
      pending[p] = snap.metadata.hasPendingWrites;
      seen.add(p);
      if (seen.size < PARTS.length) return;
      if (!ready){ ready = true; firstLoad(); }
      emit();
    }, e => say({state: 'error', user, error: e.code === 'permission-denied' ? '没有权限读家里的菜单' : '连不上（'+(e.code || e.message)+'）'}))));
  }

  A.onAuthStateChanged(auth, async u => {
    unsubs.forEach(f => f()); unsubs = [];
    if (!u){ onStore(null); say({state: 'out'}); return; }
    const user = {uid: u.uid, email: u.email || '', name: u.displayName || ''};
    say({state: 'checking', user});
    let member;
    try { member = (await F.getDoc(F.doc(db, 'members', u.uid))).exists(); }
    catch(e){ if (e.code === 'permission-denied') member = false; else { say({state: 'error', user, error: '连不上家里的菜单（'+(e.code || e.message)+'）'}); return; } }
    if (!member){ onStore(null); say({state: 'guest', user}); return; }
    subscribe(user);
  });

  return {
    signIn: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    signOut: () => A.signOut(auth)
  };
}
