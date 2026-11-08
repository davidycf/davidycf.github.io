// 菜单的数据和保存。界面只通过 store.data 读、通过 store.apply(change) 改；
// 存在本机（localStorage）还是和家人共用，换的只是这里的实现。
//
// data = {
//   settings: {start, days, mode, people, spicy, withExtra},
//   plan:     {slots: {'2026-11-09|晚饭': {id, locked}}, extras: [菜 id]},
//   recipes:  {items: {菜 id: 菜}},
//   have:     {items: {'鸡蛋|个': true}}      买菜清单里勾掉的
// }
// change 可以同时带几项，一次存好：
//   settings 部分设置 · plan 整个替换 · slots {key: 值或 null} · extras 数组
//   recipes {id: 菜或 null} · recipesAll 整个菜谱 · have {key: 数量或 false} · haveAll 整个替换

export const KEY = 'family-menu-v2', OLD_KEY = 'family-menu-v1';
export const MEALS = {dinner: ['晚饭'], both: ['午饭', '晚饭']};

const clone = v => JSON.parse(JSON.stringify(v));
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

export function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
export function nextMonday(){ const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return iso(d); }

export function defaultSettings(){ return {start: nextMonday(), days: 7, mode: 'dinner', people: 4, spicy: true, withExtra: true}; }

export function validRecipe(r){
  return isObj(r) && typeof r.id === 'string' && r.id && typeof r.name === 'string' && r.name.trim() && r.name.length < 150 && Array.isArray(r.ingredients);
}
export function cleanRecipe(r){
  return {id: r.id, name: r.name.trim(), type: typeof r.type === 'string' ? r.type : 'other', spicy: !!r.spicy,
    ingredients: r.ingredients.filter(g => isObj(g) && typeof g.name === 'string' && g.name.trim()).slice(0, 60)
      .map(g => ({name: g.name.trim(), qty: Number(g.qty) > 0 ? Number(g.qty) : 0, unit: String(g.unit || '').trim(), group: String(g.group || '其他')})),
    ...(r.added ? {added: Number(r.added) || 0} : {})};
}
function cleanSettings(s){
  const d = defaultSettings(), o = isObj(s) ? s : {};
  return {
    start: /^\d{4}-\d{2}-\d{2}$/.test(o.start) ? o.start : d.start,
    days: [3, 5, 7].includes(Number(o.days)) ? Number(o.days) : d.days,
    mode: MEALS[o.mode] ? o.mode : d.mode,
    people: Math.min(10, Math.max(1, Math.round(Number(o.people)) || d.people)),
    spicy: o.spicy === undefined ? d.spicy : !!o.spicy,
    withExtra: o.withExtra === undefined ? d.withExtra : !!o.withExtra
  };
}
function cleanSlots(s){
  const out = {};
  if (isObj(s)) for (const [k, v] of Object.entries(s)) if (/^\d{4}-\d{2}-\d{2}\|/.test(k) && isObj(v) && typeof v.id === 'string') out[k] = {id: v.id, locked: !!v.locked};
  return out;
}

// 任何来源（本机、共用的数据、旧版）读进来都先补齐、去掉坏数据
export function normalize(raw, defaults){
  const o = isObj(raw) ? raw : {};
  const items = {};
  if (isObj(o.recipes) && isObj(o.recipes.items)) for (const r of Object.values(o.recipes.items)) if (validRecipe(r)) items[r.id] = cleanRecipe(r);
  const fresh = !(isObj(o.recipes) && isObj(o.recipes.items));
  if (fresh) for (const r of defaults) items[r.id] = clone(r);
  const have = {};
  if (isObj(o.have) && isObj(o.have.items)) for (const [k, v] of Object.entries(o.have.items)) if (v === true || (typeof v === 'number' && v > 0)) have[k] = v;
  return {
    settings: cleanSettings(o.settings),
    plan: {slots: cleanSlots(isObj(o.plan) && o.plan.slots), extras: (isObj(o.plan) && Array.isArray(o.plan.extras) ? o.plan.extras : []).filter(x => typeof x === 'string').slice(0, 5)},
    recipes: {items},
    have: {items: have}
  };
}

// 旧版（family-menu-v1）存的东西：菜谱、菜单、勾选和设置都接过来
export function fromV1(old, defaults){
  if (!isObj(old) || !Array.isArray(old.recipes)) return null;
  const items = {};
  old.recipes.filter(validRecipe).slice(0, 250).forEach(r => { items[r.id] = cleanRecipe(r); });
  const slots = {};
  (Array.isArray(old.plan) ? old.plan : []).forEach(p => {
    if (!isObj(p) || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || typeof p.id !== 'string') return;
    const meal = /午/.test(p.meal) ? '午饭' : '晚饭';
    slots[p.date+'|'+meal] = {id: p.id, locked: false};
  });
  // 旧版改了设置但没重抽时，屏幕上还是原来那周：设置跟着那周走，不然排好的菜都落在新的日期范围外面
  let settings = isObj(old.settings) ? {...old.settings} : {};
  const dates = [...new Set(Object.keys(slots).map(k => k.split('|')[0]))].sort();
  if (dates.length){
    const span = Math.round((new Date(dates[dates.length-1]+'T12:00:00') - new Date(dates[0]+'T12:00:00')) / 864e5) + 1;
    settings = {...settings, start: dates[0], days: [3, 5, 7].find(n => n >= span) || 7, mode: Object.keys(slots).some(k => k.endsWith('午饭')) ? 'both' : 'dinner'};
  }
  return normalize({settings, plan: {slots, extras: old.extras}, recipes: {items}, have: {items: old.have}}, defaults);
}

// 一次改动套到一份 data 上（本机直接用；共用版拿它先在本地显示）
export function applyTo(data, ch){
  const d = clone(data);
  if (ch.settings) d.settings = cleanSettings({...d.settings, ...ch.settings});
  if (ch.plan) d.plan = {slots: cleanSlots(ch.plan.slots), extras: (ch.plan.extras || []).slice(0, 5)};
  if (ch.slots) for (const [k, v] of Object.entries(ch.slots)) { if (v) d.plan.slots[k] = {id: v.id, locked: !!v.locked}; else delete d.plan.slots[k]; }
  if (ch.extras) d.plan.extras = ch.extras.slice(0, 5);
  if (ch.recipesAll) d.recipes.items = clone(ch.recipesAll);
  if (ch.recipes) for (const [id, r] of Object.entries(ch.recipes)) { if (r) d.recipes.items[id] = cleanRecipe(r); else delete d.recipes.items[id]; }
  if (ch.haveAll) d.have.items = clone(ch.haveAll);
  if (ch.have) for (const [k, v] of Object.entries(ch.have)) { if (v === true || (typeof v === 'number' && v > 0)) d.have.items[k] = v; else delete d.have.items[k]; }
  return d;
}

function read(k){ try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch(e){ return null; } }

export function loadLocal(defaults){
  const cur = read(KEY);
  if (cur) return normalize(cur, defaults);
  return fromV1(read(OLD_KEY), defaults) || normalize(null, defaults);
}

export function createLocalStore({defaults, onChange}){
  let data = loadLocal(defaults), canSave = true;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({v: 2, ...data})); canSave = true; } catch(e){ canSave = false; } };
  save();
  // 同一台设备开了两个页面时，另一个页面改了也跟着变
  addEventListener('storage', e => { if (e.key === KEY && e.newValue){ try { data = normalize(JSON.parse(e.newValue), defaults); onChange(); } catch(err){} } });
  return {
    kind: 'local',
    get data(){ return data; },
    get canSave(){ return canSave; },
    apply(ch){ data = applyTo(data, ch); save(); onChange(); }
  };
}
