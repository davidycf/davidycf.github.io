(function(){
// Data lives in data/*.json: days, cards, books, base, info. See AGENTS.md for the shapes.
// Dates own fixed facts (hotel, intercity moves, dated dinners, luggage); cards own reusable
// activities. A "slot" day shows whichever card the plan puts on it; everything shown for
// that day (title, route, eat/shop/see, nearby, prep to-dos, "on days" chips) comes from view(d).
let D, CARDS = {}, TAGS = {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad = n => String(n).padStart(2,'0');
const CITY = {dep:['出发','Departure'], tokyo:['東京','Tokyo'], hakone:['箱根','Hakone'], osaka:['大阪','Osaka'], ret:['返程','Return'], misc:['索引与心得','Index & tips']};
const STAY = {dep:'机上', tokyo:'MONday 上野新御徒町 · 5 晚', hakone:'箱根吟游 · 月・和室 · 2 晚 · 申请中', osaka:'MONday apart 心斋桥 · 5 晚', ret:'羽田附近 1 晚 · 待定'};
const BOOK = {eat:['吃','食'], shop:['买','买'], see:['玩','观']};
const KIND = {eat:['食','吃饭'], snack:['甜','小吃甜点'], shop:['买','买'], see:['观','看 · 逛'], kids:['遊','孩子放电'], night:['夜','九点以后']};
const CKIND = {kids:'亲子', street:'街区', shop:'购物', landmark:'地标', rest:'留白'};
const SIZE = {half:'半日', full:'整日'};
const LOAD = {near:'近场', mid:'中等路程', far:'远：单程约一小时'};
const WHO = {dad:'爸爸单独'};
const DOW = ['周日','周一','周二','周三','周四','周五','周六'];
const AT = {am:0, noon:1, pm:2, eve:3};
const JA_RX = /[぀-ヿ]/;
// wrap text: escape, link 附录 X, mark search hits
function fmt(t, q){
  let h = esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/附录\s?([A-E])(?:[、，‑-]\s?([A-E]))?/g, (m,a,b) =>
    '<a class="ax" href="#info-'+a+'">附录 '+a+'</a>' + (b ? '、<a class="ax" href="#info-'+b+'">'+b+'</a>' : ''));
  if (q) h = hl(h, q);
  return h;
}
function hl(html, q){
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
  return html.replace(/(^|>)([^<]*)/g, (m, a, txt) => a + txt.replace(rx, x => '<mark>'+x+'</mark>'));
}
const langAttr = t => JA_RX.test(t) ? ' lang="ja"' : '';
const extLinks = ls => ls.map(l => '<a href="'+esc(l.url)+'" target="_blank" rel="noopener"'+langAttr(l.label)+'>'+esc(l.label)+' <span class="ar">↗</span></a>').join('');
const linkRow = e => '<div class="lk">'+(e.map ? '<a class="map" href="'+esc(e.map)+'" target="_blank" rel="noopener">地图 <span class="ar">↗</span></a>' : '') + extLinks(e.links)+'</div>';
const kd = k => '<i class="kd k-'+k+'" title="'+KIND[k][1]+'">'+KIND[k][0]+'</i>';
const txt = x => typeof x === 'string' ? x : x.text;

/* ----- dates ----- */
function jstToday(){ const d = new Date(Date.now() + 9*3600e3); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
const START = Date.UTC(2027,2,13), END = Date.UTC(2027,2,27);
const T = jstToday();
const todayN = (T >= START && T <= END) ? Math.round((T-START)/864e5)+1 : null;
(function status(){
  const el = $('#status');
  if (todayN) el.innerHTML = '日本今天是 <b>DAY '+pad(todayN)+'</b><a href="#d'+todayN+'">打开今天 →</a>';
  else if (T < START) el.innerHTML = '距出发还有 <b>'+Math.round((START-T)/864e5)+'</b> 天 · 内容核对于 2026/10/4';
  else el.innerHTML = '旅程已结束 · 欢迎回家';
})();
// weekday from the real date, so a card's closures follow it to whichever day it lands on
const dowOf = d => { const [m, dd] = d.date.split('/').map(Number); return new Date(2027, m-1, dd).getDay(); };

/* ----- plan: recommended default (data) + this device's choices (localStorage) ----- */
// plan.days {dayId: cardId}: days the user explicitly set. Absent = recommended card.
// plan.opts {cardId: {optId: bool}}: branch choices travel with the card, so switching back restores them.
// plan.visited {tag: dayId}: "already been" marks (e.g. 浅草核心), separate from bookings and to-dos.
const PLAN_KEY = 'jp27-plan', PLAN_V = 1;
let plan = {v:PLAN_V, days:{}, opts:{}, visited:{}};
let canSave = true, planNotes = [];
function loadPlan(){
  let raw = null;
  try { raw = localStorage.getItem(PLAN_KEY); localStorage.setItem('jp27-probe','1'); localStorage.removeItem('jp27-probe'); }
  catch(e){ canSave = false; }
  if (!raw) return;
  let p;
  try { p = JSON.parse(raw); } catch(e){ planNotes.push('这台设备上保存的方案读不出来，先按推荐方案显示。'); return; }
  if (!p || p.v !== PLAN_V){ planNotes.push('这台设备上的方案来自不支持的格式版本，先按推荐方案显示；原记录没有删除。'); return; }
  const alias = id => CARDS[id] ? id : (D.cards.aliases[id] && CARDS[D.cards.aliases[id]] ? D.cards.aliases[id] : null);
  let dropped = [];
  Object.entries(p.days || {}).forEach(([dayId, cid]) => {
    const d = D.days.find(x => x.id === dayId), id = alias(cid);
    if (d && d.slot && id && CARDS[id].city === d.city) plan.days[dayId] = id;
    else dropped.push((d ? d.date : dayId)+' → '+cid);
  });
  Object.entries(p.opts || {}).forEach(([cid, o]) => { const id = alias(cid); if (!id || !o) return;
    Object.entries(o).forEach(([oid, v]) => { if (CARDS[id].opts.some(x => x.id === oid)) (plan.opts[id] ||= {})[oid] = !!v; }); });
  let badVisit = 0;
  Object.entries(p.visited || {}).forEach(([t, dayId]) => { const d = dayById(dayId);
    if (TAGS[t] && d && d.slot) plan.visited[t] = dayId; else badVisit++; });
  if (badVisit) planNotes.push('有 '+badVisit+' 条“已逛过”记录指向不存在的日期或标签，已忽略。');
  if (dropped.length) planNotes.push('有 '+dropped.length+' 项本地选择指向已删除或不适用的活动（'+dropped.join('，')+'），这几天按推荐方案显示。');
}
function savePlan(){
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); canSave = true; }
  catch(e){ canSave = false; }
}
const slotDays = () => D.days.filter(d => d.slot);
const dayById = id => D.days.find(d => d.id === id);
const restCard = city => D.cards.cards.find(c => c.multi && c.city === city);
const cardOf = d => CARDS[plan.days[d.id] || d.slot.card];
const isMine = d => !!plan.days[d.id];
const planEdited = () => Object.keys(plan.days).length || Object.keys(plan.opts).length;
function optOn(c, o){ const u = plan.opts[c.id] && plan.opts[c.id][o.id]; return u !== undefined ? u : !!o.on; }
const optClosed = (o, d) => d && o.closed && o.closed.dow.includes(dowOf(d));
// Selected branch ids for a card. On a given day, a branch closed that weekday is dropped
// (and reported by dayWarnings); a pick-one group with nothing usable falls back to its default.
function selOpts(c, d){
  const sel = c.opts.filter(o => optOn(c, o) && !optClosed(o, d)).map(o => o.id);
  [...new Set(c.opts.filter(o => o.group).map(o => o.group))].forEach(g => {
    const grp = c.opts.filter(o => o.group === g);
    if (!grp.some(o => sel.includes(o.id))){ const def = grp.find(o => o.on && !optClosed(o, d)) || grp.find(o => !optClosed(o, d)); if (def) sel.push(def.id); }
  });
  return sel;
}
const shows = (x, sel) => (!x.opt || sel.includes(x.opt)) && (!x.unless || !sel.includes(x.unless));
// A date with its own dinner (fixed eat/plan item marked dinner) replaces the card's dinner
// suggestions (dinner:true); items marked withFixedDinner only show on such dates.
const hasFixedDinner = d => !!d.slot && [...d.fixed.plan, ...(d.fixed.eat || [])].some(x => x.dinner);
// One card item as it reads on day d: null when it doesn't apply, or the alt text when it is
// closed that weekday (e.g. 2k540 on Wednesdays). Without a day (card page) everything shows.
function itemOn(x, sel, d, adj){
  if (!shows(x, sel)) return null;
  if (!d) return x;
  const fd = hasFixedDinner(d);
  if (x.withFixedDinner && !fd) return null;
  if (x.dinner && fd){ adj.dinner = true; return null; }
  if (x.closed && x.closed.dow.includes(dowOf(d))){ adj.closed.add(x.closed.text); return x.alt ? {...x, text:x.alt} : null; }
  return x;
}
const refOn = (r, sel) => { const [ref, o] = r.split('@'); return (!o || sel.includes(o)) ? ref : null; };
function coversOf(c, sel){ return [...c.covers, ...c.opts.filter(o => sel.includes(o.id)).flatMap(o => o.covers || [])]; }
const dayCovers = d => d.slot ? coversOf(cardOf(d), selOpts(cardOf(d), d)) : (d.covers || []);
const dayName = d => d.slot ? cardOf(d).name : d.ja;
const placedOn = cid => slotDays().filter(d => cardOf(d).id === cid);
const activeRef = (cid, opt) => placedOn(cid).some(d => !opt || selOpts(CARDS[cid], d).includes(opt));
const todoActive = t => !t.card || activeRef(t.card, t.opt);

// Everything a day page / list shows. Fixed (date-owned) items are merged into the card's
// segments by time of day; nothing about the card is stored on the date.
function view(d){
  if (!d.slot) return {ja:d.ja, ro:d.ro, area:d.area, title:d.title, sub:d.sub, plan:d.plan, eat:d.eat, shop:d.shop, see:d.see,
    stay:d.stay, note:d.note, rel:d.rel, judge:d.judge, short:[]};
  const c = cardOf(d), sel = selOpts(c, d), fx = d.fixed, adj = {dinner:false, closed:new Set()};
  const on = k => c[k].map(x => itemOn(x, sel, d, adj)).filter(Boolean);
  const steps = [...on('route'), ...fx.plan.map(x => ({...x, fixed:true}))]
    .map((x, i) => [x, i]).sort((a, b) => AT[a[0].at]-AT[b[0].at] || a[1]-b[1]).map(a => a[0]);
  const pick = k => [...on(k), ...(fx[k] || []).map(x => ({...x, fixed:true}))];
  const rel = [...new Set([...d.rel, ...c.rel.map(r => refOn(r, sel)).filter(Boolean)])];
  return {card:c, sel, ja:c.ja, ro:c.ro, area:c.area, title:c.title, sub:c.summary, ctx:d.ctx, plan:steps,
    eat:pick('eat'), shop:pick('shop'), see:pick('see'), stay:d.stay, note:d.note, cnote:c.note, rel, short:fx.short || [], adj};
}

/* ----- checks: hard block / needs verifying / preference ----- */
function check(c, d, opts){
  const r = {block:null, verify:[], pref:[]};
  if (!d.slot) r.block = d.date+' 是移动或固定行程日，不放活动卡';
  else if (c.city !== d.city) r.block = '这张卡在'+CITY[c.city][0]+'，'+d.date+' 住'+CITY[d.city][0];
  else if (c.closed && c.closed.dow.includes(dowOf(d))) r.block = d.date+' 是'+DOW[dowOf(d)]+'：'+c.closed.text;
  if (r.block) return r;
  if (c.calendar) r.verify.push(c.calendar);
  if (c.booked && c.booked.day !== d.id) r.verify.push('已订的票是 '+dayById(c.booked.day).date+'，网页改日不会改票，实际改期要本人处理');
  if (c.load === 'far') r.pref.push('路程远：'+c.transit);
  if (c.late && d.fixed.plan.some(x => x.at === 'eve')) r.pref.push('回酒店偏晚，'+d.date+' 晚上有固定安排（'+(d.fixed.short || []).join('、')+'）');
  // overlap with what other days already cover (excluding the days this move would vacate)
  const sel = selOpts(c, d), skip = new Set([d.id, ...(opts && opts.vacate || [])]);
  coversOf(c, sel).forEach(t => {
    const others = D.days.filter(x => !skip.has(x.id) && dayCovers(x).includes(t));
    if (others.length) r.pref.push('「'+TAGS[t].label+'」'+others.map(x => x.date+'（'+dayName(x)+'）').join('、')+' 也有');
    else if (plan.visited[t]) r.pref.push('「'+TAGS[t].label+'」已标记逛过');
  });
  return r;
}
// Warnings shown on a scheduled day.
function dayWarnings(d){
  const c = cardOf(d), out = [];
  const ck = check(c, d);
  if (ck.block) out.push({k:'block', t:ck.block});
  ck.verify.forEach(t => out.push({k:'verify', t}));
  if (c.load === 'far') out.push({k:'pref', t:'路程远：'+c.transit});
  if (c.late && d.fixed.plan.some(x => x.at === 'eve')) out.push({k:'pref', t:'这张卡回酒店偏晚，晚上的固定安排可能要往后推。'});
  const adj = view(d).adj;
  if (adj.dinner){ const fd = [...d.fixed.plan, ...(d.fixed.eat || [])].find(x => x.dinner);
    out.push({k:'pref', t:'这天的晚饭已经定了（'+(fd.label || fd.text)+'），卡片里的晚饭建议不显示。'}); }
  adj.closed.forEach(t => out.push({k:'pref', t:DOW[dowOf(d)]+'：'+t+'，路线里跳过这一段。'}));
  c.opts.filter(o => optOn(c, o) && optClosed(o, d)).forEach(o =>
    out.push({k:'pref', t:'「'+o.label+'」在'+DOW[dowOf(d)]+'不可行（'+o.closed.text+'），这天按默认显示；换到别的日子会恢复。'}));
  const sel = selOpts(c, d);
  dayCovers(d).forEach(t => {
    const others = D.days.filter(x => x !== d && dayCovers(x).includes(t));
    const fromOpt = c.opts.find(o => sel.includes(o.id) && (o.covers || []).includes(t) && !o.group);
    others.filter(x => plan.visited[t] !== x.id).forEach(x => out.push({k:'pref', t:'「'+TAGS[t].label+'」'+x.date+'（'+dayName(x)+'）也安排了'+(x.n < d.n ? '' : '，那天会再去一次'), tag:t, opt:fromOpt && x.n < d.n ? fromOpt.id : null}));
    if (TAGS[t].visit && plan.visited[t] && plan.visited[t] !== d.id){
      const vd = dayById(plan.visited[t]);
      out.push({k:'pref', t:'「'+TAGS[t].label+'」已标记逛过（'+(vd ? vd.date : '')+'）；想重访就保留，不想就取消这一项。', opt:fromOpt ? fromOpt.id : null});
    }
  });
  return out;
}
const WK = {block:'不可行', verify:'待核对', pref:'提示'};
const warnHTML = (ws, d) => ws.length ? '<ul class="warns">'+ws.map(w => '<li class="w-'+w.k+'"><b>'+WK[w.k]+'</b><span>'+esc(w.t)
  + (w.opt && d ? ' <button type="button" class="btn sm" data-act="opt" data-card="'+cardOf(d).id+'" data-opt="'+w.opt+'" data-on="0">取消这一项</button>' : '')
  + '</span></li>').join('')+'</ul>' : '';
const checkLine = r => r.block ? '<p class="ck w-block"><b>不可行</b>'+esc(r.block)+'</p>'
  : (r.verify.length || r.pref.length) ? '<ul class="warns">'+r.verify.map(t => '<li class="w-verify"><b>待核对</b><span>'+esc(t)+'</span></li>').join('')
      + r.pref.map(t => '<li class="w-pref"><b>提示</b><span>'+esc(t)+'</span></li>').join('')+'</ul>' : '';

/* ----- changing the plan: one undo step, toast feedback ----- */
let undoSnap = null, toastTimer = null;
function commit(fn, msg){
  undoSnap = JSON.stringify(plan);
  const key = focusKey(document.activeElement);
  fn();
  savePlan();
  route(true);
  restoreFocus(key);
  toast(msg + (canSave ? '' : '（这台设备的浏览器不能保存，刷新后会丢）'), true);
}
// Re-rendering replaces the DOM, so remember the focused control by its stable data-* ids
// and put focus back on the same control (e.g. the next radio after ArrowDown).
const FOCUS_ATTRS = ['act','card','opt','tag','day','checkKey'];
function focusKey(el){
  if (!el || !el.dataset || !el.dataset.act) return null;
  return '[data-'+'act="'+CSS.escape(el.dataset.act)+'"]' + FOCUS_ATTRS.slice(1).filter(a => el.dataset[a] != null)
    .map(a => '[data-'+a.replace(/[A-Z]/g, m => '-'+m.toLowerCase())+'="'+CSS.escape(el.dataset[a])+'"]').join('');
}
function restoreFocus(key){
  const v = [...document.querySelectorAll('.view')].find(x => !x.hidden);
  const el = (key && v.querySelector(key+':not([disabled])')) || v.querySelector('h2');
  if (!el) return;
  if (el.tagName === 'H2') el.setAttribute('tabindex', '-1');
  el.focus({preventScroll:true});
}
function toast(msg, withUndo){
  const el = $('#toast');
  el.innerHTML = '<span>'+esc(msg)+'</span>'+(withUndo && undoSnap ? '<button type="button" class="btn sm" data-act="undo">撤销</button>' : '');
  el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 8000);
}
function undo(){
  if (!undoSnap) return;
  plan = JSON.parse(undoSnap); undoSnap = null; savePlan(); route(true); restoreFocus(null); toast('已撤销上一步', false);
}
const nm = c => '「'+c.name+'」';
// Choices for putting card cid on day dayId. Returns [] when it can go straight on.
function placeChoices(cid, dayId, fromDay){
  const c = CARDS[cid], d = dayById(dayId), cur = cardOf(d);
  if (cur.id === cid) return null;
  const src = c.multi ? null : placedOn(cid).find(x => x.id !== dayId);
  const ch = [];
  if (src){
    const back = check(cur, src, {vacate:[dayId]});
    ch.push({op:'swap', src:src.id, label:'交换：'+d.date+' 换成'+nm(c)+'，'+src.date+' 换成'+nm(cur), dis:back.block});
    ch.push({op:'move', src:src.id, label:'移过来：'+src.date+' 改成'+nm(restCard(c.city))});
  } else if (!fromDay && !cur.multi){
    ch.push({op:'set', label:'替换：'+d.date+' 的'+nm(cur)+'回到未安排'});
  }
  return ch;
}
function doPlace(op, cid, dayId, srcId){
  const c = CARDS[cid], d = dayById(dayId), cur = cardOf(d);
  // after a swap from the day page, close the picker: drop "-swap" without a hashchange
  if (/-swap$/.test(location.hash)) history.replaceState(null, '', location.hash.replace(/-swap$/, ''));
  commit(() => {
    if (op === 'swap'){ plan.days[srcId] = cur.id; }
    if (op === 'move'){ plan.days[srcId] = restCard(c.city).id; }
    plan.days[dayId] = cid;
  }, d.date+' 改成'+nm(c) + (op === 'swap' ? '，'+dayById(srcId).date+' 改成'+nm(cur) : op === 'move' ? '，'+dayById(srcId).date+' 改成留白' : ''));
}
function confirmHTML(cid, dayId, ch){
  return '<div class="cf" role="group" aria-label="确认怎么安排">'+ch.map(x => '<button type="button" class="btn" data-act="do" data-op="'+x.op+'" data-card="'+cid+'" data-day="'+dayId+'"'+(x.src ? ' data-src="'+x.src+'"' : '')+(x.dis ? ' disabled' : '')+'>'+esc(x.label)+'</button>'
    + (x.dis ? '<p class="small">'+esc(x.dis)+'</p>' : '')).join('')+'<button type="button" class="btn ghost" data-act="cancel">取消，保持原方案</button></div>';
}

/* ----- shared bits ----- */
function dayChips(ns){
  return '<div class="dchips">'+ns.map(n => { const d = D.days[n-1], v = view(d);
    return '<a class="c-'+d.city+'" href="#d'+n+'"><b>DAY '+pad(n)+'</b><span lang="ja">'+esc(v.ja)+'</span><small>'+d.date+' '+esc(d.dow)+'</small></a>'; }).join('')+'</div>';
}
const segNav = on => '<nav class="pseg" aria-label="行程入口"><a href="#trip"'+(on==='trip'?' aria-current="page" class="on"':'')+'>我的行程</a><a href="#cards"'+(on==='cards'?' aria-current="page" class="on"':'')+'>活动卡片</a></nav>';
function planBanner(){
  let h = '';
  planNotes.forEach(t => { h += '<p class="pnote">'+esc(t)+'</p>'; });
  if (!canSave) h += '<p class="pnote">这台设备的浏览器不能保存选择（可能是隐私模式或存储被关）。照常能看推荐方案，换的活动刷新后会丢。</p>';
  return h;
}
function checkbox(id, key, text){
  return '<li><label><input type="checkbox" id="'+esc(id)+'" data-check-key="'+esc(key)+'"'+(done[key]?' checked':'')+'><span>'+fmt(text)+'</span></label></li>';
}
const allChecks = () => D.apx.flatMap(a => a.parts.flatMap(p => p.checklist || []));
function prepList(c, sel){
  const ts = c.todos.map(r => r.split('@')).filter(([, o]) => !sel || !o || sel.includes(o)).map(([id]) => D.todo.find(t => t.id === id)).filter(Boolean);
  const cs = (c.checks || []).map(id => allChecks().find(x => x.id === id)).filter(Boolean);
  if (!ts.length && !cs.length) return '';
  return '<ul class="todo">'+ts.map(t => checkbox('p-todo-'+t.id, 'todo:'+t.id, t.text)).join('')+cs.map(x => checkbox('p-'+x.id, x.id, x.text)).join('')+'</ul>';
}

/* ----- itinerary ----- */
function renderTrip(){
  const groups = [];
  D.days.forEach(d => { const g = groups[groups.length-1]; if (g && g.city === d.city) g.days.push(d); else groups.push({city:d.city, days:[d]}); });
  let h = '<div class="vhead"><h2>行程 · 15 站</h2><p>每天一个主项目。东京四天可以“换活动”，移动日和日期固定的事不跟着变。</p></div>' + segNav('trip') + planBanner();
  if (planEdited()) h += '<div class="pbar"><span>东京几天里有你自己的选择（只存在这台设备）。</span><button type="button" class="btn sm" data-act="reset">恢复推荐方案</button></div>';
  groups.forEach(g => {
    h += '<div class="c-'+g.city+'"><div class="city-h"><span class="nm" lang="ja">'+CITY[g.city][0]+'</span><span class="ro">'+CITY[g.city][1]+'</span><span class="cstay">'+esc(STAY[g.city])+'</span></div><ol class="line">';
    g.days.forEach((d,i) => {
      const v = view(d);
      const cls = ['stop', i===0?'first':'', i===g.days.length-1?'last':'', d.n===todayN?'today':''].join(' ');
      h += '<li class="'+cls+'"><a href="#d'+d.n+'"><span class="dn">DAY<b>'+pad(d.n)+'</b></span>'
        + '<span class="t1"><span class="sn" lang="ja">'+esc(v.ja)+'</span><span class="dt">'+d.date+' <span class="zh">'+esc(d.dow)+'</span></span>'
        + (d.n===todayN?'<span class="tag-today">TODAY</span>':'')+'</span>'
        + '<span class="t2">'+esc(v.title)+'</span></a>';
      if (d.slot){
        const ws = dayWarnings(d), pend = !isMine(d) && d.slot.pending;
        h += '<div class="sx"><span class="bdg'+(isMine(d)?' mine':'')+'">'+(isMine(d)?'我的选择':'推荐')+'</span>'
          + (pend ? '<span class="bdg pend">'+esc(d.slot.pending)+'</span>' : '')
          + v.short.map(s => '<span class="fx">固定 · '+esc(s)+'</span>').join('')
          + (ws.length ? '<span class="fx">'+ws.length+' 条提示</span>' : '')
          + '<a class="btn sm" href="#d'+d.n+'-swap">换活动</a></div>';
      }
      h += '</li>';
    });
    h += '</ol></div>';
  });
  $('#v-trip').innerHTML = h;
}

/* ----- day ----- */
function relCard(r){
  const [b,c] = r.split(':');
  if (b === 'base'){
    const s = D.base.find(x => x.code === c);
    return '<a class="c-'+s.city+'" href="#base-'+s.code+'"><span class="bk" lang="ja">宿</span><span class="tx"><b lang="ja">宿 · '+esc(s.sign)+'</b><span>酒店步行圈里的吃买玩</span></span><span class="n">'+s.entries.length+' 处 →</span></a>';
  }
  const s = D.books[b].sections.find(x => x.code === c);
  if (!s) return '';
  return '<a class="c-'+s.city+'" href="#'+b+'-'+s.code+'"><span class="bk" lang="ja">'+BOOK[b][1]+'</span><span class="tx"><b'+langAttr(s.area)+'>'+BOOK[b][0]+' · '+esc(s.area)+'</b><span>'+esc(s.head)+'</span></span><span class="n">'+s.entries.length+' 项 →</span></a>';
}
const tagFor = x => (x.fixed ? '<span class="fxt">固定</span>' : '') + (x.who ? '<span class="fxt who">'+WHO[x.who]+'</span>' : '');
function cardMeta(c){
  return '<span>'+SIZE[c.size]+'</span><span>'+LOAD[c.load]+'</span>'+(/须|网购|网票/.test(c.booking) ? '<span>要订票</span>' : '')+(c.closed ? '<span>'+esc(c.closed.text)+'</span>' : '');
}
function pickItem(c, d){
  const r = check(c, d, {vacate: c.multi ? [] : placedOn(c.id).map(x => x.id)}), at = placedOn(c.id).filter(x => x.id !== d.id);
  return '<li class="pick c-'+c.city+'"><div class="ph"><a href="#card-'+c.id+'"'+langAttr(c.name)+'>'+esc(c.name)+'</a><span class="meta">'+cardMeta(c)+'</span></div>'
    + '<p>'+esc(c.summary)+'</p>'
    + (at.length && !c.multi ? '<p class="small">现在安排在 '+at.map(x => x.date).join('、')+'</p>' : '')
    + checkLine(r)
    + '<div class="pa"><button type="button" class="btn" data-act="pick" data-card="'+c.id+'" data-day="'+d.id+'"'+(r.block?' disabled':'')+'>换成这个</button></div></li>';
}
function swapPanel(d, open){
  const cur = cardOf(d), city = D.cards.cards.filter(c => c.city === d.city && c.id !== cur.id);
  const rec = d.slot.suggest.map(id => CARDS[id]).filter(c => c && c.id !== cur.id);
  const more = city.filter(c => !rec.includes(c));
  return '<div class="swap" id="swap"'+(open?'':' hidden')+'><div class="lbl">换活动 <span class="en">SWAP</span></div>'
    + '<p class="small">只改 '+d.date+' 这一天；日期固定的事不动。先看推荐，再看更多。</p>'
    + '<ul class="picks">'+rec.map(c => pickItem(c, d)).join('')+'</ul>'
    + (more.length ? '<details class="more"><summary>更多活动（'+more.length+'）</summary><ul class="picks">'+more.map(c => pickItem(c, d)).join('')+'</ul></details>' : '')
    + '</div>';
}
function optsPanel(c, d, sel){
  if (!c.opts.length) return '';
  const groups = {};
  c.opts.forEach(o => { (groups[o.group || ''] ||= []).push(o); });
  let h = '<div class="blk"><div class="lbl">支线 <span class="en">OPTIONS</span></div><div class="opts">';
  Object.entries(groups).forEach(([g, os]) => {
    os.forEach(o => {
      const closed = optClosed(o, d), on = sel.includes(o.id);
      h += '<label class="opt'+(closed?' off':'')+'"><input type="'+(g?'radio':'checkbox')+'"'+(g?' name="g-'+c.id+'-'+g+'"':'')+' data-act="opt" data-card="'+c.id+'" data-opt="'+o.id+'"'+(on?' checked':'')+(closed?' disabled':'')+'>'
        + '<span>'+esc(o.label)+(o.who ? ' <span class="fxt who">'+WHO[o.who]+'</span>' : '')+(closed ? '<small>'+DOW[dowOf(d)]+'不可行：'+esc(o.closed.text)+'</small>' : '')+'</span></label>';
    });
    if (g) h += '<p class="small">上面几项互相替换，一次只选一个。</p>';
  });
  h += '</div>';
  const vis = c.opts.filter(o => sel.includes(o.id)).flatMap(o => o.covers || []).filter(t => TAGS[t].visit);
  vis.forEach(t => {
    const mine = plan.visited[t] === d.id;
    h += '<label class="opt visit"><input type="checkbox" data-act="visit" data-tag="'+t+'" data-day="'+d.id+'"'+(mine?' checked':'')+(plan.visited[t] && !mine?' disabled':'')+'><span>已逛过：'+esc(TAGS[t].label)+'<small>'+(plan.visited[t] && !mine ? '已在 '+((dayById(plan.visited[t]) || {}).date || '别的日子')+' 标记' : '只是记录，不影响预约和待办')+'</small></span></label>';
  });
  return h+'</div>';
}
function renderDay(n, opts){
  const d = D.days[n-1], prev = D.days[n-2], next = D.days[n], v = view(d), pv = prev && view(prev), nv = next && view(next);
  const li = a => a.map(x => '<li>'+fmt(txt(x))+tagFor(x)+'</li>').join('');
  let h = '<div class="c-'+d.city+'"><a class="back" href="#trip">← 全部行程</a>'
    + '<div class="sign"><div class="top"><div class="big" lang="ja">'+esc(v.ja)+'</div><div class="rom">'+esc(v.ro)+'</div></div>'
    + '<div class="band">'
    + (prev ? '<a href="#d'+prev.n+'" aria-label="前一天"><small>◀ '+pad(prev.n)+'</small><b lang="ja">'+esc(pv.ja)+'</b></a>' : '<span class="nil"></span>')
    + '<span class="mid">DAY '+pad(d.n)+'</span>'
    + (next ? '<a href="#d'+next.n+'" aria-label="后一天"><b lang="ja">'+esc(nv.ja)+'</b><small>'+pad(next.n)+' ▶</small></a>' : '<span class="nil"></span>')
    + '</div><div class="under"><span>2027 · '+d.date+' <span class="zh">'+esc(d.dow)+'</span></span><span class="zh"'+langAttr(v.area)+'>'+esc(v.area)+'</span></div></div>'
    + '<div class="dtitle"><h2>'+esc(v.title)+'</h2><p>'+fmt(v.sub)+'</p>'+(v.ctx ? '<p class="ctx">'+fmt(v.ctx)+'</p>' : '')+(v.judge?'<span class="judge">'+esc(v.judge)+'</span>':'');
  if (d.slot){
    const c = v.card;
    h += '<div class="sx"><span class="bdg'+(isMine(d)?' mine':'')+'">'+(isMine(d)?'我的选择':'推荐方案')+'</span>'
      + (!isMine(d) && d.slot.pending ? '<span class="bdg pend">'+esc(d.slot.pending)+'</span>' : '')
      + '<a class="btn sm ghost" href="#card-'+c.id+'">卡片详情</a>'
      + '<button type="button" class="btn sm" data-act="toggle-swap" aria-expanded="'+(opts && opts.swap ? 'true' : 'false')+'" aria-controls="swap">换活动</button></div>'
      + '</div>' + swapPanel(d, opts && opts.swap) + warnHTML(dayWarnings(d), d) + optsPanel(c, d, v.sel);
  } else h += '</div>';
  h += '<div class="blk"><div class="lbl">今日路线 <span class="en">ROUTE</span></div><ol class="steps">'+li(v.plan)+'</ol></div>'
    + '<div class="blk"><div class="lbl">住 · 今晚落点 <span class="en">STAY</span></div><div class="stay">'+v.stay.map((x,i)=>'<p class="'+(i===0?'l0':'')+'">'+fmt(x)+'</p>').join('')+'</div></div>'
    + '<div class="blk"><div class="lbl">吃 · 买 · 看 <span class="en">EAT · SHOP · SEE</span></div><div class="trio">'
    + [['食','eat'],['买','shop'],['观','see']].filter(([,f]) => v[f].length).map(([k,f]) => '<section><span class="mk" lang="ja">'+k+'</span><ul>'+li(v[f])+'</ul></section>').join('')
    + '</div></div>';
  const notes = [v.note, v.cnote].filter(Boolean);
  if (notes.length) h += '<div class="note"><span class="stamp">待确认</span><p>'+notes.map(t => fmt(t)).join(' ')+'</p></div>';
  if (d.slot){
    const prep = prepList(v.card, v.sel);
    if (prep) h += '<div class="blk"><div class="lbl">这张卡的准备 <span class="en">PREP</span></div>'+prep+'<p class="small">和「附录 · 尚待确认」是同一份勾选。</p></div>';
  }
  if (v.rel.length){
    h += '<div class="blk"><div class="lbl">这一带还能… <span class="en">NEARBY</span></div><div class="rel">' + v.rel.map(relCard).join('') + '</div></div>';
  }
  h += '<div class="pager">'
    + (prev ? '<a href="#d'+prev.n+'">← DAY '+pad(prev.n)+'<b>'+esc(pv.title.split('｜')[0])+'</b></a>' : '<span></span>')
    + (next ? '<a class="nx" href="#d'+next.n+'">DAY '+pad(next.n)+' →<b>'+esc(nv.title.split('｜')[0])+'</b></a>' : '<span></span>')
    + '</div></div>';
  $('#v-day').innerHTML = h;
}

/* ----- activity cards: library + one page per card ----- */
const cfilter = {q:'', st:'all', k:'all'};
function cardText(c){ return [c.name, c.ja, c.ro, c.area, c.title, c.summary, c.family, c.booking, ...c.route.map(x => x.text), ...c.opts.map(o => o.label),
  ...['eat','shop','see'].flatMap(k => c[k].map(x => x.text))].join(' ').toLowerCase(); }
function cardItem(c){
  const at = placedOn(c.id);
  return '<li class="ci c-'+c.city+'"><a class="ch" href="#card-'+c.id+'"><span class="msign"><b lang="ja">'+esc(c.ja)+'</b><span>'+esc(c.ro)+'</span></span>'
    + '<span class="tx"><b'+langAttr(c.name)+'>'+esc(c.name)+'</b><span>'+esc(c.summary)+'</span></span></a>'
    + '<div class="meta">'+cardMeta(c)+'<span class="st'+(at.length?' on':'')+'">'+(at.length ? '已安排 · '+at.map(x => x.date).join('、') : '未安排')+'</span></div></li>';
}
function renderCards(){
  const v = $('#v-cards');
  let h = '<div class="vhead"><h2>活动卡片</h2><p>可以安排到东京几天的活动。每张卡是一次出游：推荐顺序、有限的支线、准备事项。点名字看详情，在详情里“安排到哪天”。</p></div>' + segNav('cards') + planBanner()
    + '<div class="tools"><div class="search"><input id="q-cards" type="search" placeholder="搜活动：中文、日文、内容…" aria-label="搜索活动卡片" autocomplete="off" value="'+esc(cfilter.q)+'"><button type="button"'+(cfilter.q?'':' hidden')+'>清除</button></div>'
    + '<div class="bchips" role="group" aria-label="筛选">'
    + [['st','all','全部'],['st','on','已安排'],['st','off','未安排']].concat(Object.entries(CKIND).map(([k,l]) => ['k',k,l]))
        .map(([f,val,l]) => '<button type="button" class="chip'+(cfilter[f]===val?' on':'')+'" data-f="'+f+'" data-v="'+val+'" aria-pressed="'+(cfilter[f]===val)+'">'+l+'</button>').join('')
    + '</div></div><div class="cres"></div>'
    + '<p class="small">箱根和大阪暂时还是固定行程，之后再做成卡片。</p>';
  v.innerHTML = h;
  const inp = v.querySelector('input'), clr = v.querySelector('.search button');
  inp.addEventListener('input', () => { cfilter.q = inp.value.trim(); clr.hidden = !cfilter.q; cardResults(); });
  clr.addEventListener('click', () => { inp.value = ''; cfilter.q = ''; clr.hidden = true; cardResults(); inp.focus(); });
  v.querySelector('.bchips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    cfilter[b.dataset.f] = cfilter[b.dataset.f] === b.dataset.v && b.dataset.f === 'k' ? 'all' : b.dataset.v;
    v.querySelectorAll('.bchips .chip').forEach(x => { const on = cfilter[x.dataset.f] === x.dataset.v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    cardResults();
  });
  cardResults();
}
function cardResults(){
  const q = cfilter.q.toLowerCase();
  const cs = D.cards.cards.filter(c => (!q || cardText(c).includes(q))
    && (cfilter.st === 'all' || (cfilter.st === 'on') === !!placedOn(c.id).length)
    && (cfilter.k === 'all' || c.kinds.includes(cfilter.k)));
  const out = $('#v-cards .cres');
  if (!cs.length){ out.innerHTML = '<p class="empty">没有符合的活动。'+(q ? '换个词，或者清除筛选。' : '')+'</p>'; return; }
  let h = '';
  ['tokyo','hakone','osaka'].forEach(city => {
    const g = cs.filter(c => c.city === city); if (!g.length) return;
    h += '<div class="c-'+city+'"><div class="city-h"><span class="nm" lang="ja">'+CITY[city][0]+'</span><span class="ro">'+CITY[city][1]+'</span><span class="cstay">'+g.length+' 张</span></div><ul class="cards">'+g.map(cardItem).join('')+'</ul></div>';
  });
  out.innerHTML = h;
}
function renderCard(id){
  const c = CARDS[id]; if (!c) return false;
  const at = placedOn(c.id), days = slotDays().filter(d => d.city === c.city);
  const all = c.opts.map(o => o.id);
  const optName = x => x.opt ? c.opts.find(o => o.id === x.opt).label : x.unless ? '不选「'+c.opts.find(o => o.id === x.unless).label+'」时' : '';
  const cond = x => [optName(x) && '支线 · '+optName(x), x.dinner && '当天有固定晚饭时不显示', x.withFixedDinner && '只在当天有固定晚饭时', x.closed && x.closed.text+'时改走：'+(x.alt || '跳过')].filter(Boolean);
  const li = a => a.map(x => '<li>'+fmt(x.text)+cond(x).map(t => '<span class="fxt">'+esc(t)+'</span>').join('')+(x.who ? '<span class="fxt who">'+WHO[x.who]+'</span>' : '')+'</li>').join('');
  const fact = (k, val) => val ? '<div><dt>'+k+'</dt><dd>'+fmt(val)+'</dd></div>' : '';
  let h = '<div class="c-'+c.city+'"><a class="back" href="#cards">← 全部活动卡片</a>'
    + '<div class="sign"><div class="top"><div class="big" lang="ja">'+esc(c.ja)+'</div><div class="rom">'+esc(c.ro)+'</div></div>'
    + '<div class="band"><span class="nil"></span><span class="mid">'+SIZE[c.size]+' · 活动卡片</span><span class="nil"></span></div>'
    + '<div class="under"><span class="zh"'+langAttr(c.area)+'>'+esc(c.area)+'</span><span class="zh">'+(at.length ? '已安排 '+at.map(x => x.date).join('、') : '未安排')+'</span></div></div>'
    + '<div class="dtitle"><h2>'+esc(c.title)+'</h2><p>'+fmt(c.summary)+'</p></div>'
    + '<dl class="facts">'+fact('时间', c.time)+fact('交通', c.transit+'（'+LOAD[c.load]+'）')+fact('家庭', c.family)+fact('预约', c.booking)+fact('雨天', c.rain)
      + fact('营业', c.hours)+fact('休馆', c.closed && c.closed.text)+fact('待核对', c.calendar)+'</dl>'
    + '<div class="blk"><div class="lbl">安排到哪天 <span class="en">PLACE</span></div><ul class="places">'
    + days.map(d => { const cur = cardOf(d), here = cur.id === c.id, r = check(c, d, {vacate: c.multi ? [] : at.map(x => x.id)});
        return '<li class="place"><div class="pl"><a href="#d'+d.n+'"><b>'+d.date+' '+esc(d.dow)+'</b></a><span>现在：'+esc(cur.name)+((d.fixed.short||[]).length ? ' · 固定：'+esc(d.fixed.short.join('、')) : '')+'</span></div>'
          + (here ? '<p class="small"><b>已安排在这天</b></p>'+(c.multi ? '' : '<div class="pa"><button type="button" class="btn ghost" data-act="do" data-op="set" data-card="'+restCard(c.city).id+'" data-day="'+d.id+'">从这天移除（改成留白）</button></div>')
            : checkLine(r)+'<div class="pa"><button type="button" class="btn" data-act="place" data-card="'+c.id+'" data-day="'+d.id+'"'+(r.block?' disabled':'')+'>安排到 '+d.date+'</button></div>')
          + '</li>'; }).join('')
    + '</ul></div>'
    + (c.opts.length ? '<div class="blk"><div class="lbl">支线 <span class="en">OPTIONS</span></div><ul class="olist">'+c.opts.map(o => '<li><b>'+esc(o.label)+'</b>'+(o.group ? '<span class="fxt">'+c.opts.filter(x => x.group === o.group).length+' 选 1'+(o.on?' · 默认':'')+'</span>' : o.on ? '<span class="fxt">默认选上</span>' : '')+(o.who ? '<span class="fxt who">'+WHO[o.who]+'</span>' : '')+(o.closed ? '<small>'+esc(o.closed.text)+'</small>' : '')+'</li>').join('')+'</ul><p class="small">支线在安排到的那一天页面上勾选。</p></div>' : '')
    + '<div class="blk"><div class="lbl">推荐顺序 <span class="en">ROUTE</span></div><ol class="steps">'+li(c.route)+'</ol></div>'
    + '<div class="blk"><div class="lbl">吃 · 买 · 看 <span class="en">EAT · SHOP · SEE</span></div><div class="trio">'
    + [['食','eat'],['买','shop'],['观','see']].filter(([,f]) => c[f].length).map(([k,f]) => '<section><span class="mk" lang="ja">'+k+'</span><ul>'+li(c[f])+'</ul></section>').join('')+'</div></div>'
    + (c.note ? '<div class="note"><span class="stamp">待确认</span><p>'+fmt(c.note)+'</p></div>' : '');
  const prep = prepList(c, null);
  if (prep) h += '<div class="blk"><div class="lbl">准备 <span class="en">PREP</span></div>'+prep+'<p class="small">只有这张卡排进行程时，这些才出现在「附录 · 尚待确认」里；勾选一直保留。</p></div>';
  const rel = [...new Set(c.rel.map(r => refOn(r, all)).filter(Boolean))];
  if (rel.length) h += '<div class="blk"><div class="lbl">资料 <span class="en">REFERENCE</span></div><div class="rel">'+rel.map(relCard).join('')+'</div></div>';
  if (c.links.length) h += '<div class="lk">'+extLinks(c.links)+'</div>';
  h += '<p class="small">核对于 '+esc(c.checked)+'；营业日、票价和时段出发前再看官网。</p></div>';
  $('#v-card').innerHTML = h;
  return true;
}

/* ----- home bases ----- */
const bfilter = {};
let bq = '';   // 宿 search, shared by the index (both hotels) and each hotel page
const baseText = e => [e.name, e.hours, e.body, e.note, e.walk, ...e.k.map(k => KIND[k][1]), ...e.links.map(l => l.label)].join(' ').toLowerCase();
const baseMatch = (e, q) => !q || baseText(e).includes(q.toLowerCase());
const baseHits = q => D.base.reduce((n, bs) => n + bs.entries.filter(e => baseMatch(e, q)).length, 0);
function searchBox(id, ph, label, val){
  return '<div class="search"><input id="'+id+'" type="search" placeholder="'+ph+'" aria-label="'+label+'" autocomplete="off" value="'+esc(val)+'"><button type="button"'+(val?'':' hidden')+'>清除</button></div>';
}
function wireSearch(root, onChange){
  const inp = root.querySelector('.search input'), clr = root.querySelector('.search button');
  inp.addEventListener('input', () => { bq = inp.value.trim(); clr.hidden = !bq; onChange(); });
  clr.addEventListener('click', () => { inp.value = ''; bq = ''; clr.hidden = true; onChange(); inp.focus(); });
}
function renderBaseResults(){
  const v = $('#v-base'), q = bq;
  v.querySelector('.bases').hidden = v.querySelector('.legend').hidden = !!q;
  const out = v.querySelector('.bres');
  if (!q){ out.innerHTML = ''; return; }
  let h = '', total = 0;
  D.base.forEach(bs => {
    const es = bs.entries.filter(e => baseMatch(e, q)); if (!es.length) return;
    total += es.length;
    h += '<section class="sec c-'+bs.city+'"><a class="sec-h" href="#base-'+bs.code+'"><div class="msign"><b lang="ja">'+esc(bs.sign)+'</b><span>'+esc(bs.ro)+'</span></div>'
      + '<div class="ttl"><div class="ar" lang="ja">宿 · '+esc(bs.sign)+' →</div><h3>'+es.length+' 处</h3></div></a>'
      + '<ol class="bents">'+es.map(e => baseEnt(e, q, bs)).join('')+'</ol></section>';
  });
  if (!total) h = '<p class="empty">两家酒店周边都没有找到“'+esc(q)+'”。吃、买、玩各有自己的搜索。</p>';
  out.innerHTML = h;
}
function renderBaseIndex(){
  let h = '<div class="vhead"><h2><span class="k" lang="ja">宿</span>两个大本营的周边</h2><p>酒店步行圈里能吃、能买、能玩、能看的地方，按远近分三圈。白天带孩子出门，晚上你一个人散步，都从这里挑。</p></div>'
    + '<div class="tools">'+searchBox('q-base', '搜两家酒店周边：店名、用途、正文…', '搜索两家酒店周边', bq)+'</div><div class="bres"></div><div class="bases">';
  D.base.forEach(bs => {
    const here = todayN && bs.days.includes(todayN);
    h += '<a class="bcard c-'+bs.city+(here?' today':'')+'" href="#base-'+bs.code+'">'
      + '<div class="top"><div class="kana" lang="ja">'+esc(bs.kana)+'</div><div class="big" lang="ja">'+esc(bs.sign)+'</div><div class="rom">'+esc(bs.ro)+'</div></div>'
      + '<div class="band"><span lang="ja">'+CITY[bs.city][0]+'</span><span class="mid">'+bs.nights+' 泊</span><span>'+esc(bs.dates)+'</span></div>'
      + '<div class="under">'+Object.keys(KIND).map(k => '<span>'+kd(k)+bs.entries.filter(e => e.k.includes(k)).length+'</span>').join('')
      + (here ? '<span class="tag-today">TODAY</span>' : '<span class="go">'+bs.entries.length+' 处 →</span>')+'</div></a>';
  });
  h += '</div><p class="small legend">图例　'+Object.keys(KIND).map(k => '<span class="lg">'+kd(k)+KIND[k][1]+'</span>').join('')+'</p>';
  const v = $('#v-base'); v.innerHTML = h;
  wireSearch(v.querySelector('.tools'), renderBaseResults);
  renderBaseResults();
}
function baseEnt(e, q, from){
  return '<li class="be" id="be-'+e.id+'" data-k="'+e.k.join(' ')+'"><div class="bh"><h4'+langAttr(e.name)+'>'+fmt(e.name,q)+'</h4><span class="wk">'+esc(e.walk)+'</span></div>'
    + '<div class="kl">'+Object.keys(KIND).filter(k => e.k.includes(k)).map(kd).join('')+'<span class="hr">'+fmt(e.hours,q)+'</span></div>'
    + '<p class="bd">'+fmt(e.body,q)+'</p>' + (e.note ? '<p class="fm">'+fmt(e.note,q)+'</p>' : '') + linkRow(e)
    + (from ? '<a class="goto" href="#base-'+e.id+'">在「宿 · '+esc(from.sign)+'」的'+esc(from.rings[e.ring][0])+'里看 →</a>' : '') + '</li>';
}
function ringsHTML(bs){
  return bs.rings.map((r, ri) => { const es = bs.entries.filter(e => e.ring === ri);
    return '<section class="ring"><div class="rh"><span class="rn">'+esc(r[0])+'</span><span class="en">'+esc(r[1])+'</span></div><p class="rd">'+fmt(r[2])+'</p><ol class="bents">'+es.map(e => baseEnt(e, bq)).join('')+'</ol></section>'; }).join('');
}
function renderBase(code, focus){
  const i = D.base.findIndex(x => x.code === code); if (i < 0) return false;
  const target = focus && D.base[i].entries.find(e => e.id === focus);
  if (focus && !target) return false;
  // A deep link must always reveal its entry: drop the use filter, and drop a search
  // that would hide it (e.g. after going back in history), so the box matches what is shown.
  if (target){ bfilter[code] = 'all'; if (!baseMatch(target, bq)) bq = ''; }
  const bs = D.base[i], prev = D.base[i-1], next = D.base[i+1];
  const f = bfilter[code] || 'all';
  const count = k => k === 'all' ? bs.entries.length : bs.entries.filter(e => e.k.includes(k)).length;
  let h = '<div class="c-'+bs.city+'"><a class="back" href="#base">← 两个大本营</a>'
    + '<div class="sign"><div class="top"><div class="kana" lang="ja">'+esc(bs.kana)+'</div><div class="big" lang="ja">'+esc(bs.sign)+'</div><div class="rom">'+esc(bs.ro)+'</div></div>'
    + '<div class="band">'
    + (prev ? '<a href="#base-'+prev.code+'"><small>◀</small><b lang="ja">'+esc(prev.sign)+'</b></a>' : '<span class="nil"></span>')
    + '<span class="mid">宿 · '+bs.nights+' 泊</span>'
    + (next ? '<a href="#base-'+next.code+'"><b lang="ja">'+esc(next.sign)+'</b><small>▶</small></a>' : '<span class="nil"></span>')
    + '</div><div class="under"><span>2027 · '+esc(bs.dates)+'</span><span class="zh" lang="ja">'+esc(bs.stay)+'</span></div></div>'
    + '<div class="dtitle"><p>'+fmt(bs.lead)+'</p><p class="hint">'+esc(bs.hint)+'</p></div>'
    + '<div class="btools">'+searchBox('q-base-'+code, '在这里搜：店名、用途、正文…', '搜索'+bs.sign+'周边', bq)+'<div class="bchips">'
    + [['all','全部']].concat(Object.keys(KIND).map(k => [k, KIND[k][1]])).map(([k,l]) =>
        '<button type="button" class="chip'+(k===f?' on':'')+'" data-f="'+k+'">'+(k==='all'?'':kd(k))+l+' <span class="ct">'+count(k)+'</span></button>').join('')
    + '</div></div>'
    + '<div class="brings">'+ringsHTML(bs)+'</div>'
    + '<p class="empty" hidden></p>'
    + '<div class="tip"><span class="tl">这样住</span><span>'+fmt(bs.tip)+'</span></div>'
    + '<div class="blk"><div class="lbl">住在这里的日子 <span class="en">DAYS</span></div>'+dayChips(bs.days)+'</div>'
    + '</div>';
  const v = $('#v-base'); v.innerHTML = h;
  applyFilter(code);
  wireSearch(v.querySelector('.btools'), () => { v.querySelector('.brings').innerHTML = ringsHTML(bs); applyFilter(code); });
  v.querySelector('.bchips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    bfilter[code] = b.dataset.f; applyFilter(code);
    const top = v.querySelector('.btools').getBoundingClientRect().top + scrollY;
    if (scrollY > top) window.scrollTo({top, behavior:'instant'});
  });
  return true;
}
function applyFilter(code){
  const v = $('#v-base'), f = bfilter[code] || 'all';
  v.querySelectorAll('.bchips .chip').forEach(c => c.classList.toggle('on', c.dataset.f === f));
  const on = v.querySelector('.bchips .chip.on'), bar = on.parentElement;
  bar.scrollLeft = on.offsetLeft - bar.clientWidth/2 + on.offsetWidth/2;
  const bs = D.base.find(x => x.code === code);
  v.querySelectorAll('.be').forEach(li => { const e = bs.entries.find(x => 'be-'+x.id === li.id);
    li.hidden = (f !== 'all' && !li.dataset.k.split(' ').includes(f)) || !baseMatch(e, bq); });
  let any = false;
  v.querySelectorAll('.ring').forEach(r => { const vis = !!r.querySelector('.be:not([hidden])'); r.hidden = !vis; any = any || vis; });
  const em = v.querySelector('.empty'); em.hidden = any;
  if (!any) em.textContent = bq ? '这里没有找到“'+bq+'”'+(f !== 'all' ? '（当前只看「'+KIND[f][1]+'」，可以切回全部）' : '')+'。' : '这一类在这里没有收录。';
}

/* ----- companion books: station index + one page per station ----- */
const query = {eat:'', shop:'', see:''};
// "on days" follows the current plan: a station is passed on a day if the day's view links it
const daysFor = (b, code) => D.days.filter(d => view(d).rel.includes(b+':'+code)).map(d => d.n);
function entHTML(s, e, q){
  const i = s.entries.indexOf(e)+1;
  return '<li class="ent"><div class="hd"><span class="no">'+pad(i)+'</span><div style="min-width:0"><h4'+langAttr(e.name)+'>'+fmt(e.name,q)+'</h4>'
    + '<div class="tg">'+fmt(e.tag,q)+'</div></div></div>'
    + '<p class="bd">'+fmt(e.body,q)+'</p>'
    + (e.fam ? '<p class="fm"><b>一家四口</b>　'+fmt(e.fam,q)+'</p>' : '')
    + linkRow(e) + '</li>';
}
function stnLink(b, s){
  const dn = daysFor(b, s.code);
  return '<a class="stn c-'+s.city+'" href="#'+b+'-'+s.code+'"><span class="msign"><b lang="ja">'+esc(s.sign)+'</b><span>'+esc(s.ro)+'</span></span>'
    + '<span class="tx"><b'+langAttr(s.area)+'>'+esc(s.area)+'</b><span>'+esc(s.head)+'</span></span>'
    + '<span class="n">'+s.entries.length+' 项 →'+(dn.length ? '<small>DAY '+dn.map(pad).join(' · ')+'</small>' : '')+'</span></a>';
}
function renderBookShell(b){
  const B = D.books[b], el = $('#v-'+b);
  el.innerHTML = '<div class="idx"><div class="vhead"><h2><span class="k" lang="ja">'+BOOK[b][1]+'</span>'+esc(B.sub)+'</h2><p>'+esc(B.lead)+'</p></div>'
    + '<div class="tools"><div class="search"><input id="q-'+b+'" type="search" placeholder="搜店名、料理、区域…" aria-label="搜索'+B.name+'" autocomplete="off"><button type="button" hidden>清除</button></div></div>'
    + '<div class="body"></div></div><div class="stp" hidden></div>';
  const inp = el.querySelector('input'), clr = el.querySelector('.search button');
  inp.addEventListener('input', () => { query[b] = inp.value.trim(); clr.hidden = !query[b]; renderBookBody(b); });
  clr.addEventListener('click', () => { inp.value=''; query[b]=''; clr.hidden = true; renderBookBody(b); inp.focus(); });
  renderBookBody(b);
}
function renderBookBody(b){
  const B = D.books[b], q = query[b].toLowerCase();
  let h = '';
  if (!q){
    ['tokyo','hakone','osaka','misc'].forEach(c => {
      const secs = B.sections.filter(s => s.city === c); if (!secs.length) return;
      h += '<div class="c-'+c+'"><div class="city-h"><span class="nm" lang="ja">'+CITY[c][0]+'</span><span class="ro">'+CITY[c][1]+'</span><span class="cstay">'+secs.length+' 站</span></div>'
        + '<div class="stns">'+secs.map(s => stnLink(b, s)).join('')+'</div></div>';
    });
    $('#v-'+b+' .body').innerHTML = h; return;
  }
  const match = e => [e.name,e.tag,e.body,e.fam,...e.links.map(l=>l.label)].join(' ').toLowerCase().includes(q);
  let total = 0;
  B.sections.forEach(s => {
    const secHit = (s.area+s.head+s.lead).toLowerCase().includes(q);
    const ents = s.entries.filter(e => secHit || match(e));
    if (!ents.length) return;
    total += ents.length;
    h += '<section class="sec c-'+s.city+'"><a class="sec-h" href="#'+b+'-'+s.code+'"><div class="msign"><b lang="ja">'+esc(s.sign)+'</b><span>'+esc(s.ro)+'</span></div>'
      + '<div class="ttl"><div class="ar"'+langAttr(s.area)+'>'+fmt(s.area,q)+' →</div><h3>'+fmt(s.head,q)+'</h3></div></a>'
      + '<ol class="ents">'+ents.map(e => entHTML(s, e, q)).join('')+'</ol></section>';
  });
  const bn = baseHits(query[b]);
  const toBase = '<a href="#base" data-bq="'+esc(query[b])+'">在「宿」里搜“'+esc(query[b])+'”（'+bn+' 处）→</a>';
  if (!total) h = '<p class="empty">「'+BOOK[b][0]+'」里没有找到“'+esc(query[b])+'”。'
    + (bn ? '<br>酒店步行圈的地点收在「宿」：'+toBase : '<br>两家酒店周边（「宿」）也没有。换个词，比如日文店名或料理。')+'</p>';
  else if (bn) h += '<p class="xhint">酒店步行圈的地点收在「宿」，那里还有 '+bn+' 处匹配：'+toBase+'</p>';
  $('#v-'+b+' .body').innerHTML = h;
}
function renderStation(b, code){
  const B = D.books[b], i = B.sections.findIndex(x => x.code === code); if (i < 0) return false;
  const s = B.sections[i], prev = B.sections[i-1], next = B.sections[i+1], dn = daysFor(b, code);
  const h = '<div class="c-'+s.city+'"><a class="back" href="#'+b+'">← '+BOOK[b][0]+' · 全部站</a>'
    + '<div class="sign"><div class="top"><div class="big"'+langAttr(s.sign)+'>'+esc(s.sign)+'</div><div class="rom">'+esc(s.ro)+'</div></div>'
    + '<div class="band">'
    + (prev ? '<a href="#'+b+'-'+prev.code+'" aria-label="上一站"><small>◀</small><b'+langAttr(prev.sign)+'>'+esc(prev.sign)+'</b></a>' : '<span class="nil"></span>')
    + '<span class="mid">'+BOOK[b][0]+' '+pad(i+1)+'/'+pad(B.sections.length)+'</span>'
    + (next ? '<a href="#'+b+'-'+next.code+'" aria-label="下一站"><b'+langAttr(next.sign)+'>'+esc(next.sign)+'</b><small>▶</small></a>' : '<span class="nil"></span>')
    + '</div><div class="under"><span class="zh"'+langAttr(s.area)+'>'+esc(s.area)+'</span><span class="zh">'+s.entries.length+' 项</span></div></div>'
    + '<div class="dtitle"><h2>'+esc(s.head)+'</h2>'+(s.lead ? '<p>'+fmt(s.lead)+'</p>' : '')+'<p class="hint"'+langAttr(s.hint)+'>'+esc(s.hint)+'</p></div>'
    + '<ol class="ents">'+s.entries.map(e => entHTML(s, e, '')).join('')+'</ol>'
    + (s.tip ? '<div class="tip"><span class="tl">今天这样挑</span><span>'+fmt(s.tip)+'</span></div>' : '')
    + (dn.length ? '<div class="blk"><div class="lbl">哪天会经过 <span class="en">ON DAYS</span></div>'+dayChips(dn)+'</div>' : '<div class="blk"><p class="small">当前行程里没有哪天经过这一站；资料照常可查。</p></div>')
    + '<div class="pager">'
    + (prev ? '<a href="#'+b+'-'+prev.code+'">← '+esc(prev.sign)+'<b'+langAttr(prev.area)+'>'+esc(prev.area)+'</b></a>' : '<span></span>')
    + (next ? '<a class="nx" href="#'+b+'-'+next.code+'">'+esc(next.sign)+' →<b'+langAttr(next.area)+'>'+esc(next.area)+'</b></a>' : '<span></span>')
    + '</div></div>';
  $('#v-'+b+' .stp').innerHTML = h;
  return true;
}

/* ----- appendix ----- */
let done = {};
try { done = JSON.parse(localStorage.getItem('jp27-todo') || '{}') || {}; } catch(e) {}
if (typeof done !== 'object' || Array.isArray(done)) done = {};
// Old builds keyed plain to-dos by array index ("0", "1", …). Those keys can't be mapped
// reliably to today's list, so they are ignored (never applied by position) until acknowledged.
const legacyTodo = () => Object.keys(done).some(k => /^\d+$/.test(k) && done[k]);
function saveDone(){ try { localStorage.setItem('jp27-todo', JSON.stringify(done)); } catch(err) {} }
function renderInfo(){
  // To-dos tied to a card only show while that card (and branch) is in the plan; ticks are never dropped.
  const live = D.todo.filter(todoActive), parked = D.todo.filter(t => !todoActive(t));
  let h = '<div class="vhead"><h2><span class="k" lang="ja">要</span>附录 · 执行细节</h2><p>交通行李、预约换日、孩子与吟游、退税返程、日本 eVISA。各节标注核对时间，出发前再开官方入口复核。东京几天的备选活动在「行程 · 活动卡片」。</p></div>';
  h += '<div class="apx c-osaka" id="info-todo"><div class="id">TO DO</div><h3>尚待确认</h3><div class="lk"><a href="#info-E">日本 eVISA 材料与办理</a></div><ul class="todo">'
    + live.map(t => checkbox('todo-'+t.id, 'todo:'+t.id, t.text)).join('')
    + '</ul>' + (parked.length ? '<p class="small">另有 '+parked.length+' 项只属于没排进行程的活动，收在卡片里：'
        + [...new Set(parked.map(t => t.card))].map(id => '<a class="ax" href="#card-'+id+'">'+esc(CARDS[id].name)+'</a>').join('、')+'。</p>' : '')
    + (legacyTodo() ? '<div class="legacy" role="note"><p>旧版本按列表位置记录过这里的勾选；列表顺序后来变过，无法可靠对应到现在的任务，所以没有沿用。请把上面的待办重新核对一遍。附录里的打包和 eVISA 勾选不受影响。</p><button type="button" class="legacy-ok">知道了</button></div>' : '')
    + '<p class="small">勾选只保存在这台设备的浏览器里。</p></div>';
  D.apx.forEach(a => {
    h += '<div class="apx" id="info-'+a.id+'"><div class="id">APPENDIX '+a.id+'</div><h3>'+esc(a.title)+'</h3><p class="ld">'+esc(a.lead)+'</p>'
      + a.parts.map(p => {
          const cl = (p.checklist || []).filter(t => !t.card || activeRef(t.card)), off = (p.checklist || []).filter(t => t.card && !activeRef(t.card));
          return '<h4>'+esc(p.h)+'</h4>'+(p.p || []).map(x=>'<p>'+fmt(x)+'</p>').join('')
            + (cl.length ? '<ul class="todo">'+cl.map(t => checkbox(t.id, t.id, t.text)).join('')+'</ul>' : '')
            + off.map(t => '<p class="small">'+esc(CARDS[t.card].name)+' 不在当前行程，相关一项收在<a class="ax" href="#card-'+t.card+'">卡片</a>里。</p>').join('');
        }).join('')
      + '<div class="lk">'+extLinks(a.links)+'</div></div>';
  });
  h += '<div class="apx" id="info-ref"><div class="id">REFERENCE</div><h3>这套攻略怎么用</h3><div class="refs">'
    + D.ref.map(r => '<p><b>'+esc(r.h)+'</b>'+fmt(r.p)+'</p>').join('') + '</div></div>';
  $('#v-info').innerHTML = h;
}

/* ----- router ----- */
function show(v){ document.querySelectorAll('.view').forEach(x => x.hidden = x.id !== 'v-'+v); }
// keep = re-render in place after a plan change (no scroll jump)
function route(keep){
  const h = (location.hash || '#trip').slice(1);
  let tab = 'trip', target = null, idx = false;
  let m;
  // old bookmarks to the retired night sections
  if (/^(eat|see)-N1$/.test(h)) { location.replace('#base'); return; }
  // stations folded into 「宿」 or removed in the 2026/10 review; 附录 F became the card library
  const MOVED = {'eat-T1':'base-T','shop-T1':'shop-T2','eat-O1':'base-O','shop-O1':'base-O','see-O1':'base-O','shop-T4':'shop','see-T4':'see','see-T7':'see','info-F':'cards'};
  if (MOVED[h]) { location.replace('#'+MOVED[h]); return; }
  if ((m = h.match(/^d(\d{1,2})(-swap)?$/)) && +m[1] >= 1 && +m[1] <= D.days.length){
    const swap = !!m[2] && !!D.days[+m[1]-1].slot;
    renderDay(+m[1], {swap}); show('day'); tab='trip';
    if (swap && !keep) target = $('#swap');
  }
  else if (h === 'trip' || h === ''){ renderTrip(); show('trip'); idx = true; }
  else if (h === 'cards'){ renderCards(); show('cards'); }
  else if ((m = h.match(/^card-([a-z0-9-]+)$/))){
    const id = CARDS[m[1]] ? m[1] : D.cards.aliases[m[1]];
    if (id && id !== m[1]) { location.replace('#card-'+id); return; }
    if (!renderCard(m[1])) { location.replace('#cards'); return; }
    show('card');
  }
  else if (h === 'base'){ renderBaseIndex(); show('base'); tab='base'; }
  else if ((m = h.match(/^base-([A-Z])$/)) && renderBase(m[1])){ show('base'); tab='base'; }
  else if ((m = h.match(/^base-(([A-Z])\d{2})$/)) && renderBase(m[2], m[1])){
    show('base'); tab='base'; target = document.getElementById('be-'+m[1]);
    target.classList.add('flash');
  }
  else if ((m = h.match(/^(eat|shop|see)(?:-([A-Z0-9]+))?$/))){
    show(m[1]); tab = m[1];
    const v = $('#v-'+m[1]), st = m[2] && renderStation(m[1], m[2]);
    if (!st) renderBookBody(m[1]);
    v.querySelector('.idx').hidden = !!st; v.querySelector('.stp').hidden = !st;
  }
  else if ((m = h.match(/^info(?:-([A-Za-z]+))?$/))){ renderInfo(); show('info'); tab='info'; if (m[1]) target = document.getElementById('info-'+m[1]); }
  else { renderTrip(); show('trip'); idx = true; }
  document.getElementById('mast').hidden = !idx;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === tab));
  if (keep) return;
  if (target) requestAnimationFrame(() => target.scrollIntoView({block: target.classList.contains('be') ? 'center' : 'start', behavior:'instant'}));
  else window.scrollTo({top:0, behavior:'instant'});
}
function onAction(e){
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'undo') return undo();
  if (a === 'reset') return commit(() => { plan.days = {}; plan.opts = {}; }, '已恢复推荐方案（已逛过和勾选不变）');
  if (a === 'toggle-swap'){ const p = $('#swap'), open = p.hidden; p.hidden = !open; b.setAttribute('aria-expanded', open); if (open) p.scrollIntoView({block:'start', behavior:'smooth'}); return; }
  if (a === 'cancel'){ const cf = b.closest('.cf'); const btn = cf.parentElement.querySelector('[data-act="pick"],[data-act="place"]'); cf.remove(); if (btn){ btn.hidden = false; btn.focus(); } return; }
  if (a === 'pick' || a === 'place'){
    const ch = placeChoices(b.dataset.card, b.dataset.day, a === 'pick');
    if (!ch) return;
    if (!ch.length) return doPlace('set', b.dataset.card, b.dataset.day);
    b.hidden = true;
    b.insertAdjacentHTML('afterend', confirmHTML(b.dataset.card, b.dataset.day, ch));
    b.parentElement.querySelector('.cf button').focus();
    return;
  }
  if (a === 'do') return doPlace(b.dataset.op, b.dataset.card, b.dataset.day, b.dataset.src);
  if (a === 'opt' && b.tagName === 'BUTTON'){
    const c = CARDS[b.dataset.card], o = c.opts.find(x => x.id === b.dataset.opt);
    return commit(() => { (plan.opts[c.id] ||= {})[o.id] = false; }, '已取消「'+o.label+'」');
  }
}
function onChange(e){
  const t = e.target;
  if (t.dataset.checkKey){
    done[t.dataset.checkKey] = t.checked; saveDone();
    document.querySelectorAll('input[data-check-key="'+CSS.escape(t.dataset.checkKey)+'"]').forEach(x => { x.checked = t.checked; });
    return;
  }
  if (t.dataset.act === 'opt'){
    const c = CARDS[t.dataset.card], o = c.opts.find(x => x.id === t.dataset.opt);
    return commit(() => {
      const po = plan.opts[c.id] ||= {};
      if (o.group) c.opts.filter(x => x.group === o.group).forEach(x => { po[x.id] = x.id === o.id; });
      else po[o.id] = t.checked;
    }, (o.group || t.checked ? '已选「' : '已取消「')+o.label+'」');
  }
  if (t.dataset.act === 'visit'){
    const tag = t.dataset.tag;
    return commit(() => { if (t.checked) plan.visited[tag] = t.dataset.day; else delete plan.visited[tag]; },
      (t.checked ? '已标记逛过：' : '已取消标记：')+TAGS[tag].label);
  }
}
function boot(){
  D.cards.cards.forEach(c => { CARDS[c.id] = c; });
  TAGS = D.cards.tags;
  loadPlan();
  ['eat','shop','see'].forEach(renderBookShell);
  window.addEventListener('hashchange', () => route());
  // in-page links: set the hash directly so navigation never depends on a <base> URL
  document.addEventListener('click', e => {
    const l = e.target.closest('a[href^="#"]');
    if (!l){ onAction(e); return; }
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const h = l.getAttribute('href');
    if (l.dataset.bq != null) bq = l.dataset.bq;
    if (location.hash === h) route(); else location.hash = h;
  });
  document.addEventListener('change', onChange);
  $('#v-info').addEventListener('click', e => {
    if (!e.target.closest('.legacy-ok')) return;
    Object.keys(done).forEach(k => { if (/^\d+$/.test(k)) delete done[k]; });
    saveDone();
    e.target.closest('.legacy').remove();
  });
  route();
}
const get = f => fetch('data/'+f+'.json', {cache:'no-cache'}).then(r => { if (!r.ok) throw new Error(f+'.json '+r.status); return r.json(); });
Promise.all(['days','cards','books','base','info'].map(get)).then(([days, cards, books, base, info]) => {
  D = {days, cards, books, base, todo:info.todo, apx:info.apx, ref:info.ref};
  try { boot(); }
  catch(err){
    // a render bug or an unexpected saved plan: say so, and offer the way back to the recommended plan
    show('trip');
    $('#v-trip').innerHTML = '<p class="empty">页面显示出错（'+esc(err.message)+'）。可以清掉这台设备保存的活动选择，回到推荐方案；勾选不受影响。<br><button type="button" class="btn" id="plan-clear">清掉本机活动选择并重新载入</button></p>';
    $('#plan-clear').addEventListener('click', () => { try { localStorage.removeItem(PLAN_KEY); } catch(e){} location.reload(); });
  }
}).catch(err => {
  $('#v-trip').innerHTML = '<p class="empty">行程资料没有载入（'+esc(err.message)+'）。检查网络后刷新一次。</p>';
});
})();
