import { DEFAULTS } from './defaults.js';
import { createLocalStore, normalize, cleanRecipe, validRecipe, MEALS, iso } from './store.js';

// ---------- 分类 ----------
const TYPES = [['pork','猪肉'],['chicken','鸡肉'],['beef','牛肉'],['seafood','鱼虾'],['veg','蔬菜和蛋'],['noodle','面食和主食'],['other','其他'],['breakfast','早饭'],['snack','甜点和小吃']];
const TYPE_SHORT = {pork:'猪肉', chicken:'鸡肉', beef:'牛肉', seafood:'鱼虾', veg:'蔬菜', noodle:'面食', breakfast:'早饭', snack:'甜点', other:'其他'};
// 菜牌颜色：荤菜红、素菜绿、主食黄
const kind = t => t === 'veg' ? 'su' : t === 'noodle' ? 'zhu' : t === 'breakfast' || t === 'snack' ? 'extra' : t === 'other' ? 'qi' : 'rou';
const KIND_NAME = {rou:'荤菜', su:'素菜', zhu:'主食', qi:'其他', extra:'早饭和甜点'};
const KIND_COLOR = {rou:'--rou', su:'--su', zhu:'--zhu', qi:'--qi', extra:'--zhu'};
const SHOP = ['肉类','禽类','水产','蔬菜','蛋奶','米面干货','坚果','其他'];
const COUNT = /^(个|根|只|张|瓣|块|颗|把|包|盒|袋|条|片|罐|瓶|棵)$/;
const WD = '日一二三四五六';

// ---------- 小工具 ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = v => JSON.parse(JSON.stringify(v));
const fromIso = s => { const d = new Date(s+'T12:00:00'); return isNaN(d) ? new Date() : d; };
const short = n => n.replace(/[（(].*?[)）]/g, '').trim() || n;
const md = d => (d.getMonth()+1)+'月'+d.getDate()+'日';

let store, sel = null, tab = 'menu', notice = '';
const D = () => store.data;
const byId = id => D().recipes.items[id];
const recipes = () => Object.values(D().recipes.items).sort((a, b) => {
  const ra = /^r\d+$/.test(a.id) ? 0 : 1, rb = /^r\d+$/.test(b.id) ? 0 : 1;
  return ra - rb || (a.added || 0) - (b.added || 0) || a.id.localeCompare(b.id);
});
const mains = () => recipes().filter(r => kind(r.type) !== 'extra' && (D().settings.spicy || !r.spicy));

function slotsFor(s){
  const out = [], d = fromIso(s.start);
  for (let i = 0; i < s.days; i++){ const ds = iso(d); MEALS[s.mode].forEach(m => out.push({key: ds+'|'+m, date: ds, meal: m, day: i})); d.setDate(d.getDate()+1); }
  return out;
}
const slots = () => slotsFor(D().settings);
const slotOf = key => slots().find(s => s.key === key);
const dishAt = key => { const v = D().plan.slots[key]; return v && byId(v.id) ? v : null; };

// ---------- 抽菜 ----------
function pick(pool, uses, prevType, dayIds){
  let best = null, top = -Infinity;
  for (const r of pool){
    let v = Math.random()*6 - (uses[r.id] || 0)*13;
    if (dayIds.includes(r.id)) v -= 30;
    if (prevType && prevType === r.type) v -= 3;
    if (v > top){ top = v; best = r; }
  }
  return best;
}
function undoable(msg, before){ toast(msg, () => { store.apply(before); toast('已撤销'); }); }

// fillOnly：只补空着的顿，已经排上的都不动
function draw(fillOnly){
  const pool = mains();
  if (!pool.length){ toast('菜谱里还没有能当正餐的菜'); return; }
  const all = slots(), next = {}, uses = {}, changed = [];
  for (const s of all){ const o = dishAt(s.key); if (o && (o.locked || fillOnly)){ next[s.key] = clone(o); uses[o.id] = (uses[o.id] || 0) + 1; } }
  let prev = null;
  for (const s of all){
    if (!next[s.key]){
      const dayIds = all.filter(x => x.date === s.date && next[x.key]).map(x => next[x.key].id);
      const r = pick(pool, uses, prev, dayIds);
      next[s.key] = {id: r.id, locked: false}; uses[r.id] = (uses[r.id] || 0) + 1; changed.push(s.key);
    }
    prev = byId(next[s.key].id).type;
  }
  let extras = D().plan.extras;
  if (!fillOnly){
    extras = [];
    if (D().settings.withExtra) ['breakfast','snack'].forEach(t => { const o = recipes().filter(r => r.type === t); if (o.length) extras.push(o[Math.floor(Math.random()*o.length)].id); });
  }
  const before = {plan: clone(D().plan), haveAll: clone(D().have.items)};
  const kept = all.length - changed.length, wasEmpty = !Object.keys(before.plan.slots).length;
  swingKeys = changed;
  store.apply(fillOnly ? {slots: Object.fromEntries(changed.map(k => [k, next[k]]))} : {plan: {slots: next, extras}, haveAll: {}});
  if (wasEmpty) toast('这一周排好了');
  else undoable(fillOnly ? '补上了 '+changed.length+' 顿' : kept ? '换了 '+changed.length+' 顿，定好的没动' : '整周重抽了', before);
}
function reroll(key){
  const cur = dishAt(key), pool = mains().filter(r => !cur || r.id !== cur.id);
  if (!pool.length){ toast('没有别的菜可换'); return; }
  const all = slots(), i = all.findIndex(s => s.key === key), uses = {};
  all.forEach(s => { const o = dishAt(s.key); if (o && s.key !== key) uses[o.id] = (uses[o.id] || 0) + 1; });
  const dayIds = all.filter(s => s.date === all[i].date && s.key !== key).map(s => dishAt(s.key)).filter(Boolean).map(o => o.id);
  const prev = i > 0 && dishAt(all[i-1].key);
  const r = pick(pool, uses, prev && byId(prev.id).type, dayIds);
  swingKeys = [key];
  store.apply({slots: {[key]: {id: r.id, locked: false}}});
}
function setDish(key, id){ swingKeys = [key]; store.apply({slots: {[key]: {id, locked: true}}}); }
function toggleLock(key){ const o = dishAt(key); if (!o) return; store.apply({slots: {[key]: {id: o.id, locked: !o.locked}}}); toast(o.locked ? '取消了，再抽时会换' : '定下了，再抽时不会换'); }

// 改天数、顿数或开始日期：按“第几天的哪一顿”对回去，晚饭还是晚饭，整周跟着日期挪
function changeLayout(patch){
  const old = slots(), byPos = {};
  old.forEach(s => { const o = dishAt(s.key); if (o) byPos[s.day+'|'+s.meal] = o; });
  const next = slotsFor({...D().settings, ...patch}), mapped = {};
  next.forEach(s => { const o = byPos[s.day+'|'+s.meal]; if (o) mapped[s.key] = clone(o); });
  const hadPlan = Object.keys(byPos).length;
  store.apply({settings: patch, plan: {slots: mapped, extras: D().plan.extras}});
  const empty = slots().filter(s => !dishAt(s.key)).length;
  if (hadPlan && empty) toast('多出来的 '+empty+' 顿还空着');
}

// ---------- 用量 ----------
function amount(q, u){
  if (!q) return '适量';
  let v = q * D().settings.people / 4;
  if (COUNT.test(u)) return Math.max(1, Math.ceil(v - 0.01))+' '+u;
  if (u === 'g' || u === 'ml'){ v = v >= 100 ? Math.ceil(v/50)*50 : Math.max(5, Math.ceil(v/5)*5); return v+' '+u; }
  return (Math.round(v*10)/10)+(u ? ' '+u : '');
}

// ---------- 墙 ----------
let swingKeys = [];
function renderBoard(){
  const s = D().settings, today = iso(new Date()), both = s.mode === 'both', all = slots();
  const dates = [...new Set(all.map(x => x.date))];
  $('cols').style.gridTemplateColumns = 'repeat('+dates.length+',minmax(0,64px))';
  document.documentElement.style.setProperty('--tag-h', both ? '118px' : '170px');
  $('cols').innerHTML = dates.map(ds => {
    const d = fromIso(ds), isToday = ds === today;
    return '<div class="col"><div class="day-h'+(isToday ? ' today' : '')+'"><b>'+(isToday ? '今' : WD[d.getDay()])+'</b>'+d.getDate()+'</div><div class="hang">'
      + all.filter(x => x.date === ds).map(x => {
        const o = dishAt(x.key), r = o && byId(o.id), label = '周'+WD[d.getDay()]+' '+md(d)+' '+x.meal;
        const attrs = ' data-act="sel" data-key="'+esc(x.key)+'" data-f="tag:'+esc(x.key)+'" aria-pressed="'+(x.key === sel)+'"';
        if (!r) return '<button class="tag empty"'+attrs+' aria-label="'+label+'，还没排"><span class="name">空</span></button>';
        return '<button class="tag '+kind(r.type)+(o.locked ? ' locked' : '')+(swingKeys.includes(x.key) ? ' swing' : '')+'"'+attrs
          + ' aria-label="'+label+'：'+esc(r.name)+(r.spicy ? '，辣' : '')+(o.locked ? '，已定' : '')+'"><span class="pin"></span>'
          + (both ? '<span class="seal">'+x.meal[0]+'</span>' : '')+'<span class="name">'+esc(short(r.name))+'</span>'+(r.spicy ? '<span class="hot">辣</span>' : '')+'</button>';
      }).join('') + '</div></div>';
  }).join('');
  swingKeys = [];
  const f = fromIso(dates[0]), l = fromIso(dates[dates.length-1]);
  $('range').textContent = md(f)+'–'+(l.getMonth() === f.getMonth() ? l.getDate()+'日' : md(l));
  const used = new Set(all.map(x => dishAt(x.key)).filter(Boolean).map(o => kind(byId(o.id).type)));
  $('key').innerHTML = ['rou','su','zhu','qi'].filter(k => k !== 'qi' || used.has('qi')).map(k => '<span><i style="background:var('+KIND_COLOR[k]+')"></i>'+KIND_NAME[k]+'</span>').join('');
  const filled = all.filter(x => dishAt(x.key)).length, locked = all.filter(x => dishAt(x.key)?.locked).length, empty = all.length - filled;
  $('drawBar').innerHTML = !filled
    ? '<button class="btn main" data-act="draw" data-f="draw">抽一周</button>'
    : empty
      ? '<button class="btn main" data-act="fill" data-f="fill">补上空着的 '+empty+' 顿<small>排好的不动</small></button><button class="btn plain" data-act="draw" data-f="draw">全部重抽</button>'
      : '<button class="btn main" data-act="draw" data-f="draw">再抽一次'+(locked ? '<small>定好的 '+locked+' 顿不动</small>' : '')+'</button>';
}

// ---------- 这周吃 ----------
function renderMenu(){
  const root = $('p-menu'), all = slots();
  if (!all.some(x => dishAt(x.key))){
    root.innerHTML = (notice ? '<p class="when" style="margin-bottom:12px">'+notice+'</p>' : '')
      + '<p class="when">还没排菜。点上面的「抽一周」，从 '+mains().length+' 道菜里随机排'+(D().settings.mode === 'both' ? '午饭和晚饭' : '晚饭')+'。</p>';
    return;
  }
  const s = slotOf(sel) || all[0]; sel = s.key;
  const o = dishAt(s.key), r = o && byId(o.id), d = fromIso(s.date);
  let h = (notice ? '<p class="when" style="margin-bottom:12px">'+notice+'</p>' : '') + '<p class="when">周'+WD[d.getDay()]+' '+md(d)+' '+s.meal+'</p>';
  if (r){
    const k = kind(r.type), main = r.ingredients.filter(g => g.group !== '调味品');
    h += '<h2 class="dish">'+esc(r.name)+'</h2>'
      + '<div class="chips"><span class="chip k-'+k+'">'+KIND_NAME[k]+'</span><span class="chip">'+esc(TYPE_SHORT[r.type] || '其他')+'</span>'+(r.spicy ? '<span class="chip hot">辣</span>' : '')+'</div>'
      + (main.length ? '<p class="uses"><b>'+D().settings.people+' 人份</b>'+main.map(g => esc(g.name)+' '+amount(g.qty, g.unit)).join('、')+'</p>' : '')
      + '<div class="row"><button class="btn plain" data-act="one" data-f="one">换一道</button><button class="btn plain" data-act="lock" data-f="lock" aria-pressed="'+!!o.locked+'">'+(o.locked ? '已定，点一下取消' : '就吃这个')+'</button></div>';
  } else {
    h += '<h2 class="dish none">这一顿还空着</h2><div class="row"><button class="btn plain" data-act="one" data-f="one">抽一道</button></div>';
  }
  h += '<h2>自己挑<small>点一下就换上，并定下来</small></h2><div class="pick">'
    + mains().map(x => '<button data-act="set" data-id="'+esc(x.id)+'" data-f="pick:'+esc(x.id)+'"'+(r && x.id === r.id ? ' aria-current="true"' : '')+'><i style="background:var('+KIND_COLOR[kind(x.type)]+')"></i>'+esc(short(x.name))+(x.spicy ? '<em>辣</em>' : '')+'</button>').join('')
    + '</div>';
  const ex = D().plan.extras.map(byId).filter(Boolean);
  if (ex.length) h += '<h2>这周顺便做</h2><div class="extras">'+ex.map(x => '<div class="extra"><span>'+(x.type === 'breakfast' ? '早饭' : '甜点')+'</span><b>'+esc(x.name)+'</b></div>').join('')+'</div>';
  h += '<div class="tools"><button class="btn plain" data-act="copyWeek" data-f="copyWeek">复制这周的菜</button><button class="btn plain" data-act="print" data-f="print">打印菜单和清单</button></div>';
  root.innerHTML = h;
}

// ---------- 买菜 ----------
function shopData(){
  const all = {}, pantry = {}, ids = slots().map(s => dishAt(s.key)).filter(Boolean).map(o => o.id).concat(D().plan.extras);
  ids.forEach(id => { const r = byId(id); if (!r) return; r.ingredients.forEach(g => {
    if (g.group === '调味品'){ (pantry[g.name] ||= new Set()).add(short(r.name)); return; }
    const k = g.name+'|'+g.unit;
    all[k] ||= {key: k, name: g.name, unit: g.unit, group: SHOP.includes(g.group) ? g.group : '其他', qty: 0, src: new Set()};
    all[k].qty += g.qty || 0; all[k].src.add(short(r.name));
  }); });
  return {items: Object.values(all).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')), pantry};
}
function renderShop(){
  const root = $('p-shop'), d = shopData(), have = D().have.items;
  if (!d.items.length && !Object.keys(d.pantry).length){ root.innerHTML = '<p class="when">排好这周的菜，这里会列出要买的东西。</p>'; return; }
  const need = d.items.filter(x => !have[x.key]).length;
  let h = '<div class="shop-top"><p><b>'+need+'</b>样要买，'+D().settings.people+' 人份</p><button class="btn plain" data-act="copyShop" data-f="copyShop" style="min-height:40px">复制清单</button></div>';
  SHOP.forEach(g => { const xs = d.items.filter(x => x.group === g); if (!xs.length) return;
    h += '<div class="group"><h3>'+g+'</h3>' + xs.map(x => { const c = !!have[x.key];
      return '<label class="item'+(c ? ' have' : '')+'"><input type="checkbox" data-act="have" data-k="'+esc(x.key)+'" data-f="have:'+esc(x.key)+'"'+(c ? ' checked' : '')+'><span class="n">'+esc(x.name)+'</span><span class="q">'+amount(x.qty, x.unit)+'</span><span class="src">'+esc([...x.src].join('、'))+'</span></label>'; }).join('') + '</div>'; });
  const pn = Object.keys(d.pantry);
  if (pn.length) h += '<div class="group"><h3>调料：看看家里还够不够</h3><p class="pantry">'+pn.map(n => '<span>'+esc(n)+'</span>').join('')+'</p></div>';
  h += '<p class="when" style="margin-top:16px">家里已经有的勾掉就行。数量按菜谱估算，向上取整。</p>';
  root.innerHTML = h;
}

// ---------- 菜谱 ----------
function renderBook(){
  const root = $('p-book'), open = new Set([...root.querySelectorAll('details[open]')].map(x => x.dataset.id)), list = recipes();
  let h = '<div class="book-top"><p class="when">'+list.length+' 道菜，点开看用料</p><button class="btn plain" data-act="addRec" data-f="addRec" style="min-height:40px">加一道菜</button></div>';
  if (!list.length) h += '<p class="when" style="margin-top:16px">菜谱是空的。加几道你们常吃的菜，就能开始抽了。</p>';
  ['rou','su','zhu','qi','extra'].forEach(k => { const xs = list.filter(r => kind(r.type) === k); if (!xs.length) return;
    h += '<div class="rgroup"><h3><i style="background:var('+KIND_COLOR[k]+')"></i>'+KIND_NAME[k]+'<small>'+xs.length+' 道</small></h3>'
      + xs.map(r => '<details class="recipe" data-id="'+esc(r.id)+'"'+(open.has(r.id) ? ' open' : '')+'><summary data-f="rec:'+esc(r.id)+'"><span>'+esc(r.name)+(r.spicy ? '<span class="chip hot">辣</span>' : '')+'</span></summary>'
        + (r.ingredients.length ? '<ul>'+r.ingredients.map(g => '<li>'+esc(g.name)+'<em>'+(g.qty ? g.qty+' '+esc(g.unit) : '适量')+'</em></li>').join('')+'</ul>' : '<p class="when">还没写用料。</p>')
        + '<div class="recipe-acts"><button class="btn plain" data-act="editRec" data-id="'+esc(r.id)+'" data-f="edit:'+esc(r.id)+'">改一改</button><button class="btn plain danger" data-act="delRec" data-id="'+esc(r.id)+'" data-f="del:'+esc(r.id)+'">删掉</button></div></details>').join('')
      + '</div>'; });
  h += '<div class="book-foot"><p class="hint">用料按 4 人份记，买菜清单按设置里的人数换算。</p><button class="btn plain danger" data-act="resetRec" data-f="resetRec">恢复最初的 '+DEFAULTS.length+' 道菜</button></div>';
  root.innerHTML = h;
}

// ---------- 加菜、改菜 ----------
let editing = null;
const normDigits = s => s.replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
function inferGroup(n){
  if (/^(盐|糖|白糖|冰糖|红糖|醋|香醋|陈醋|米醋|生抽|老抽|酱油|料酒|蚝油|鱼露|淀粉|玉米淀粉|味精|鸡精|胡椒粉?|白胡椒|花椒|八角|桂皮|香叶|干辣椒|辣椒面|辣椒油|泡椒|食用油|香油|麻油|芝麻油|花生油|菜籽油)$/.test(n) || /酱$/.test(n)) return '调味品';
  if (/鸡蛋|鸭蛋|鹌鹑蛋|牛奶|黄油|奶油|奶酪|酸奶/.test(n)) return '蛋奶';
  if (/鸡|鸭|鹅/.test(n)) return '禽类';
  if (/鱼|虾|蟹|蛤|贝|鱿|蛏|海带|紫菜/.test(n)) return '水产';
  if (/猪|牛|羊|排骨|五花|里脊|肉/.test(n)) return '肉类';
  if (/面|米|粉条|粉丝|豆腐|腐竹|干木耳|饺子皮|馄饨皮|年糕/.test(n)) return '米面干货';
  if (/花生|芝麻|核桃|腰果|杏仁/.test(n)) return '坚果';
  return '蔬菜';
}
export function parseIngredients(raw, prevList = []){
  const prev = Object.fromEntries(prevList.map(g => [g.name, g.group]));
  return normDigits(raw).split('\n').map(l => l.trim()).filter(Boolean).slice(0, 60).map(line => {
    const m = line.match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*([^\d\s]*)$/);
    const name = (m ? m[1] : line).trim(), qty = m ? Number(m[2]) : 0, unit = m ? m[3] : '';
    return {name, qty, unit, group: prev[name] || inferGroup(name)};
  });
}
function openEditor(id){
  editing = id ? byId(id) : null;
  $('recTitle').textContent = editing ? '改一改：'+short(editing.name) : '加一道菜';
  $('rName').value = editing ? editing.name : '';
  $('rType').innerHTML = TYPES.map(([v, l]) => '<option value="'+v+'">'+l+'</option>').join('');
  $('rType').value = editing ? editing.type : 'pork';
  $('rSpicy').setAttribute('aria-checked', String(!!(editing && editing.spicy)));
  $('rIng').value = editing ? editing.ingredients.map(g => g.name+(g.qty ? ' '+g.qty+(g.unit ? ' '+g.unit : '') : '')).join('\n') : '';
  $('rErr').hidden = true;
  $('recSheet').showModal(); $('rName').focus();
}
function saveEditor(e){
  e.preventDefault();
  const name = $('rName').value.trim(), err = m => { $('rErr').textContent = m; $('rErr').hidden = false; };
  if (!name) return err('写个菜名');
  if (recipes().some(r => r.name === name && (!editing || r.id !== editing.id))) return err('菜谱里已经有「'+name+'」了');
  const r = cleanRecipe({id: editing ? editing.id : 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2, 5), name, type: $('rType').value,
    spicy: $('rSpicy').getAttribute('aria-checked') === 'true', ingredients: parseIngredients($('rIng').value, editing ? editing.ingredients : []),
    added: editing ? editing.added : Date.now()});
  const before = editing ? {recipes: {[r.id]: clone(editing)}} : {recipes: {[r.id]: null}};
  store.apply({recipes: {[r.id]: r}});
  $('recSheet').close();
  undoable(editing ? '改好了「'+short(name)+'」' : '「'+short(name)+'」加进菜谱了', before);
}
function deleteRecipe(id){
  const r = byId(id); if (!r) return;
  const hit = Object.entries(D().plan.slots).filter(([, v]) => v.id === id).map(([k]) => k);
  const before = {recipes: {[id]: clone(r)}, slots: Object.fromEntries(hit.map(k => [k, clone(D().plan.slots[k])])), extras: clone(D().plan.extras)};
  store.apply({recipes: {[id]: null}, slots: Object.fromEntries(hit.map(k => [k, null])), extras: D().plan.extras.filter(x => x !== id)});
  undoable('删掉了「'+short(r.name)+'」'+(hit.length ? '，菜单里空出 '+hit.length+' 顿' : ''), before);
}
function resetRecipes(){
  const custom = recipes().filter(r => !/^r\d+$/.test(r.id)).length;
  if (!confirm('恢复最初的 '+DEFAULTS.length+' 道菜？'+(custom ? '后来加的 '+custom+' 道会删掉，' : '')+'改过的菜会改回去，这周的菜单清空。')) return;
  const before = {recipesAll: clone(D().recipes.items), plan: clone(D().plan), haveAll: clone(D().have.items)};
  store.apply({recipesAll: Object.fromEntries(DEFAULTS.map(r => [r.id, clone(r)])), plan: {slots: {}, extras: []}, haveAll: {}});
  undoable('菜谱恢复了', before);
}

// ---------- 复制、打印 ----------
function weekLines(){
  const all = slots(), lines = ['这周的菜（'+$('range').textContent+'）'];
  all.forEach(s => { const o = dishAt(s.key), d = fromIso(s.date); lines.push('周'+WD[d.getDay()]+' '+(d.getMonth()+1)+'/'+d.getDate()+' '+s.meal+'：'+(o ? byId(o.id).name : '还没排')); });
  const ex = D().plan.extras.map(byId).filter(Boolean);
  if (ex.length) lines.push('顺便做：'+ex.map(x => (x.type === 'breakfast' ? '早饭 ' : '甜点 ')+x.name).join('，'));
  return lines;
}
function shopLines(){
  const d = shopData(), have = D().have.items, lines = ['买菜清单（'+D().settings.people+' 人份）'];
  SHOP.forEach(g => { const xs = d.items.filter(x => x.group === g && !have[x.key]); if (xs.length){ lines.push('', '【'+g+'】'); xs.forEach(x => lines.push('□ '+x.name+' '+amount(x.qty, x.unit))); } });
  const pn = Object.keys(d.pantry); if (pn.length) lines.push('', '【调料，看看够不够】', pn.join('、'));
  return lines;
}
function copy(text, done){
  const fallback = () => prompt('复制下面的内容', text);
  if (navigator.clipboard && isSecureContext) navigator.clipboard.writeText(text).then(() => toast(done), fallback); else fallback();
}
function buildPrintout(){
  const d = shopData(), have = D().have.items;
  let h = '<h1>家里的饭</h1><p>'+esc($('range').textContent)+'，'+D().settings.people+' 人份</p><table>';
  slots().forEach(s => { const o = dishAt(s.key), dt = fromIso(s.date); h += '<tr><td>周'+WD[dt.getDay()]+' '+(dt.getMonth()+1)+'/'+dt.getDate()+'</td><td>'+s.meal+'</td><td>'+(o ? esc(byId(o.id).name) : '')+'</td></tr>'; });
  h += '</table>';
  const ex = D().plan.extras.map(byId).filter(Boolean);
  if (ex.length) h += '<p>顺便做：'+ex.map(x => esc(x.name)).join('，')+'</p>';
  h += '<h2>买菜</h2><div class="pcols">';
  SHOP.forEach(g => { const xs = d.items.filter(x => x.group === g && !have[x.key]); if (xs.length) h += '<div><b>'+g+'</b>'+xs.map(x => '<p>□ '+esc(x.name)+' '+amount(x.qty, x.unit)+'</p>').join('')+'</div>'; });
  const pn = Object.keys(d.pantry); if (pn.length) h += '<div><b>调料，看看够不够</b><p>'+pn.map(esc).join('、')+'</p></div>';
  $('printout').innerHTML = h + '</div>';
}

// ---------- 旧版分享链接（#share=）：问过再换上，不碰自己的菜谱 ----------
function decodeShare(s){
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s), arr = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(arr));
}
function importLegacyShare(){
  if (!location.hash.startsWith('#share=')) return;
  const raw = location.hash.slice(7);
  history.replaceState(null, '', location.pathname + location.search);
  let sh;
  try { sh = decodeShare(raw); if (!Array.isArray(sh.recipes) || !Array.isArray(sh.plan)) throw 0; }
  catch(e){ notice = '这个分享链接打不开，下面是这台设备上的菜单。'; return; }
  const theirs = sh.recipes.filter(validRecipe), mine = D().recipes.items, add = {}, idMap = {};
  theirs.forEach(r => {
    const same = mine[r.id] && mine[r.id].name === r.name ? mine[r.id] : Object.values(mine).find(m => m.name === r.name);
    if (same) idMap[r.id] = same.id; else { add[r.id] = cleanRecipe(r); idMap[r.id] = r.id; }
  });
  const slotsMap = {};
  sh.plan.forEach(p => { if (p && typeof p.date === 'string' && idMap[p.id]) slotsMap[p.date+'|'+(/午/.test(p.meal) ? '午饭' : '晚饭')] = {id: idMap[p.id], locked: false}; });
  const dates = [...new Set(sh.plan.map(p => p && p.date).filter(Boolean))].sort();
  if (!dates.length){ notice = '这个分享链接里没有菜单。'; return; }
  const n = Object.keys(add).length;
  if (!confirm('打开的是家里人分享的菜单（'+md(fromIso(dates[0]))+'起 '+dates.length+' 天）。\n用它换掉这台设备上这周的菜单吗？'+(n ? '\n菜谱里没有的 '+n+' 道菜会加进来，' : '\n')+'你自己的菜谱不会少。')) return;
  const ss = sh.settings || {};
  const before = {settings: clone(D().settings), plan: clone(D().plan), recipes: Object.fromEntries(Object.keys(add).map(id => [id, null])), haveAll: clone(D().have.items)};
  store.apply({recipes: add, settings: {start: dates[0], days: [3, 5, 7].includes(dates.length) ? dates.length : 7, mode: sh.plan.some(p => p && /午/.test(p.meal)) ? 'both' : 'dinner', ...(ss.people ? {people: ss.people} : {})},
    plan: {slots: slotsMap, extras: (sh.extras || []).map(x => idMap[x]).filter(Boolean)}, haveAll: {}});
  undoable('换上了分享的菜单', before);
}

// ---------- 设置 ----------
function syncSheet(){
  const s = D().settings;
  $('sStart').value = s.start; $('sPeople').textContent = s.people+' 人';
  document.querySelectorAll('#setSheet .seg').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(String(s[g.dataset.key]) === b.dataset.v))));
  document.querySelectorAll('#setSheet .switch').forEach(b => b.setAttribute('aria-checked', String(!!s[b.dataset.key])));
}

// ---------- 页面 ----------
let toastTimer;
function toast(msg, undo){
  const t = $('toast'), b = t.querySelector('button');
  t.querySelector('span').textContent = msg;
  b.hidden = !undo; b.textContent = '撤销'; b.onclick = undo ? () => { t.classList.remove('show', 'act'); undo(); } : null;
  t.classList.add('show'); t.classList.toggle('act', !!undo);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show', 'act'), undo ? 6000 : 2400);
}
function showTab(name, focus){
  tab = name; document.body.dataset.tab = name;
  ['menu','shop','book'].forEach(n => { const t = $('t-'+n); t.setAttribute('aria-selected', String(n === name)); t.tabIndex = n === name ? 0 : -1; $('p-'+n).hidden = n !== name; });
  scrollTo(0, 0);
  if (focus) $('t-'+name).focus();
}
function render(){
  const f = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null;
  const all = slots();
  if (!sel || !all.some(s => s.key === sel)){ const today = iso(new Date()); sel = (all.find(s => s.date === today && s.meal === '晚饭') || all[0]).key; }
  renderBoard(); renderMenu(); renderShop(); renderBook(); syncSheet();
  if (f){ const el = document.querySelector('[data-f="'+CSS.escape(f)+'"]'); if (el) el.focus({preventScroll: true}); }
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'sel'){ sel = b.dataset.key; render(); }
  else if (a === 'draw') draw(false);
  else if (a === 'fill') draw(true);
  else if (a === 'one') reroll(sel);
  else if (a === 'lock') toggleLock(sel);
  else if (a === 'set') setDish(sel, b.dataset.id);
  else if (a === 'copyWeek') copy(weekLines().join('\n'), '这周的菜复制好了');
  else if (a === 'copyShop'){ if (!shopData().items.some(x => !D().have.items[x.key])) toast('都勾掉了，没有要买的'); else copy(shopLines().join('\n'), '清单复制好了'); }
  else if (a === 'print'){ buildPrintout(); print(); }
  else if (a === 'addRec') openEditor(null);
  else if (a === 'editRec') openEditor(b.dataset.id);
  else if (a === 'delRec') deleteRecipe(b.dataset.id);
  else if (a === 'resetRec') resetRecipes();
});
document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.act === 'have' && e.target.dataset.k; if (k) store.apply({have: {[k]: e.target.checked}}); });
addEventListener('beforeprint', buildPrintout);

const tabsEl = document.querySelector('[role=tablist]');
tabsEl.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) showTab(b.dataset.tab); });
tabsEl.addEventListener('keydown', e => {
  const order = ['menu','shop','book'], i = order.indexOf(tab);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){ e.preventDefault(); showTab(order[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3], true); }
});

$('openSet').addEventListener('click', () => { syncSheet(); $('setSheet').showModal(); });
$('closeSet').addEventListener('click', () => $('setSheet').close());
for (const d of [$('setSheet'), $('recSheet')]) d.addEventListener('click', e => { if (e.target === d) d.close(); });
document.querySelectorAll('#setSheet .seg').forEach(g => g.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const k = g.dataset.key, v = k === 'days' ? Number(b.dataset.v) : b.dataset.v;
  if (D().settings[k] !== v) changeLayout({[k]: v});
}));
document.querySelectorAll('#setSheet .switch').forEach(b => b.addEventListener('click', () => store.apply({settings: {[b.dataset.key]: !D().settings[b.dataset.key]}})));
document.querySelector('#setSheet .step').addEventListener('click', e => { const b = e.target.closest('button'); if (b) store.apply({settings: {people: D().settings.people + Number(b.dataset.d)}}); });
$('sStart').addEventListener('change', e => { if (e.target.value && e.target.value !== D().settings.start) changeLayout({start: e.target.value}); });
$('rSpicy').addEventListener('click', e => e.currentTarget.setAttribute('aria-checked', String(e.currentTarget.getAttribute('aria-checked') !== 'true')));
$('recForm').addEventListener('submit', saveEditor);
$('rCancel').addEventListener('click', () => $('recSheet').close());

store = createLocalStore({defaults: DEFAULTS, onChange: render});
if (!store.canSave) notice = '这个浏览器不能保存，关掉页面后排好的菜会丢。';
importLegacyShare();
render();

// 测试和调试用
window.__menu = {store: () => store, normalize: raw => normalize(raw, DEFAULTS), parseIngredients};
