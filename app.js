(function(){
// Data lives in data/*.json (days, books, base, info); see AGENTS.md for the shape.
let D;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad = n => String(n).padStart(2,'0');
const CITY = {dep:['出发','Departure'], tokyo:['東京','Tokyo'], hakone:['箱根','Hakone'], osaka:['大阪','Osaka'], ret:['返程','Return'], misc:['索引与心得','Index & tips']};
const STAY = {dep:'机上', tokyo:'MONday 上野新御徒町 · 5 晚', hakone:'箱根吟游 · 月・和室 · 2 晚 · 申请中', osaka:'MONday apart 心斋桥 · 5 晚', ret:'羽田附近 1 晚 · 待定'};
const BOOK = {eat:['吃','食'], shop:['买','买'], see:['玩','观']};
const KIND = {eat:['食','吃饭'], snack:['甜','小吃甜点'], shop:['买','买'], see:['观','看 · 逛'], kids:['遊','孩子放电'], night:['夜','九点以后']};
const JA_RX = /[぀-ヿ]/;
// wrap text: escape, link 附录 X, mark search hits
function fmt(t, q){
  let h = esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/附录\s?([A-F])(?:[、，‑-]\s?([A-F]))?/g, (m,a,b) =>
    '<a class="ax" href="#info-'+a+'">附录 '+a+'</a>' + (b ? '、<a class="ax" href="#info-'+b+'">'+b+'</a>' : ''));
  if (q) h = hl(h, q);
  return h;
}
function hl(html, q){
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
  return html.replace(/(^|>)([^<]*)/g, (m, a, txt) => a + txt.replace(rx, x => '<mark>'+x+'</mark>'));
}
const langAttr = t => JA_RX.test(t) ? ' lang="ja"' : '';
const linkRow = e => '<div class="lk">'+(e.map ? '<a class="map" href="'+esc(e.map)+'" target="_blank" rel="noopener">地图 <span class="ar">↗</span></a>' : '')
  + e.links.map(l => '<a href="'+esc(l.url)+'" target="_blank" rel="noopener"'+langAttr(l.label)+'>'+esc(l.label)+' <span class="ar">↗</span></a>').join('')+'</div>';
const kd = k => '<i class="kd k-'+k+'" title="'+KIND[k][1]+'">'+KIND[k][0]+'</i>';

/* ----- dates ----- */
function jstToday(){ const d = new Date(Date.now() + 9*3600e3); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
const START = Date.UTC(2027,2,13), END = Date.UTC(2027,2,27);
const T = jstToday();
const todayN = (T >= START && T <= END) ? Math.round((T-START)/864e5)+1 : null;
(function status(){
  const el = $('#status');
  if (todayN) el.innerHTML = '日本今天是 <b>DAY '+pad(todayN)+'</b><a href="#d'+todayN+'">打开今天 →</a>';
  else if (T < START) el.innerHTML = '距出发还有 <b>'+Math.round((START-T)/864e5)+'</b> 天 · 内容核对于 2026/10/3';
  else el.innerHTML = '旅程已结束 · 欢迎回家';
})();
function dayChips(ns){
  return '<div class="dchips">'+ns.map(n => { const d = D.days[n-1];
    return '<a class="c-'+d.city+'" href="#d'+n+'"><b>DAY '+pad(n)+'</b><span lang="ja">'+esc(d.ja)+'</span><small>'+d.date+' '+esc(d.dow)+'</small></a>'; }).join('')+'</div>';
}

/* ----- itinerary ----- */
function renderTrip(){
  const groups = [];
  D.days.forEach(d => { const g = groups[groups.length-1]; if (g && g.city === d.city) g.days.push(d); else groups.push({city:d.city, days:[d]}); });
  let h = '<div class="vhead"><h2>行程 · 15 站</h2><p>每天一个主项目。点开某一天，看路线、住处、吃买看，以及这一带还能去哪。</p></div>';
  groups.forEach(g => {
    h += '<div class="c-'+g.city+'"><div class="city-h"><span class="nm" lang="ja">'+CITY[g.city][0]+'</span><span class="ro">'+CITY[g.city][1]+'</span><span class="cstay">'+esc(STAY[g.city])+'</span></div><ol class="line">';
    g.days.forEach((d,i) => {
      const cls = ['stop', i===0?'first':'', i===g.days.length-1?'last':'', d.n===todayN?'today':''].join(' ');
      h += '<li class="'+cls+'"><a href="#d'+d.n+'"><span class="dn">DAY<b>'+pad(d.n)+'</b></span>'
        + '<span class="t1"><span class="sn" lang="ja">'+esc(d.ja)+'</span><span class="dt">'+d.date+' <span class="zh">'+esc(d.dow)+'</span></span>'
        + (d.n===todayN?'<span class="tag-today">TODAY</span>':'')+'</span>'
        + '<span class="t2">'+esc(d.title)+'</span></a></li>';
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
function renderDay(n){
  const d = D.days[n-1], prev = D.days[n-2], next = D.days[n];
  const li = a => a.map(x => '<li>'+fmt(x)+'</li>').join('');
  let h = '<div class="c-'+d.city+'"><a class="back" href="#trip">← 全部行程</a>'
    + '<div class="sign"><div class="top"><div class="big" lang="ja">'+esc(d.ja)+'</div><div class="rom">'+esc(d.ro)+'</div></div>'
    + '<div class="band">'
    + (prev ? '<a href="#d'+prev.n+'" aria-label="前一天"><small>◀ '+pad(prev.n)+'</small><b lang="ja">'+esc(prev.ja)+'</b></a>' : '<span class="nil"></span>')
    + '<span class="mid">DAY '+pad(d.n)+'</span>'
    + (next ? '<a href="#d'+next.n+'" aria-label="后一天"><b lang="ja">'+esc(next.ja)+'</b><small>'+pad(next.n)+' ▶</small></a>' : '<span class="nil"></span>')
    + '</div><div class="under"><span>2027 · '+d.date+' <span class="zh">'+esc(d.dow)+'</span></span><span class="zh"'+langAttr(d.area)+'>'+esc(d.area)+'</span></div></div>'
    + '<div class="dtitle"><h2>'+esc(d.title)+'</h2><p>'+fmt(d.sub)+'</p>'+(d.judge?'<span class="judge">'+esc(d.judge)+'</span>':'')+'</div>'
    + '<div class="blk"><div class="lbl">今日路线 <span class="en">ROUTE</span></div><ol class="steps">'+li(d.plan)+'</ol></div>'
    + '<div class="blk"><div class="lbl">住 · 今晚落点 <span class="en">STAY</span></div><div class="stay">'+d.stay.map((x,i)=>'<p class="'+(i===0?'l0':'')+'">'+fmt(x)+'</p>').join('')+'</div></div>'
    + '<div class="blk"><div class="lbl">吃 · 买 · 看 <span class="en">EAT · SHOP · SEE</span></div><div class="trio">'
    + [['食','eat'],['买','shop'],['观','see']].map(([k,f]) => '<section><span class="mk" lang="ja">'+k+'</span><ul>'+li(d[f])+'</ul></section>').join('')
    + '</div></div>'
    + '<div class="note"><span class="stamp">待确认</span><p>'+fmt(d.note)+'</p></div>';
  if (d.rel.length){
    h += '<div class="blk"><div class="lbl">这一带还能… <span class="en">NEARBY</span></div><div class="rel">' + d.rel.map(relCard).join('') + '</div></div>';
  }
  h += '<div class="pager">'
    + (prev ? '<a href="#d'+prev.n+'">← DAY '+pad(prev.n)+'<b>'+esc(prev.title.split('｜')[0])+'</b></a>' : '<span></span>')
    + (next ? '<a class="nx" href="#d'+next.n+'">DAY '+pad(next.n)+' →<b>'+esc(next.title.split('｜')[0])+'</b></a>' : '<span></span>')
    + '</div></div>';
  $('#v-day').innerHTML = h;
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
const daysFor = (b, code) => D.days.filter(d => d.rel.includes(b+':'+code)).map(d => d.n);
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
    + (dn.length ? '<div class="blk"><div class="lbl">哪天会经过 <span class="en">ON DAYS</span></div>'+dayChips(dn)+'</div>' : '')
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
  let h = '<div class="vhead"><h2><span class="k" lang="ja">要</span>附录 · 执行细节</h2><p>交通行李、预约换日、孩子与吟游、退税返程、日本 eVISA，以及 teamLab 的替换插件日。各节标注核对时间，出发前再开官方入口复核。</p></div>';
  h += '<div class="apx c-osaka" id="info-todo"><div class="id">TO DO</div><h3>尚待确认</h3><div class="lk"><a href="#info-E">日本 eVISA 材料与办理</a></div><ul class="todo">'
    + D.todo.map(t => { const key = 'todo:'+t.id;
        return '<li><label><input type="checkbox" id="todo-'+esc(t.id)+'" data-check-key="'+esc(key)+'"'+(done[key]?' checked':'')+'><span>'+fmt(t.text)+'</span></label></li>'; }).join('')
    + '</ul>' + (legacyTodo() ? '<div class="legacy" role="note"><p>旧版本按列表位置记录过这里的勾选；列表顺序后来变过，无法可靠对应到现在的任务，所以没有沿用。请把上面的待办重新核对一遍。附录里的打包和 eVISA 勾选不受影响。</p><button type="button" class="legacy-ok">知道了</button></div>' : '')
    + '<p class="small">勾选只保存在这台设备的浏览器里。</p></div>';
  D.apx.forEach(a => {
    h += '<div class="apx" id="info-'+a.id+'"><div class="id">APPENDIX '+a.id+'</div><h3>'+esc(a.title)+'</h3><p class="ld">'+esc(a.lead)+'</p>'
      + a.parts.map(p => '<h4>'+esc(p.h)+'</h4>'+(p.p || []).map(x=>'<p>'+fmt(x)+'</p>').join('') + (p.checklist ? '<ul class="todo">'+p.checklist.map(t => '<li><label><input type="checkbox" id="'+esc(t.id)+'" data-check-key="'+esc(t.id)+'"'+(done[t.id]?' checked':'')+'><span>'+fmt(t.text)+'</span></label></li>').join('')+'</ul>' : '')).join('')
      + '<div class="lk">'+a.links.map(l => '<a href="'+esc(l.url)+'" target="_blank" rel="noopener">'+esc(l.label)+' <span class="ar">↗</span></a>').join('')+'</div></div>';
  });
  h += '<div class="apx" id="info-ref"><div class="id">REFERENCE</div><h3>这套攻略怎么用</h3><div class="refs">'
    + D.ref.map(r => '<p><b>'+esc(r.h)+'</b>'+fmt(r.p)+'</p>').join('') + '</div></div>';
  $('#v-info').innerHTML = h;
  $('#v-info').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    const key = e.target.dataset.checkKey;
    if (!key) return;
    done[key] = e.target.checked;
    saveDone();
  });
  $('#v-info').addEventListener('click', e => {
    if (!e.target.closest('.legacy-ok')) return;
    Object.keys(done).forEach(k => { if (/^\d+$/.test(k)) delete done[k]; });
    saveDone();
    e.target.closest('.legacy').remove();
  });
}

/* ----- router ----- */
function show(v){ document.querySelectorAll('.view').forEach(x => x.hidden = x.id !== 'v-'+v); }
function route(){
  const h = (location.hash || '#trip').slice(1);
  let tab = 'trip', target = null;
  let m;
  // old bookmarks to the retired night sections
  if (/^(eat|see)-N1$/.test(h)) { location.replace('#base'); return; }
  // stations folded into 「宿」 or removed in the 2026/10 review
  const MOVED = {'eat-T1':'base-T','shop-T1':'shop-T2','eat-O1':'base-O','shop-O1':'base-O','see-O1':'base-O','shop-T4':'shop','see-T4':'see','see-T7':'see'};
  if (MOVED[h]) { location.replace('#'+MOVED[h]); return; }
  if ((m = h.match(/^d(\d{1,2})$/)) && +m[1] >= 1 && +m[1] <= D.days.length){ renderDay(+m[1]); show('day'); tab='trip'; }
  else if (h === 'base'){ renderBaseIndex(); show('base'); tab='base'; }
  else if ((m = h.match(/^base-([A-Z])$/)) && renderBase(m[1])){ show('base'); tab='base'; }
  else if ((m = h.match(/^base-(([A-Z])\d{2})$/)) && renderBase(m[2], m[1])){
    show('base'); tab='base'; target = document.getElementById('be-'+m[1]);
    target.classList.add('flash');
  }
  else if ((m = h.match(/^(eat|shop|see)(?:-([A-Z0-9]+))?$/))){
    show(m[1]); tab = m[1];
    const v = $('#v-'+m[1]), st = m[2] && renderStation(m[1], m[2]);
    v.querySelector('.idx').hidden = !!st; v.querySelector('.stp').hidden = !st;
  }
  else if ((m = h.match(/^info(?:-([A-Za-z]+))?$/))){ show('info'); tab='info'; if (m[1]) target = document.getElementById('info-'+m[1]); }
  else show('trip');
  document.getElementById('mast').hidden = !(tab==='trip' && !h.startsWith('d'));
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === tab));
  if (target) requestAnimationFrame(() => target.scrollIntoView({block: target.classList.contains('be') ? 'center' : 'start', behavior:'instant'}));
  else window.scrollTo({top:0, behavior:'instant'});
}
function boot(){
  renderTrip(); renderInfo(); ['eat','shop','see'].forEach(renderBookShell);
  window.addEventListener('hashchange', route);
  // in-page links: set the hash directly so navigation never depends on a <base> URL
  document.addEventListener('click', e => {
    const l = e.target.closest('a[href^="#"]'); if (!l || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const h = l.getAttribute('href');
    if (l.dataset.bq != null) bq = l.dataset.bq;
    if (location.hash === h) route(); else location.hash = h;
  });
  route();
}
const get = f => fetch('data/'+f+'.json', {cache:'no-cache'}).then(r => { if (!r.ok) throw new Error(f+'.json '+r.status); return r.json(); });
Promise.all(['days','books','base','info'].map(get)).then(([days, books, base, info]) => {
  D = {days, books, base, todo:info.todo, apx:info.apx, ref:info.ref};
  boot();
}).catch(err => {
  $('#v-trip').innerHTML = '<p class="empty">行程资料没有载入（'+esc(err.message)+'）。检查网络后刷新一次。</p>';
});
})();
