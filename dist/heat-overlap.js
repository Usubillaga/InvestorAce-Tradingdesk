'use strict';

const requested = new URLSearchParams(location.search).get('lang') || navigator.language.slice(0, 2);
const lang = Object.hasOwn(paperWords, requested) ? requested : 'de';
const t = paperWords[lang];
const desk = 'https://raw.githubusercontent.com/Usubillaga/InvestorAce-Tradingdesk/main/dist/';
const claude = 'https://raw.githubusercontent.com/Usubillaga/InvestorAce/main/paper_trades/';
const files = {original:'heat-account.json', overlap:'heat-overlap.json'};
const journals = {};
const snapshot = {};
const labels = {original:t.original, '5':t.five, '6':t.six};
const order = ['original','5','6'];
const el = id => document.getElementById(id);
const fmt = new Intl.NumberFormat(lang,{maximumFractionDigits:2});
const percent = new Intl.NumberFormat(lang,{style:'percent',maximumFractionDigits:2});
const currencies = new Map();
const displayTime = new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'});
const when = stamp => displayTime.format(new Date(stamp))+' NY';
const pct = n => Number.isFinite(n) ? percent.format(n) : '—';
const money = (x, currency='USD') => {
  if (!Number.isFinite(x)) return '—';
  if (!currencies.has(currency)) currencies.set(currency,new Intl.NumberFormat(lang,{style:'currency',currency,currencyDisplay:'code'}));
  return currencies.get(currency).format(x);
};
function element(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function link(text, url) {
  const a = element('a',text);
  a.href = url;
  return a;
}
function sourceLink(text, url) {
  return typeof url === 'string' && url.startsWith('https://') ? link(text,url) : element('span',text);
}
function ledger(book) {
  const filename = files[book.key === 'original' ? 'original' : 'overlap'];
  return 'https://github.com/Usubillaga/InvestorAce-Tradingdesk/blob/main/dist/'+filename;
}
function table(headers, rows) {
  const grid = element('table'), head = grid.createTHead().insertRow(), body = grid.createTBody();
  for (const text of headers) {const th=element('th',text);th.scope='col';head.append(th);}
  for (const row of rows) {
    const tr = body.insertRow();
    for (const value of row) tr.insertCell().append(value);
  }
  return grid;
}
function scrollTable(headers, rows) {
  const scroll = element('div', undefined, 'scroll');
  scroll.tabIndex = 0;
  scroll.append(table(headers,rows));
  return scroll;
}
function metrics(entries, compact=false) {
  const list = element('dl',undefined,compact?'metrics':'');
  for (const [label,value] of entries) {
    const terms = [element('dt',label),element('dd',value)];
    if (compact) {const group=element('div');group.append(...terms);list.append(group);}
    else list.append(...terms);
  }
  return list;
}
function stateLabel(book) {
  if (book.pending) return t.pending+' · '+t[book.pending.side];
  return book.entry ? t.invested : t.cashState;
}
function nextStep(book) {
  if (book.pending) return t.target+' · '+book.pending.target;
  if (!book.entry) {
    const selection = journals.overlap?.selection;
    if (book.size && selection && selection.candidates.length < book.size) return t.blocked;
    return t.wait;
  }
  if (book.eligible && book.asOf < book.eligible) return t.locked+' '+book.eligible+'.';
  return t.sellRule;
}
function balanceDate(book) {
  if (book.start) {
    const launchDay = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/New_York'}).format(new Date(book.start));
    if (book.asOf < launchDay) return [t.openingBalance, launchDay];
  }
  return [t.asOf, book.asOf];
}
function card(key, book) {
  const section=element('section',undefined,'book');
  section.dataset.key=key;
  section.append(element('h2',labels[key]));
  if (!book) {section.append(element('p',t.unavailable));return section;}
  const gain = book.nav / book.initial - 1;
  section.append(element('span',stateLabel(book),'state'),element('strong',money(book.nav),'amount'),
    element('span',t.result+' '+money(book.nav-book.initial)+' ('+pct(gain)+')','delta '+(gain<0?'negative':gain>0?'positive':'')),
    metrics([[t.cash,money(book.cash)],[t.holdings,String(book.holdings.length)],[t.rule,t.below+' 20']]),
    element('p',t.next+' · '+nextStep(book),'next'),element('p',balanceDate(book).join(' · '),'meta'),
    link(t.show,'#account-'+key));
  return section;
}
function paintThermometer() {
  const s = PaperModel.latestReading(journals.original,journals.overlap);
  if (!s) {el('gap').textContent=t.noReading;return;}
  el('reading').textContent=fmt.format(s.heat);
  el('reading-source').replaceChildren(sourceLink((s.intraday?t.intraday:t.close)+' · '+when(s.as_of),s.url));
  el('marker').hidden=false;
  el('marker').style.left=Math.max(0,Math.min(100,s.heat))+'%';
  const gap = s.heat - 20;
  el('gap').textContent=t.measured+' · '+(gap>0?fmt.format(gap)+' '+t.distance:gap===0?t.boundary:t.zone);
}
function openPositions(book) {
  if (!book.holdings.length) return element('p',t.empty);
  return scrollTable([t.security,t.weight,t.position,t.basis,t.pnl,t.price,t.units],book.holdings.map(h => [
    h.symbol,pct(h.value/book.nav),money(h.value),money(h.cost),money(h.value-h.cost),money(h.price),
    h.units.toLocaleString(lang,{maximumFractionDigits:5})
  ]));
}
function entries(book) {
  const events=[...book.events].reverse();
  if (book.pending) events.unshift({day:book.pending.target,status:book.pending.side,order:book.pending});
  if (!events.length) return element('p',t.waiting);
  const list=element('ol');
  for (const event of events) {
    const a=PaperModel.audit(event);
    const item=element('li');
    item.append(element('strong',t[a.status]+' · '+a.day+(a.symbols.length?' · '+a.symbols.join(' / '):'')));
    const signal = a.signalTime ? when(a.signalTime) : a.dayOfSignal || '—';
    const source = a.source ? sourceLink(t.readingLink,a.source) : link(t.sourceMissing,ledger(book));
    const trail=element('p',undefined,'meta');
    trail.append(t.signal+' '+signal+' · '+(Number.isFinite(a.heat)?fmt.format(a.heat)+'/100 · ':''),
      t.posted+' '+when(a.submitted)+' · ',source);
    item.append(trail);
    list.append(item);
  }
  return list;
}
function detailView(book) {
  const frag=document.createDocumentFragment();
  frag.append(element('h3',labels[book.key]),element('p',book.size?t.overlapRule:t.originalRule));
  const stats=[[t.initial,money(book.initial)],balanceDate(book),[t.fee,pct(0.001)]];
  if (book.start) stats.push([t.started,when(book.start)]);
  if (book.entry) stats.push([t.open,book.entry]);
  frag.append(metrics(stats,true),element('h3',t.holdings),openPositions(book),element('h3',t.bench),
    metrics(Object.entries(book.controls).map(([name,value])=>[name,money(value)+' · '+pct(value/book.initial-1)]),true),
    element('h3',t.history),entries(book));
  for (const warning of book.warnings) frag.append(element('p',t.checks+' · '+(warning==='NO_NEW_READING'?t.noNew:warning),'notice'));
  if (book.missed.length) frag.append(element('p',t.missed+' · '+book.missed.join(', '),'notice'));
  const line=element('p',undefined,'meta');
  line.append(link(t.ledger,ledger(book)));
  if (snapshot[book.size?'overlap':'original']) line.append(' · '+t.local);
  frag.append(line);
  return frag;
}
function selected() {
  const key=location.hash.replace('#account-','');
  return order.includes(key) ? key : '5';
}
function paintDetail(scroll=false) {
  const key=selected();
  for (const button of el('account-tabs').children) button.setAttribute('aria-pressed',String(button.dataset.key===key));
  const book=books[key];
  el('detail').replaceChildren(book?detailView(book):element('p',t.unavailable));
  if (scroll) el('account').scrollIntoView({block:'start'});
}
function candidates(state) {
  const selection=state?.selection;
  el('sources').replaceChildren();
  if (!selection) {el('ranking').textContent=t.noWeights;return;}
  const ranked=selection.candidates;
  el('ranking').replaceChildren(table(['#',t.security,'SPY','QQQ',t.five,t.six],ranked.map((c,i)=>[
    String(i+1),c.classes.join(' / ')+' · '+c.name,pct(c.weights.SPY),pct(c.weights.QQQ),
    ranked.length>=5 && i<5?pct(1/5):'—',ranked.length>=6 && i<6?pct(1/6):'—'
  ])));
  el('sources').append(t.selection+' · '+when(selection.checked));
  for (const [fund,src] of Object.entries(selection.sources)) el('sources').append(' · ',sourceLink(fund+' '+src.date,src.url));
}
let books={};
function paint() {
  books={};
  if (journals.original) books.original=PaperModel.original(journals.original);
  if (journals.overlap) for (const size of [5,6]) books[size]=PaperModel.concentrated(journals.overlap,size);
  el('books').replaceChildren(...order.map(key=>card(key,books[key])));
  paintThermometer();
  paintDetail();
  candidates(journals.overlap);
}
async function read(url) {
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(6500)});
  if (!r.ok) throw Error(String(r.status));
  return r.json();
}
async function loadJournal(kind) {
  // Paint bundled data immediately. A newer journal date always takes precedence.
  const receive=async (url,local) => {
    const s=await read(url);
    if (s.schema!==1 || !s.as_of || (kind==='original' ? !Number.isFinite(s.equity) : !s.books?.[5]||!s.books?.[6])) throw Error('schema');
    const old=journals[kind];
    if (old && (old.as_of>s.as_of || (old.as_of===s.as_of && !snapshot[kind] && local))) return;
    journals[kind]=s;snapshot[kind]=local;paint();
  };
  await Promise.allSettled([receive(files[kind],true),receive(desk+files[kind],false)]);
}
async function references() {
  const names=['index-leaders.json','index-leaders-17.json','index-leaders-17-spcx-ant.json'];
  const rows=await Promise.all(names.map(async (name,i) => {
    const label=sourceLink(i===2?t.special:t.mix,'https://github.com/Usubillaga/InvestorAce/blob/main/paper_trades/'+name);
    try {
      const account=await read(claude+name), mark=account.marks.at(-1), cur=account.currency||'USD';
      if (!mark || !Number.isFinite(mark.equity)) throw Error('valuation');
      const spec=(account.basket_spec||[]).map(([symbol,w])=>pct(w)+' '+(symbol==='top10'?'Top 10':symbol)).join(' + ');
      return [label,t.below+' '+account.level,spec,money(account.capital,cur),money(mark.equity,cur),money(account.cash,cur),pct(mark.equity/account.capital-1),mark.date];
    } catch {return [label,'—',t.unavailable,'—','—','—','—','—'];}
  }));
  el('external-accounts').replaceChildren(table([t.strategy,t.rule,t.allocation,t.initial,t.value,t.cash,t.result,t.dated],rows));
}

document.documentElement.lang=lang;
document.title=t.title+' · InvestorAce';
for (const item of document.querySelectorAll('[data-i]')) item.textContent=t[item.dataset.i];
document.querySelector('[hreflang="'+lang+'"]').setAttribute('aria-current','page');
el('legacy-link').href=lang==='es'?'heat-leaders.html':'heat-leaders.en.html';
el('study-link').href='heat-comparison'+(lang==='es'?'':'.'+lang)+'.html';
for (const key of order) {
  const button=element('button',labels[key]);
  button.type='button';button.dataset.key=key;button.setAttribute('aria-controls','detail');
  button.addEventListener('click',()=>{history.replaceState(null,'','#account-'+key);paintDetail();});
  el('account-tabs').append(button);
}
el('books').addEventListener('click',event=>{
  const anchor=event.target.closest('a[href^="#account-"]');
  if (!anchor) return;
  event.preventDefault();
  history.pushState(null,'',anchor.hash);paintDetail(true);
  el('account-tabs').querySelector('[data-key="'+selected()+'"]').focus({preventScroll:true});
});
window.addEventListener('hashchange',()=>paintDetail(true));
paint();
for (const kind of Object.keys(files)) loadJournal(kind);
references();
