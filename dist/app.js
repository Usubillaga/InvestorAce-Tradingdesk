'use strict';

const $ = (q, root = document) => root.querySelector(q);
const main = $('#main');
const dialog = $('#dialog');
const symbols = {
  'panic-paper':'<path d="M3 16h4l3-10 4 14 3-9h4"/>',
  overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  active:'<path d="M3 12h4l3-7 4 14 3-7h4"/>', paper:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h4"/>',
  evidence:'<path d="M4 20V5m0 15h16M8 16v-4m4 4V8m4 8v-6m4 6V5"/>',
  score:'<path d="m12 3 2.4 5.9 6.4.5-4.9 4.2 1.6 6.3-5.5-3.4-5.5 3.4 1.6-6.3-4.9-4.2 6.4-.5z"/>',
  journal:'<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  alert:'<path d="m12 4 9 16H3zM12 10v4m0 3h.01"/>', link:'<path d="M10 7H5v13h13v-5M13 4h7v7m0-7-9 9"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  wallet:'<path d="M19 8V5H5a2 2 0 0 0-2 2v12h17V8H5m15 5h-5v3h5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', filter:'<path d="M4 5h16l-6 7v5l-4 2v-7z"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${symbols[name] || symbols.layers}</svg>`;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const de = new Intl.NumberFormat('de-DE', {maximumFractionDigits:2});
const moneyFormat = new Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR'});
const dt = new Intl.DateTimeFormat('de-DE', {dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Berlin'});
const dateOnly = new Intl.DateTimeFormat('de-DE', {dateStyle:'medium', timeZone:'UTC'});
const finite = v => typeof v === 'number' && Number.isFinite(v);
const n = v => finite(v) ? de.format(v) : 'Offen';
const eur = v => finite(v) ? moneyFormat.format(v) : 'Offen';
const pct = v => finite(v) ? `${n(v)} %` : 'Offen';
const day = v => v && !Number.isNaN(Date.parse(v)) ? dateOnly.format(new Date(v.slice(0,10))) : 'Offen';
const time = v => v && !Number.isNaN(Date.parse(v)) ? `${dt.format(new Date(v))} MEZ/MESZ` : 'Offen';
const present = v => v === null || v === undefined || v === '' ? 'Offen' : v;
const badge = (s, tone='soft') => `<span class="badge ${tone}">${esc(s)}</span>`;
const num = (value, type='n', status='Build-geprüft') => `<span class="mono" title="${esc(finite(value) ? status : 'Fehlender oder ungeprüfter Zahlenwert')}">${esc(({n,eur,pct}[type])(value))}</span>`;
const button = (text, action, kind='', attrs='') => `<button type="button" class="button ${kind}" data-action="${action}" ${attrs}>${text}</button>`;
const link = (url, label, cls='button small') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
const cells = (head, rows) => rows.length ? `<div class="table-wrap"><table><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<div class="empty"><h3>Keine Einträge für diese Auswahl</h3><p>Offene Werte erscheinen als „Offen“.</p></div>`;
const kv = entries => `<dl class="kv">${entries.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(present(value))}</dd></div>`).join('')}</dl>`;
const empty = (title, body) => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
const notice = html => `<div class="notice">${icon('alert')}<div>${html}</div></div>`;
const panelHead = (title,sub='',action='') => `<div class="panel-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${action}</div>`;
const strategyNames = {timing:'Opportunity + Timing', opportunity:'Opportunity', fundamental:'Fundamentals', 'v1.5':'Exit-Experiment v1.5', 'v1.6':'Exit-Experiment v1.6'};
const strategy = key => strategyNames[key] || present(key);
const navItems = [
  ['overview','Übersicht'],['panic-paper',DeskPanic.label()],['market','Markt & Intraday'],['active','Aktives Trading'],['paper','Paper-Trading'],['paper-round2',DeskRoundTwo.label()],
  ['long-short','Long / Short · Paper'],
  ['low-radar',DeskRadar.label()],['scanner','Scanner-Universum'],['evidence','Modellvergleich'],['score','Scorecard & Regime'],['journal','Journal & Reviews'],
];
const filters = [['all','Alle'],['open','Offene Trades'],['closed','Abgeschlossene'],['review','Review erforderlich'],['error','Datenfehler'],['conflict','Build-Konflikte']];
const stages = [['backtest','Backtest'],['frozen','Frozen-OOS'],['paper','Paper-Trading'],['paper-round2',DeskRoundTwo.label()],['live','Live-Beobachtung']];
const statusNames = {Open:'Offen', Pending:'Ausstehend', Blocked:'Einstieg gesperrt', Filled:'Ausgeführt', Rejected:'Abgelehnt', Expired:'Abgelaufen', Cancelled:'Storniert', Planned:'Geplant', Closed:'Abgeschlossen'};
const defaults = {page:'overview', evidence:'backtest', account:'all', window:0, mode:'trades', journalSource:'paper', filter:{}, queries:{}, regime:'REFLATION'};
let data;
let snapshotFailed = false;
let local = {trades:[], reviews:[], changes:[], rejected:[]};
let state = defaults;
let timer;
const fileKey = 'investorace-trading-desk-v1';

function notify(text) {
  $('#toast').textContent = text;
  clearTimeout(timer);
  timer = setTimeout(() => { $('#toast').textContent = ''; },3600);
}
function readLocal() {
  try {
    const obj = JSON.parse(localStorage.getItem(fileKey) || 'null');
    if (obj && ['trades','reviews','changes','rejected'].every(k=>Array.isArray(obj[k]))) {
      const trades = [];
      const ids = new Set();
      const rejected = obj.rejected.filter(row=>row && typeof row.id==='string');
      for (const [index, row] of obj.trades.entries()) {
        try {
          const trade = validateLive(row);
          check(!ids.has(trade.id), 'Trade-ID ist mehrfach vorhanden.');
          ids.add(trade.id);
          trades.push(trade);
        } catch (err) {
          const entry = rejectedTrade(`local-trade-${index}`, `Browser-Journal · Eintrag ${index+1}`, err, row);
          if (!rejected.some(e=>e.id===entry.id)) rejected.push(entry);
        }
      }
      local = {...obj, trades, rejected,
        reviews:obj.reviews.filter(r=>r && typeof r.target==='string'),
        changes:obj.changes.filter(c=>c && typeof c.target==='string')};
    }
  } catch (_) {
    notify('Lokale Daten konnten nicht gelesen werden. Der archivierte Bericht bleibt verfügbar.');
  }
}
function commitLocal(next) {
  try { localStorage.setItem(fileKey, JSON.stringify(next)); }
  catch (_) { notify('Lokaler Browser-Speicher ist nicht verfügbar.'); return false; }
  local = next;
  return true;
}
function route() {
  const [view, section] = location.hash.slice(1).split('/');
  state.page = navItems.some(([k])=>k===view) ? view : 'overview';
  if (state.page === 'evidence' && stages.some(([k])=>k===section)) state.evidence = section;
  if (state.page === 'journal' && ['reviews','checks','trades'].includes(section)) state.mode = section;
  if (state.page === 'journal' && !section) state.mode = 'trades';
}
function header(title, summary, meta='', eyebrow='Trading Desk') {
  return `<section class="hero"><div class="hero-text"><div class="eyebrow">${icon('active')} ${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(summary)}</p></div>${meta ? `<div class="hero-aside">${meta}</div>` : ''}</section>`;
}
function stat(label,value, tag, tone, hint, symbol, color='') {
  return `<div class="metric"><div class="metric-title">${esc(label)} ${icon(symbol)}</div><div class="metric-value ${color}">${esc(value)}</div>${badge(tag,tone)}<p class="fine">${esc(hint)}</p></div>`;
}
function tabs(items, selected, action) {
  return `<div class="tabs" role="group" aria-label="Ansicht wählen">${items.map(([value,label])=>`<button class="tab" type="button" data-action="${action}" data-key="${esc(value)}" aria-pressed="${value===selected}">${esc(label)}</button>`).join('')}</div>`;
}
function reviewFor(id) {
  const exact = local.reviews.find(r=>r.target===id);
  const legacyIssue = data.issues.find(x=>x.id===id && x.name==='Historisches aktives Paper-Konto' && x.kind==='Build-Konflikt');
  return exact || (legacyIssue && local.reviews.find(r=>r.target==='source-issue-0'));
}
const issues = () => [...data.issues, ...local.rejected];
const paperOrders = () => (data.paper?.orders || []).map(order =>
  order.status==='Pending' && order.side==='Buy' && !confirmedSwing(order)
    ? {...order, status:'Blocked', detail:'Einstieg nur bei bestätigter fundamentaler und technischer Übereinstimmung.'} : order);
const modelOrders = () => [...paperOrders(), ...(data.paper?.twins || []).flatMap(t=>t.orders)];
const validLive = () => local.trades.filter(t=>Object.hasOwn(data.builds,t.run));
const allTrades = () => [...modelOrders(), ...validLive()];
const journalTrades = () => state.journalSource==='paper' ? modelOrders() : validLive();
const openCount = () => paperOrders().filter(o=>o.status==='Pending').length;
const asOf = () => data.paper?.decisions.at(-1);
const paperStatus = 'Simulation · nachgerechnet';
const localStatus = 'Manuell · Quellenprüfung offen';

function swingExposure(account) {
  const buys=paperOrders().filter(o=>o.strategy===account.key && o.status==='Pending' && o.side==='Buy');
  const pendingCapital=buys.reduce((total,o)=>total+o.euros,0);
  const difference=account.pendingCapital-pendingCapital;
  const target=finite(account.target) && account.equity>0
    ? account.target-100*difference/account.equity : account.target;
  return {...account, pendingCapital, target};
}
function exposure(accounts = (data.paper?.accounts || []).map(swingExposure)) {
  if (!accounts.length) return empty('Modelljournal offen','Exposure erscheint nach einer vollständigen, verifizierten Entscheidung.');
  return `<div class="chart"><div class="chart-head"><div class="legend"><span><i class="swatch"></i> Ist</span><span><i class="swatch target"></i> Ziel</span></div>${badge('Simulation','info')}</div>
  ${accounts.map(a=>`<div class="chart-row"><strong>${esc(a.name)}</strong><div class="track" aria-hidden="true"><i class="target-fill" style="width:${Math.max(0,Math.min(100,a.target||0))}%"></i><i class="actual-fill" style="width:${Math.max(0,Math.min(100,a.actual||0))}%"></i></div><span class="nums">${num(a.actual,'pct',paperStatus)} <span class="muted">/</span> <em>${num(a.target,'pct',paperStatus)}</em></span></div>`).join('')}
  <div class="chart-row"><span></span><div class="ticks" aria-hidden="true"><span>0 %</span><span>25 %</span><span>50 %</span><span>75 %</span><span>100 %</span></div><span></span></div>
  <p class="chart-note">Ziel = Ist plus offene Käufe minus offene Verkäufe zum letzten Bewertungsstand. Stand ${day(asOf()?.session)}.</p></div>`;
}
function evidenceList() {
  const rows = [
    ['backtest','evidence','Backtest',data.backtest?.windows[0]?.window || 'Offen','Historisch','soft'],
    ['frozen','shield','Frozen-OOS',data.frozen.length ? 'Fixierte Regeln und Gewichte' : 'Keine geprüfte Kohorte','Archiv','info'],
    ['paper','paper','Paper-Trading','Prospektive Modellsimulation',data.paper?'Nachgerechnet':'Offen',data.paper?'good':'warn'],
    ['live','active','Live-Beobachtung','Manuell erfasste Beobachtungen','Prüfung offen','warn'],
  ];
  return `<div class="evidence-list">${rows.map(([key,glyph,title,subtitle,tag,tone])=>`<button class="evidence-row" type="button" data-action="stage" data-key="${key}"><span class="row-icon ${key==='paper'?'accent':''}">${icon(glyph)}</span><span><strong>${title}</strong><small>${esc(subtitle)}</small></span>${badge(tag,tone)}</button>`).join('')}</div>`;
}
function overview() {
  const known = !!data.paper;
  const decisions = asOf();
  const activeTrades = validLive().filter(t=>t.status==='Open').length;
  const issueCount = issues().length;
  return header('Trading-Übersicht','Positionen, Signale und offene Entscheidungen aus getrennten Handels- und Prüfbereichen.',
    `${badge(data.macro?.regime ? `Regime · ${data.macro.regime}` : 'Regime offen','info')}<span class="fine">Stand ${time(data.captured)}</span>`)
  + `<div class="summary-grid">
  ${stat('Aktive Live-Positionen',activeTrades?n(activeTrades):'Offen','Manuell · ungeprüft','warn',activeTrades?'Lokale Beobachtungen':'Brokerbestand offen','active','open')}
  ${stat('Paper-Konten',known?n(data.paper.accounts.length):'Offen',known?paperStatus:'Datenstatus offen',known?'good':'warn',known?'Getrennt finanziert':'Journal in Prüfung','wallet')}
  ${stat('Offene Paper-Orders',known?n(openCount()):'Offen',known?paperStatus:'Datenstatus offen',known?'good':'warn',known?`Signalstand ${day(decisions.session)}`:'Entscheidungen offen','clock','accent')}
  ${stat('Journal-Prüffälle',n(issueCount),'Prüfliste · Buildstand','soft',issueCount?'Isolierte Datensätze':'Keine isolierten Datensätze','shield',issueCount?'open':'')}
  </div>${marketPanel()}${sessionBook()}<div class="grid-main"><article class="panel">${panelHead('Paper-Exposure','Ziel- und Ist-Exposure je Modellkonto','<a class="button small" href="#paper">Paper-Report</a>')}${exposure()}</article>
  <article class="panel">${panelHead('Evidenzstand','Datenstatus je Prüfbereich')}${evidenceList()}</article></div>
  ${issueCount ? notice(`<strong>Journalprüfung.</strong> ${n(issueCount)} isolierte Quelle(n). <button data-action="checks" type="button">Prüfliste öffnen</button>.`) : ''}
  ${tradePanel('Paper-Orders','Simulierte Orders aus dem verifizierten Modelljournal',paperOrders(), 'overview',8)}`;
}
function matches(t, filter) {
  if (filter==='open') return ['Pending','Open','Planned'].includes(t.status);
  if (filter==='closed') return ['Filled','Closed','Rejected','Expired','Cancelled'].includes(t.status);
  if (filter==='review') return reviewFor(t.id)?.result !== 'Geprüft' && (t.manual || t.status!=='Closed');
  return filter==='all';
}
function chips(key, filtersList=filters) {
  return filtersList.map(([id,label])=>`<button type="button" class="chip" aria-pressed="${(state.filter[key] || 'all')===id}" data-action="filter" data-key="${key}" data-value="${id}">${label}</button>`).join('');
}
function findInput(key, placeholder='Ticker suchen') {
  return `<input class="search" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}" data-search="${key}" value="${esc(state.queries[key] || '')}" type="search">`;
}
function tradeRows(list, key, limit) {
  const filter = state.filter[key] || 'all';
  const search = (state.queries[key] || '').trim().toLowerCase();
  if (['error','conflict'].includes(filter)) {
    const section = key==='active' ? ['Live','Archiv'] : key==='paper' || key==='overview' ? ['Paper-Trading','Build'] : null;
    return issueTable(issues().filter(x=>(!section || section.includes(x.section)) && x.kind===(filter==='error'?'Datenfehler':'Build-Konflikt') && `${x.name} ${x.message}`.toLowerCase().includes(search)));
  }
  const selected = list.filter(t=>matches(t,filter) && `${t.ticker} ${strategy(t.strategy)} ${t.reason || ''}`.toLowerCase().includes(search));
  return cells(['Ticker','Strategie / Modell','Richtung','Status','Einstieg / Fill','Volumen','Datenstatus'],selected.slice(0,limit).map(t=>{
    const status = t.manual?localStatus:paperStatus;
    const economic = t.manual ? t.notional : t.euros;
    return [`<button class="table-link ticker" data-action="trade" data-key="${esc(t.id)}"><span class="asset">${esc(t.ticker.slice(0,2))}</span>${esc(t.ticker)}</button>`,
      `${esc(strategy(t.strategy))}<div class="fine">${esc(present(t.model))}</div>`,esc(({Buy:'Kauf',Sell:'Verkauf',BUY:'Kauf',SELL:'Verkauf',LONG:'Long',SHORT:'Short'})[t.side] || present(t.side)),
      badge(statusNames[t.status],t.status==='Pending' || t.status==='Planned'?'warn':t.status==='Rejected'?'bad':'soft'),
      t.manual ? (finite(t.entry)?num(t.entry,'n',status)+' '+esc(t.currency):'Offen') : t.close == null ? esc('Offen') : `${num(t.close,'n',status)} ${esc(t.currency)}`,
      num(economic,'eur',status), badge(status,t.manual?'warn':'info')];
  })) + (selected.length>limit ? `<div class="table-foot"><span>${n(limit)} von ${n(selected.length)} Einträgen</span><a href="#paper">Vollständiges Paper-Journal</a></div>` : '');
}
function tradePanel(title, sub, list, key, limit=Infinity, action='') {
  return `<article class="panel">${panelHead(title,sub,action)}<div class="controls">${chips(key)}${findInput(key)}</div><div id="table-result">${tradeRows(list,key,limit)}</div></article>`;
}
function issueTable(rows) {
  return cells(['Quelle','Bereich','Befund','Entscheidung'],rows.map(x=>[
      `<button class="table-link" data-action="issue" data-key="${esc(x.id)}">${esc(x.name)}</button>`,
      esc(x.section),badge(x.kind,x.kind==='Build-Konflikt'?'warn':'bad'),
      badge(reviewFor(x.id)?.result || 'Review erforderlich','soft')]));
}
function live() {
  const trades = validLive();
  const open = trades.filter(t=>t.status==='Open');
  return header('Aktives Trading','Live-Beobachtungen und offene Entscheidungen im lokalen Handelsjournal.',
    button(`${icon('plus')} Beobachtung erfassen`,'new-live','primary'),'Live-Beobachtung')
    + `<div class="summary-grid">
    ${stat('Aktiver Brokerbestand','Offen','Quellenprüfung offen','warn','Brokerabgleich ausstehend','active','open')}
    ${stat('Offene Beobachtungen',n(open.length),'Lokal · manuell','warn','Nur Einträge dieses Browsers','journal')}
    ${stat('Portfolio P&L','Offen','Quellenprüfung offen','warn','Brokerabrechnung offen','wallet','open')}
    ${stat('Gesamtrisiko','Offen','Quellenprüfung offen','warn','Depotbestand und Stopps offen','shield','open')}
    </div>${notice('Live-Einträge benötigen einen verifizierten Kontext-Build. Preise, Positionen und Ausführungen bleiben bis zum externen Abgleich manuell; der Desk sendet keine Orders.')}
    <div class="stack">${activePositions(open)}${liveSignals(trades)}${tradePanel('Live-Handelsjournal','Erfassen, prüfen und dokumentieren · Speicherung in diesem Browser',trades,'active')}
    <div class="section-gap">${decisionsPanel('Live-Entscheidungen',trades.filter(t=>t.decision && reviewFor(t.id)?.result!=='Geprüft').map(t=>[t.ticker,t.decision,t.id]))}</div></div>`;
}
function liveSignals(trades) {
  const signals = trades.filter(t=>t.signal && t.status!=='Closed');
  return `<article class="panel">${panelHead('Live-Signale','Manuell dokumentierte Beobachtungen')}
    ${signals.length ? cells(['Ticker','Signal / Trigger','Zeitpunkt','Datenstatus'],signals.map(t=>[
      `<button class="table-link ticker" data-action="trade" data-key="${esc(t.id)}">${esc(t.ticker)}</button>`,
      esc(t.signal),esc(time(t.observed)),badge(localStatus,'warn')])) : empty('Keine offenen Live-Signale','Signale lassen sich im Live-Handelsjournal erfassen.')}</article>`;
}
function decisionsPanel(title,list,sub='Offene Fragen und nächste dokumentierte Entscheidung') {
  return `<article class="panel">${panelHead(title,sub)}${list.length ? cells(['Bezug','Entscheidung','Review'],list.map(([name,text,id])=>[esc(name),esc(text),id?button('Prüfen','review','small',`data-key="${esc(id)}"`):badge('Offen','warn')])):empty('Keine Entscheidungen erfasst','Eine Entscheidung kann im Handelsjournal dokumentiert werden.')}</article>`;
}
function paperPage() {
  const p = data.paper;
  const d = asOf();
  const selection = (p?.accounts || []).filter(a=>state.account==='all' || a.key===state.account).map(swingExposure);
  const names = [['all','Alle Konten'],...Object.entries(strategyNames).slice(0,3)];
  const selectedOrders = paperOrders().filter(t=>state.account==='all' || t.strategy===state.account);
  const holdings = (p?.positions || []).filter(t=>state.account==='all' || t.strategy===state.account);
  const head = header('Paper-Trading','Kontostand und Orders werden aus dem archivierten Entscheidungsverlauf nachgerechnet.',link(data.pages.paper,'Originalbericht'),'Modellsimulation');
  const summary = selection.map(a=>`<article class="panel panel-pad"><h3>${esc(a.name)}</h3><div class="fine">${badge(paperStatus,'good')} · ${day(a.session)}</div><div class="details" style="padding:12px 0 0">${kv([['Kontowert',eur(a.equity)],['Cash',eur(a.cash)],['P&L',eur(a.pnl)],['Ist-Exposure',pct(a.actual)],['Ziel-Exposure',pct(a.target)],['Kauforders',eur(a.pendingCapital)],['Gebühren',eur(a.fees)],['Umsatz',eur(a.turnover)],['Kurslücken',a.gaps.join(', ') || 'Keine im Journal']])}${button('Entscheidungs-Build','build','small',`data-key="${esc(a.run)}"`)}</div></article>`).join('');
  return head + competitionPanel() + codexPaperPanel() + (p ? `${tabs(names,state.account,'account')}<div class="stack">
    <div class="card-grid">${summary}</div>
    <div class="grid-main" style="margin-bottom:0"><article class="panel">${panelHead('Ziel- und Ist-Exposure','Je Modellkonto in % des Eigenkapitals')}${exposure(selection)}</article>
    ${decisionsPanel('Signale & Entscheidungen',[[strategy('timing'),d.market==='CORRECTION'?'Neue Timing-Einstiege pausiert · S&P-500-Trend laut Journal':`Markttrend ${present(d.market)}`,null],['Nächster Lauf','Ausführungen, Kurslücken und EUR/USD im Folgebuild prüfen.',null]],`Journalentscheidung ${time(d.at)}`)}</div>
    <article class="panel">${panelHead('Gefüllte Paper-Positionen','Simulierte Bewertung aus dem Journal · P&L nach Einstiegsgebühr')}${holdings.length ? cells(['Ticker','Strategie','Einstieg','Ist-Gewicht','Positionswert','P&L','Bewertung'],holdings.map(h=>[
      `<button class="table-link" data-action="trade" data-key="${esc(h.orderId)}">${esc(h.ticker)}</button>`,esc(strategy(h.strategy)),
      `${num(h.entry,'n',paperStatus)} ${esc(h.currency)}`,num(h.weight,'pct',paperStatus),num(h.value,'eur',paperStatus),num(h.pnl,'eur',paperStatus),
      `${esc(day(h.dated))}<div class="fine">FX ${esc(day(h.fxDated))}</div>${button('Build','build','small',`data-key="${esc(h.markRun)}"`)}`])) : empty('Keine gefüllten Positionen am Journalstand','Ausstehende Orders sind in der Orderliste erfasst.')}</article>
    ${tradePanel('Paper-Orders','Ausstehende und abgeschlossene Orderereignisse',selectedOrders,'paper')}
    ${paperHistory(p.decisions)}${paperRules()}${paired()}${swingExperimentPanel()}${pairExperimentPanel()}
    </div>` : notice('Das Modelljournal ist offen oder isoliert. Die Scorecard und der Hauptreport sind unabhängig verfügbar.') + issueTable(issues().filter(x=>x.section==='Paper-Trading')));
}
function paperRules() {
  return `<article class="panel">${panelHead('Modellregeln und Eingabedaten','Codex Paper-Ledger v1 · Opportunity-Modellstand aus dem Entscheidungs-Build',link(`${data.source}/codex_trading.py`,'Quellcode'))}
  <div class="details"><ul class="list">
  <li><b>Fundamentals</b> und <b>Opportunity</b> zeigen den Verlauf der Vergleichskonten. Neue Einstiege sind gesperrt. Offene Positionen können den Ausstiegsregeln folgen.</li>
  <li><b>Opportunity + Timing</b> verlangt Fundamental- und Opportunity-Score ab 7 mit Buy oder Strong Buy, einen S&amp;P-500-Aufwärtstrend, einen Schluss über SMA 36/50/200 und 0 bis 3 ATR Abstand. Verkauf bei einem Score unter 6,5 oder bestätigtem Schluss unter SMA 200.</li>
  <li>Je Konto 10.000 € Startkapital, 12 % Zielbudget pro Kauf, höchstens acht Positionen und zwei je Sektor. Risiko am Stop und feste Kursziele bleiben offen, sofern kein Wert im jeweiligen Entscheidungsmodell vorliegt.</li>
  <li>Gebrochene Stücke zum nächsten verfügbaren Schluss nach dem Entscheidungstag in UTC, sieben Kalendertage Ordergültigkeit, 0,10 % Gebühr je Fill, lokale Total Returns und datierter EUR/USD-Kurs.</li></ul>
  <p><a href="https://github.com/Usubillaga/InvestorAce/blob/main/docs/analysis/swing-confirmation-2026-11-20.md" target="_blank" rel="noopener">Swing-Backtest · Pilot</a></p>
  <p>Die Nachrechnung verwendet den Code des Archiv-Commits und die Eingaben der verifizierten Entscheidungs-Builds. Die Regelversion des Paper-Ledgers und die archivierte Opportunity-Version stehen im Trade-Detail.</p></div></article>`;
}
function paired() {
  const twins = data.paper?.twins || [];
  if (!twins.length) return `<article class="panel">${panelHead('Exit-Experiment v1.5/v1.6','Prüfstatus des gepaarten Journals')}
    ${issueTable(issues().filter(i=>i.section==='Exit-Experiment'))}</article>`;
  return `<article class="panel">${panelHead('Gepaarter Exit-Vergleich im Paper-Konto','Ganze Stücke, fixer FX-Kurs und Kursrenditen im separaten Experiment.')}
  ${cells(['Regelversion','Kontowert','P&L in %','Fills','Ausstehend','Datenstatus'],twins.map(t=>[esc(t.version),num(t.value,'eur',paperStatus),num(t.return_pct,'pct',paperStatus),num(t.fills,'n',paperStatus),num(t.pending,'n',paperStatus),badge(paperStatus,'info')]))}
  <div class="details"><p>Die beiden Varianten laufen mit demselben Startkapital und Ausführungsmodell. v1.6 ergänzt ausschließlich den Failed-Breakout-Exit. Maßgeblich ist der datierte Journalstand.</p>${button('Vergleich der Regeln','stage','small','data-key="backtest"')}</div></article>`;
}


function evidencePage() {
  const title = header('Modellvergleich','Methodik und Ergebnisse je Evidenzstufe. Jede Stufe behält ihren Zeitraum und ihre Datenbasis.','','Modellprüfung');
  const content = {
    backtest: backtestPage, frozen: frozenPage, paper: () => `<div class="stack">${paired()}${paperRules()}<div><a class="button" href="#paper">Zum Paper-Handelsjournal</a></div></div>`,
    live: () => `<article class="panel">${panelHead('Live-Beobachtung','Manuelle Einträge · Brokerabgleich offen')}<div class="details">${kv([['Belegter Brokerbestand','Offen'],['Live-Rendite','Offen'],['Live-Drawdown','Offen'],['Broker/Marktdatenquelle','Offen']])}<a class="button" href="#active">Zum Live-Handelsjournal</a></div></article>`
  };
  return title + tabs(stages,state.evidence,'stage') + content[state.evidence]();
}
function backtestPage() {
  const b = data.backtest;
  if (!b) return notice('Backtest-Artefakt offen. Befund in Journal & Reviews.');
  const w = b.windows[state.window] || b.windows[0];
  const prior = w.models['v1.5'];
  const current = w.models['v1.6'];
  const difference = (value, unit='')=>`${value > 0 ? '+' : ''}${n(value)}${unit}`;
  return `<div class="stack"><article class="panel">${panelHead('Historischer Vergleich','Backtest · Repository-Artefakt · Eingabedaten revisionsanfällig',link(data.pages.backtest,'Originalbericht'))}
  <div class="controls"><label for="window">Zeitraum</label><select id="window" data-select="window">${b.windows.map((x,i)=>`<option value="${i}" ${i===state.window?'selected':''}>${esc(x.window)}</option>`).join('')}</select><span class="fine">${n(w.symbols)} Symbole · berechnet ${time(b.generated)}</span></div>
  ${cells(['Modell','CAGR','Max. Drawdown','Sharpe','Trades','Status'],[...Object.entries(w.models),['S&P 500',w.benchmark]].map(([v,m])=>[
  esc(v),num(m.cagr,'pct','Backtest · Repository-Artefakt'),num(m.max_drawdown,'pct','Backtest · Repository-Artefakt'),
  num(m.sharpe,'n','Backtest · Repository-Artefakt'),num(m.trades,'n','Backtest · Repository-Artefakt'),badge('Historische Simulation','soft')]))}
  <div class="details">${kv([['Δ CAGR v1.6 − v1.5',difference(current.cagr-prior.cagr,' Pp.')],
  ['Δ Max. Drawdown v1.6 − v1.5',difference(current.max_drawdown-prior.max_drawdown,' Pp.')],
  ['Δ Sharpe v1.6 − v1.5',difference(current.sharpe-prior.sharpe)]])}
  <p>Quelle ${link(`${data.source}/backtests/latest.json`,'Backtest-Artefakt','')}. Limitationen umfassen Survivorship Bias, revidierbare Kursdaten und Buchführung in Notierungswährung.</p></div></article>
  <article class="panel">${panelHead('Änderung von v1.5 zu v1.6','Regelstand aus active_rules.py und Backtest-Artefakt',link(`${data.source}/active_rules.py`,'Quellregel'))}
  ${cells(['Regel','v1.5','v1.6','Datenstatus'],[
    ['Failed-Breakout-Exit','Inaktiv','Schluss unter 97 % des gespeicherten Ausbruchsniveaus innerhalb von 10 erfassten Sitzungen','Experimentell · Quellcode'],
    ['Stop- und Trendlogik','Gemeinsame Basisregeln','Gemeinsame Basisregeln','Quellcode'],
    ['Risiko je Position','1 % Zielrisiko · Stop 8 % bzw. 5 % in Korrektur','1 % Zielrisiko · Stop 8 % bzw. 5 % in Korrektur','Modellparameter'],
    ['Gewinnsicherung','Break-even ab +10 %, Trailing bei +20 % unter definierten Bedingungen','Identische Parameter','Modellparameter'],
    ['Wahrscheinlichkeit des Ausstiegs','Offen','Offen','Nicht belegt']
  ].map(row=>row.map(esc)))}
  <div class="details"><p>Der Exit wird nach dem Stop und nach der Fast-Gain-Halteprüfung geprüft. Er setzt ein gespeichertes Ausbruchsniveau voraus. Der Vergleich unterstellt keine Trefferwahrscheinlichkeit.</p></div></article></div>`;
}
function frozenPage() {
  const items = data.frozen;
  return `<div class="stack">${items.length ? items.map(f=>`<article class="panel">${panelHead(f.name,'Fixierte Kohorte · Zwischenergebnis aus archivierten Notierungen',link(data.pages.oos,'Originalbericht'))}
    <div class="details">${kv([['Modell',f.model],['Einstieg',day(f.entry)],['Geplanter Ausstieg',day(f.exit)],
    ['Alle Positionen bewertet bis',day(f.valued_to)],['Eingefroren am',time(f.freezeAt)],['Modellrendite',pct(f.portfolio_return_pct)],['S&P 500',pct(f.benchmark_return_pct)],
    ['Relativrendite',finite(f.excess_vs_benchmark_pct)?`${n(f.excess_vs_benchmark_pct)} Pp.`:'Offen'],
    ['Datenstatus',`${({RUNNING:'Vorläufig',FINAL:'Final',PENDING:'Ausstehend'})[f.status] || f.status} · Archiv-Build geprüft`]])}
    <p>${esc(f.entryRule)} ${esc(f.weightRule)} ${esc(f.currencyNote)}</p>
    <div>${button('Signal-Build','build','small',`data-key="${esc(f.run)}"`)} ${button('Bewertungs-Build','build','small',`data-key="${esc(f.evaluationRun)}"`)} ${link(f.freezeUrl,'Einfrierung in Git')}</div></div>
    ${cells(['Ticker','Signal','Frozen-Score','Zielgewicht','Einstieg','Schluss zur Bewertung','Rendite'],f.legs.map(h=>[esc(h.ticker),esc(h.label),num(h.score),num(h.weight_pct,'pct'),
      `${num(h.entry_close)} ${esc(h.currency)}<div class="fine">${day(h.entry_close_date)}</div>`,
      `${num(h.exit_close)} ${esc(h.currency)}<div class="fine">${day(h.exit_close_date)}</div>`,num(h.return_pct,'pct')]))}</article>`).join('') : notice('Keine Kohorte ist vollständig mit einem verifizierten Signal-Build verbunden.')}
    <article class="panel">${panelHead('Einordnung','Datenstatus je Kohorte')}<div class="details"><p>Signal- und Bewertungs-Builds sind archiviert und geprüft. Die Rendite bleibt während des Fensters vorläufig. Auswahl, Gewichte und Termine wurden gegen die Vorabfestlegung in Git abgeglichen. Die Bewertung verwendet je Sitzung den ersten verfügbaren archivierten Schlusskurs.</p></div></article></div>`;
}
const issuerReports = {
  FPS: ['Forgent Power Solutions', 'earnings/fps-deep-dive-2026-11-25.html'],
  JD: ['JD.com', 'earnings/jd-deep-dive-2026-11-25.html'],
  BIDU: ['Baidu', 'earnings/bidu-deep-dive-2026-11-25.html']
};
function scorePage() {
  const regimes = ['GOLDILOCKS','REFLATION','INFLATION','STAGFLATION','RECESSION'];
  const macro = data.macro;
  return header('Scorecard & Regime-Fit',`Archivierter Stand vom ${time(data.captured)}.`,link(data.pages.home,'Aktuelles InvestorAce-Scoreboard öffnen','button'),'Research')
  + `<div class="stack"><article class="panel">${panelHead('Makro-Snapshot','Research · archivierte Modellbeobachtung')}
    <div class="details">${kv([['Regime',macro?.regime],['Fensterende',day(macro?.regime_input?.end)],['Fenster',finite(macro?.regime_input?.sessions)?`${n(macro.regime_input.sessions)} Sitzungen`:'Offen'],['Datenbasis',macro?.source],['Nachweis','Berichts-Build geprüft']])}
    <p>Fundamental-Score, Opportunity-Signal, Regime-Fit und Analystenstatus werden getrennt angezeigt. Jede Zeile beschreibt den Snapshot-Zeitpunkt.</p></div></article>
    <article class="panel">${panelHead('Deep Dives','25.11.2026 · ES / EN / DE')}
      <div class="details">${Object.values(issuerReports).map(([name,url])=>link(url,name)).join(' ')}</div></article>
    <article class="panel">${panelHead('Unternehmen','Research-Snapshot · Werte aus dem Originalmodell')}
      <div class="controls"><label for="regime">Regime-Fit</label><select id="regime" data-select="regime">${regimes.map(r=>`<option ${r===state.regime?'selected':''}>${r}</option>`).join('')}</select>${findInput('score','Ticker oder Firma suchen')}</div>
      <div id="table-result">${scoreRows()}</div></article></div>`;
}
function signalState(opp, now=Date.now()) {
  if (!opp.label) return 'Kein archiviertes Label';
  const expiry = Date.parse(opp.expires_at);
  if (!Number.isFinite(expiry)) return 'Gültigkeitsfrist offen';
  return now > expiry ? 'Abgelaufen · Archivwert' : `Archiviert · Frist bis ${time(opp.expires_at)}`;
}
function opportunityScore(opp) {
  if (finite(opp.score)) return n(opp.score);
  return finite(opp.score_lower) && finite(opp.score_upper)
    ? n(opp.score_lower) + '–' + n(opp.score_upper) : 'Offen';
}
function scoreRows() {
  const q = (state.queries.score || '').trim().toLowerCase();
  const records = data.scorecard.filter(r=>`${r.ticker} ${instrumentName(r)} ${r.sector}`.toLowerCase().includes(q));
  if (!records.length && q) return empty('Kein Treffer im archivierten Scoreboard', 'Stand vom '+time(data.captured))+link(data.pages.home,'Vollständiges InvestorAce-Scoreboard öffnen','button');
  return cells(['Ticker','Unternehmen','Fundamental (Altmodell)','Opportunity','Signal im Archiv','Regime-Fit','Analystenstatus'],records.map(r=>[
    `<button class="table-link ticker" data-action="score" data-key="${esc(r.ticker)}">${esc(r.ticker)}</button>`,esc(instrumentName(r)),
    num(r.score,'n','Archivierter Fundamental-Score · Altmodell'),esc(opportunityScore(r.opportunity)),
    `${r.cashOffer ? 'Barangebot · '+n(r.cashOffer.spread_pct)+' % Bruttospread' : esc(present(r.opportunity.label))}<div class="fine">${esc(signalState(r.opportunity))}</div>`,num(r.regime[state.regime],'n','Archivierter Regime-Fit · Modell'),
    badge(r.review==='REVIEW_REQUIRED'?'Review erforderlich':present(r.review),r.review==='REVIEW_REQUIRED'?'warn':'soft')]));
}
function journal() {
  const menu = tabs([['trades','Trade-Historie'],['reviews','Review-Historie'],['checks','Daten- & Build-Prüfung']],state.mode,'mode');
  const action = button(`${icon('download')} Exportieren`,'export');
  const reviews = local.changes.filter(x=>x.kind==='Review');
  return header('Journal & Reviews','Filterbare Handels- und Prüfhistorie mit Build-Bezug.',action,'Nachvollziehbarkeit') + menu + ({
    trades: () => `${tabs([['paper','Modell-Orders'],['live','Live-Journal']],state.journalSource,'journal-source')}${tradePanel('Trade-Historie',state.journalSource==='paper'?'Archivierte Modell-Orders':'Manuelle Live-Aufzeichnungen',journalTrades(),'journal')}
      <article class="panel section-gap">${panelHead('Änderungsverlauf','Lokale Live-Einträge und Review-Entscheidungen')}${historyRows(local.changes)}</article>`,
    reviews: () => `<article class="panel">${panelHead('Review-Historie','Lokale Prüfvermerke · Quellenstatus der Daten bleibt erhalten.')}${historyRows(reviews)}</article>`,
    checks: () => `<article class="panel">${panelHead('Isolierte Datenquellen','Fehlerhafte oder unvollständige Journale erscheinen ausschließlich in der Prüfliste.')}
      <div class="controls">${chips('checks',[['all','Alle'],['review','Review erforderlich'],['error','Datenfehler'],['conflict','Build-Konflikte']])}${findInput('checks','Quelle suchen')}</div>
      <div id="table-result">${checkRows()}</div></article>`
  })[state.mode]();
}
function checkRows() {
  const q = (state.queries.checks || '').trim().toLowerCase();
  const f = state.filter.checks || 'all';
  return issueTable(issues().filter(x=>(f==='all' || (f==='review' && reviewFor(x.id)?.result!=='Geprüft') ||
      (f==='error' && x.kind==='Datenfehler') || (f==='conflict' && x.kind==='Build-Konflikt'))
      && `${x.name} ${x.message}`.toLowerCase().includes(q)));
}
function historyRows(rows) {
  return cells(['Zeitpunkt','Eintrag','Änderung','Notiz','Status'],rows.slice().reverse().map(x=>[
    esc(time(x.at)),esc(x.target),esc(x.result || x.kind),
    x.previous && x.next ? `<details><summary>${esc(x.note)}</summary>${kv(Object.entries(x.previous).map(([key,value])=>[
      key,`${present(value)} → ${present(x.next[key])}`]))}</details>` : esc(present(x.note)),
    badge('Lokal · manuell','warn')]));
}
function paint(focus=false) {
  const nav = $('#nav');
  if (!nav.children.length) {
    nav.innerHTML = navItems.map(([key,title],i)=>
      (i===0?'<span class="nav-label">Arbeitsbereich</span>':key==='paper'?'<span class="nav-label">Analyse & Prüfung</span>':'')+
      `<a class="nav-item" href="#${key}">${icon(key)}<span>${esc(title)}</span></a>`).join('');
  }
  nav.querySelector('[href="#panic-paper"] span').textContent = DeskPanic.label();
  const active = nav.querySelector(`[href="#${state.page}"]`);
  if (!active.hasAttribute('aria-current')) {
    nav.querySelector('[aria-current]')?.removeAttribute('aria-current');
    active.setAttribute('aria-current','page');
  }
  $('#crumb').textContent = active.textContent;
  if (data) {
    $('#top-status').textContent = data.current?'Build verifiziert':'Build offen';
    $('#build-top').classList.toggle('missing',!data.current);
    $('#export-top').innerHTML = icon('download')+' Exportieren';
    $('#original').innerHTML = icon('link')+' InvestorAce Hauptreport';
    $('#footer-data').textContent = data.captured ? `Archivierter Datenstand · ${time(data.captured)}` : 'Archivierter Datenstand · offen';
  }
  if (state.page==='panic-paper') {
    DeskPanic.mount(main,location.hash.split('/')[1]);
  } else if (state.page==='low-radar') {
    DeskRadar.mount(main);
  } else if (state.page==='paper-round2') {
    DeskRoundTwo.mount(main);
  } else if (!data) {
    main.innerHTML=snapshotFailed ? notice('Der archivierte Datensatz konnte nicht geladen werden. <a href="https://usubillaga.github.io/InvestorAce/">InvestorAce-Hauptreport öffnen</a>.') :
      '<div class="loading" role="status">InvestorAce-Daten werden geladen …</div>';
  } else main.innerHTML = ({overview,market:()=>header('Markt & Intraday','Indexkurse, Marktbreite und regelbasierte Paper-Ausführungen.')+marketPanel()+sessionBook(),scanner:scannerPage,active:live,paper:paperPage,'long-short':()=>header('Long / Short','Automatisches Paper-Konto von InvestorAce.')+codexPaperPanel()+competitionPanel(),evidence:evidencePage,score:scorePage,journal})[state.page]();
  if (focus) main.focus({preventScroll:true});
}
function show(title, content) {
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = content;
  if (!dialog.open) dialog.showModal();
}
function showBuild(run) {
  const b = run && data.builds[run];
  if (!b) return show('Build-Nachweis',notice('Offen. Zu diesem Eintrag liegt kein verifizierter Build vor.'));
  const m = b.manifest;
  show('Build-Nachweis',`${badge('Build verifiziert','good')}<p class="muted">Manifest, Beobachtung, Hauptreport und Modell-Bundle wurden gegen die veröffentlichte Build-Kette geprüft.</p>
  ${kv([['Build-ID',m.run_id],['Erfasst',time(b.captured)],['Archiv-Commit',data.commit],['Modell-SHA-256',m.model_source_sha256],
  ['Beobachtungs-SHA-256',m.observation_sha256],['Report-SHA-256',m.report_sha256]])}
  <div>${link(b.url,'Archivquellen öffnen')} ${link(data.pages.home,'Hauptreport öffnen')}</div>`);
}
function showTrade(id) {
  const t = allTrades().find(x=>x.id===id);
  if (!t) return;
  const i = t.inputs || {};
  const position = data.paper?.positions.find(h=>h.orderId===t.id);
  const review = reviewFor(id);
  const pnl = t.manual ? t.pnl : t.realized ?? position?.pnl;
  const buy = ['Buy','BUY'].includes(t.side);
  const sell = ['Sell','SELL'].includes(t.side);
  const rule = t.manual ? t.model : t.strategy.startsWith('v1.') ? t.model : 'Codex Paper-Ledger v1';
  const proof = t.manual ? '' : link(`https://github.com/Usubillaga/InvestorAce/blob/${data.paper.ruleCommit}/${t.strategy.startsWith('v1.')?'active_rules.py':'codex_trading.py'}`,'Regelcode im Archiv-Commit');
  show(`${t.ticker} · ${strategy(t.strategy)}`,`${badge(t.manual?localStatus:paperStatus,t.manual?'warn':'good')}
  ${kv([['Modellversion',t.model],['Regelversion',rule],
  ['Status',statusNames[t.status]],['Zeitpunkt',time(t.observed || t.submitted)],['Signal',t.manual?t.signal:i.signal],
  ['Einstieg',finite(t.entry)?`${n(t.entry)} ${t.currency}`: buy && finite(t.close)?`${n(t.close)} ${t.currency}`:'Offen'],
  ['Stop',finite(t.stop)?`${n(t.stop)} ${t.currency}`:'Offen'],['Ziel',finite(t.target)?`${n(t.target)} ${t.currency}`:'Offen'],
  ['Ausstieg',finite(t.exit)?`${n(t.exit)} ${t.currency}`: sell && finite(t.close)?`${n(t.close)} ${t.currency}`:'Offen'],
  ['Zielbudget / Exposure',t.manual?pct(t.targetExposure):finite(t.budgetPct)?`${pct(t.budgetPct)} des Kontowerts · Modellparameter`:'Offen'],
  ['Ist-Gewicht der Position',t.manual?pct(t.actualExposure):pct(position?.weight)],[sell?'Realisiertes P&L':position?'Offenes P&L':'P&L',eur(pnl)],['Risiko am Stop',eur(t.risk)],
  ['Fill-Tag',day(t.day)],['EUR/USD am Fill',finite(t.fx)?n(t.fx):'Offen'],['Order gültig bis',day(t.expires)],['Entscheidung',t.decision || t.reason],
  ['Review',review?.result || 'Review erforderlich'],['Orderhinweis',t.detail]])}
  <h3>Eingabedaten · ${t.manual?'Manuell, Prüfung offen':'Archivierter Entscheidungssnapshot'}</h3>
  ${t.manual ? kv([['Quelle',t.inputSource],['Annahmen',t.assumption]]) : kv([
    ['Opportunity-Modell',i.scoreVersion],['Basisscore',n(i.fundamental)],['Opportunity',n(i.opportunity)],['Quote',time(i.quote_observed_at)],
    ['Signalfrist am Entscheidungsstand',time(i.signalExpiry)],['Quote-Status zur Entscheidung',i.quoteStatus],['Finanzperiode',day(i.financial_period)],
    ['Kursbasis',i.price_basis],['Letzte Indikator-Kerze',day(i.last_bar)],['SMA 36',n(i.sma36)],['SMA 50',n(i.sma50)],
    ['SMA 200',n(i.sma200)],['ATR-Extension',n(i.extension_atr)],['Trend',i.trend],['Ausbruchsniveau',n(t.resistance || i.resistance)],
    ['Inputs-SHA-256',i.input_sha256],['Datenanbieter',i.source]])}
  <div>${button(t.manual?'Kontext-Build':'Entscheidungs-Build','build','small',`data-key="${esc(t.run)}"`)}
    ${t.executionRun?button('Ausführungsnachweis','build','small',`data-key="${esc(t.executionRun)}"`):''} ${proof}
    ${button('Review erfassen','review','small',`data-key="${esc(t.id)}"`)}
    ${t.manual?button('Beobachtung ändern','edit-live','small',`data-key="${esc(t.id)}"`):''}</div>
  <h3>Änderungsverlauf</h3>
  ${t.manual ? '' : orderHistory(t.history)}
  ${historyRows(local.changes.filter(x=>x.target===t.id))}`);
}

function orderHistory(history) {
  return cells(['Im Journal erfasst','Status','Kursdatum','Nachweis'],(history || []).map(e=>{
    const {status, day:fillDay, fill_date, detail} = e.evidence;
    const title = statusNames[status] || statusNames[status[0]+status.slice(1).toLowerCase()] || status;
    return [esc(time(e.at)),`${esc(title)}${detail?`<div class="fine">${esc(detail)}</div>`:''}`,
      esc(day(fillDay || fill_date)),button('Build','build','small',`data-key="${esc(e.run)}"`)];
  }));
}
function shortInterestDetails(position) {
  const title = '<h3>Short Interest · gemeldete Positionierung</h3>';
  if (!position) return title+'<p class="fine">Kein datierter Wert im zugehörigen Build.</p>';
  if (position.status==='REVIEW_REQUIRED') {
    return title+`<p class="fine">Stichtag ${day(position.settlement_date)} · auffälliger Rückgang im Anbieterwert. Prüfung offen.</p>`;
  }
  return title+kv([
    ['Stichtag',day(position.settlement_date)],['Leerverkaufte Aktien',n(position.shares)],
    ['Anteil am Streubesitz',pct(position.pct_float)],['Tage zur Eindeckung',n(position.days_to_cover)],
    ['Veränderung ggü. Vormonat',pct(position.change_pct)],
    ['Quelle',position.source==='YAHOO_EXCHANGE_REPORTED'?'Yahoo Finance · gemeldeter Börsenwert':position.source]
  ])+'<p class="fine">Die Positionierung fließt nicht in den Score oder das Einstiegssignal ein.</p>';
}
function cashMillions(value, currency) {
  return finite(value) && currency ? n(value/1e6)+' Mio. '+currency : 'Offen';
}
function showScore(ticker) {
  const r = data.scorecard.find(x=>x.ticker===ticker);
  if (!r) return;
  show(`${r.ticker} · ${instrumentName(r)}`,`${badge('Research · Berichts-Build geprüft','info')}
  ${kv([['Fundamental-Score (Altmodell)',n(r.score)],['Opportunity-Score',opportunityScore(r.opportunity)],['Signal im Archiv',r.opportunity.label],
    ['Signalgültigkeit',signalState(r.opportunity)],['Unternehmensprofil',r.opportunity.profile?.tags?.join(', ')],
    ['Modell',r.opportunity.version || r.opportunity.schema],['Analystenstatus',r.review],['Kurs',finite(r.price)?`${n(r.price)} ${r.currency}`:'Offen'],
    ['Kursstand',time(r.inputs.quote_observed_at)],['Normalisierung',r.inputs.normalization_status],['Cashflow-Basis',r.inputs.cash_flow_basis]])}
  ${r.cashOffer ? '<h3>Barangebot</h3>'+kv([['Angebot je Aktie',n(r.cashOffer.price)+' '+r.currency],
    ['Bruttospread zum archivierten Kurs',pct(r.cashOffer.spread_pct)],['Referenzkurs vor Bekanntgabe',n(r.cashOffer.reference_close)+' '+r.currency],
    ['Rückkehr zum Referenzkurs (Szenario)',pct(r.cashOffer.reference_return_pct)],['Konditionen geprüft',day(r.cashOffer.reviewed)]]) : ''}
  ${kv([['No-Growth Value je Aktie',n(r.valuation?.ngv)],['Kursdeckung',pct(finite(r.valuation?.cover)?100*r.valuation.cover:null)],
    ['Berichtsperiode',r.inputs.financial_period],['FCF',cashMillions(r.valuation?.cashFlow,r.valuation?.currency)],
    ['Bewertungs-Cashflow',cashMillions(r.valuation?.valuationCashFlow,r.valuation?.currency)],
    ['Eingepreistes FCF-Wachstum (5 Jahre)',pct(r.valuation?.impliedGrowth)]])}
  ${shortInterestDetails(shortPosition(r.ticker))}
  ${issuerReports[ticker] ? link(issuerReports[ticker][1], 'Deep dive · ES / EN / DE') : ''}
  <h3>Fundamentale Komponenten</h3>${cells(['Komponente','Wert','Gewicht','Beitrag'],r.components.map(c=>[esc(c.label),num(c.value),num(finite(c.nominal_weight)?c.nominal_weight*100:null,'pct'),num(c.contribution)]))}
  <h3>Regime-Fit · archiviertes Modell</h3>${cells(['Regime','Fit','Sektor','Bilanz','Duration','Ausschüttung'],Object.entries(r.regime).map(([k,v])=>[esc(k),num(v),...['sector','balance','duration','payout'].map(c=>num(r.regimeComponents[k]?.[c]))]))}
  <h3>Offene Einwände</h3>${r.issues.length ? `<ul class="list">${r.issues.map(x=>`<li>${esc(x.message)}</li>`).join('')}</ul>` : '<p class="fine">Erfassung offen, falls kein Einwand dokumentiert ist.</p>'}
  <div>${button('Berichts-Build','build','small',`data-key="${data.current}"`)} ${link(data.pages.home,'InvestorAce Scoreboard')}</div>`);
}
function showIssue(id) {
  const x = issues().find(i=>i.id===id);
  if (!x) return;
  show(x.name,`${badge(x.kind,'warn')}<p>${esc(x.message)}</p>
  ${kv([['Bereich',x.section],['Build-Zuordnung','Offen'],['Review',reviewFor(id)?.result || 'Review erforderlich']])}
  ${x.raw !== undefined ? `<details><summary>Isolierten Eintrag ansehen</summary><pre class="raw">${esc(JSON.stringify(x.raw,null,2))}</pre></details>` : ''}
  <div>${button('Review erfassen','review','small',`data-key="${esc(id)}"`)}</div>`);
}


const manualNumbers = ['entry','stop','target','exit','targetExposure','actualExposure','notional','pnl','risk'];
function check(condition, message) { if (!condition) throw new Error(message); }
function rejectedTrade(id, name, error, raw) {
  return {id, section:'Live', name, at:new Date().toISOString(), raw,
    kind:error.message.startsWith('Build-Konflikt')?'Build-Konflikt':'Datenfehler', message:error.message};
}
function validateLive(t) {
  check(t && typeof t === 'object' && !Array.isArray(t),'Ungültiges Trade-Format.');
  check(typeof t.id==='string' && /^[0-9a-f-]{36}$/i.test(t.id),'Trade-ID fehlt oder ist ungültig.');
  check(typeof t.run==='string' && Object.hasOwn(data.builds,t.run),'Build-Konflikt: Build fehlt im verifizierten Archiv.');
  check(typeof t.ticker==='string' && /^[A-Z0-9][A-Z0-9.^=-]{0,15}$/.test(t.ticker),'Ticker fehlt oder ist ungültig.');
  check(['Planned','Open','Closed'].includes(t.status) && ['LONG','SHORT'].includes(t.side),'Status oder Richtung ungültig.');
  check(typeof t.currency==='string' && /^[A-Z]{3}$/.test(t.currency),'Gültigen Währungscode eintragen.');
  check(typeof t.observed==='string' && Number.isFinite(Date.parse(t.observed)),'Beobachtungszeitpunkt fehlt.');
  check(Date.parse(t.observed)>=Date.parse(data.builds[t.run].captured),'Build-Konflikt: Der Kontext-Build wurde erst nach der Beobachtung erfasst.');
  for(const k of ['strategy','model','inputSource','assumption','decision','signal'])
    check(typeof t[k]==='string' && t[k].length<=1000,'Textfeld fehlt oder überschreitet 1.000 Zeichen.');
  check(t.strategy.trim() && t.inputSource.trim(),'Strategie und Quelle sind erforderlich.');
  for (const k of manualNumbers) {
    const v = t[k];
    check(v===null || (finite(v) && (k==='pnl' || v>=0) && (!k.endsWith('Exposure') || v<=100)),
          'Zahlenfelder müssen gültig sein. Exposure liegt zwischen 0 und 100 %.');
  }
  return Object.fromEntries(['id','run','ticker','status','side','currency','observed','strategy','model','inputSource','assumption','decision','signal',...manualNumbers].map(k=>[k,t[k]]).concat([['manual',true]]));
}
function liveForm(id) {
  if (!data.current) return show('Live-Beobachtung', notice('Für neue Einträge wird ein verifizierter Kontext-Build benötigt.'));
  const old = id && validLive().find(t=>t.id===id);
  const enteredAt = new Date(old?.observed || Date.now());
  const localDateTime = new Date(enteredAt.getTime()-enteredAt.getTimezoneOffset()*60_000).toISOString().slice(0,23);
  const buildOptions = Object.entries(data.builds).map(([run,b])=>`<option value="${esc(run)}" ${(old?.run || data.current)===run?'selected':''}>${esc(time(b.captured))} · ${esc(run.slice(-8))}</option>`).join('');
  const input = (name,label,attrs='')=>`<label>${esc(label)}<input name="${name}" value="${esc(old?.[name] ?? '')}" ${attrs}></label>`;
  const choices = (name,label,values)=>`<label>${label}<select name="${name}">${values.map(([k,v])=>`<option value="${k}" ${old?.[name]===k?'selected':''}>${v}</option>`).join('')}</select></label>`;
  const text = (name,label,required='')=>`<label>${label}<textarea name="${name}" maxlength="1000" ${required}>${esc(old?.[name] || '')}</textarea></label>`;
  show(old?'Beobachtung ändern':'Live-Beobachtung erfassen', `<p class="fine">Speicherung in diesem Browser. Leere Felder bleiben offen. Der Kontext-Build belegt den Modellstand, die externe Quelle belegt die eingegebene Beobachtung.</p>
  <form class="form" id="live-form" data-id="${esc(id || '')}">
  <label>Verifizierter Kontext-Build<select name="run">${buildOptions}</select></label>
  <label>Beobachtungszeitpunkt (lokale Browserzeit)<input type="datetime-local" name="observed" value="${localDateTime}" step="0.001" required></label>
  <div class="grid2">${input('ticker','Ticker','required maxlength="16"')}${input('currency','Kurswährung','required maxlength="3"')}
  ${choices('status','Status',[['Planned','Geplant'],['Open','Offen'],['Closed','Abgeschlossen']])}${choices('side','Richtung',[['LONG','Long'],['SHORT','Short']])}
  ${input('strategy','Strategie','required maxlength="1000"')}${input('model','Modellversion','maxlength="1000"')}</div>
  <h3>Ausführung und Risiko</h3>
  <div class="grid2">${manualNumbers.map((k,i)=>input(k,['Einstieg','Stop','Ziel','Ausstieg','Ziel-Exposure (%)','Ist-Exposure (%)','Volumen (EUR)','P&L (EUR)','Risiko am Stop (EUR)'][i],`type="number" step="any" ${k==='pnl'?'':'min="0"'} ${k.endsWith('Exposure')?'max="100"':''}`)).join('')}</div>
  ${input('signal','Signal oder Trigger','maxlength="1000"')}${text('inputSource','Eingabedaten und Quelle','required')}
  ${text('assumption','Annahmen')}${text('decision','Offene Entscheidung')}
  <div class="form-error" role="alert"></div><div class="form-actions"><button class="button primary" type="submit">Speichern</button></div></form>`);
}
function reviewForm(id) {
  const t = allTrades().find(t=>t.id===id);
  const x = issues().find(x=>x.id===id);
  if (!t && !x) return;
  const old = reviewFor(id);
  show('Review erfassen', `<p class="fine">${esc(t?.ticker || x?.name)} · Lokaler Prüfvermerk. Der Quellenstatus der Daten folgt weiterhin dem Originalbeleg.</p>
  <form class="form" id="review-form" data-id="${esc(id)}"><label>Prüfentscheidung<select name="result">
  ${['Review erforderlich','Geprüft','Zurückgestellt'].map(o=>`<option ${old?.result===o?'selected':''}>${o}</option>`).join('')}</select></label>
  <label>Begründung<textarea name="note" required maxlength="1000">${esc(old?.note || '')}</textarea></label>
  <div class="form-error" role="alert"></div><div class="form-actions"><button class="button primary" type="submit">Review speichern</button></div></form>`);
}
function handleForm(form) {
  const values = Object.fromEntries(new FormData(form));
  const target = form.dataset.id;
  const at = new Date().toISOString();
  let next = {...local};
  if (form.id==='live-form') {
    const old = validLive().find(t=>t.id===target);
    const id = old?.id || crypto.randomUUID();
    const validated = validateLive({...values, id, ticker:values.ticker.trim().toUpperCase(),
      currency:values.currency.trim().toUpperCase(), observed:new Date(values.observed).toISOString(),
      ...Object.fromEntries(manualNumbers.map(k=>[k,values[k]===''?null:Number(values[k])]))});
    const changed = old ? Object.keys(validated).filter(k=>old[k]!==validated[k]) : [];
    if (old && !changed.length) { dialog.close(); return; }
    next.trades = [...local.trades.filter(t=>t.id!==id),validated];
    next.changes = [...local.changes,{kind:old?'Beobachtung geändert':'Beobachtung erfasst',
      target:id, run:validated.run, at, note:old?changed.join(', '):validated.ticker,
      previous:old?Object.fromEntries(changed.map(k=>[k,old[k]])):null,
      next:validated}];
  } else {
    check(values.note.trim(),'Eine Begründung ist erforderlich.');
    const run = allTrades().find(t=>t.id===target)?.run || null;
    const review = {target,run,at,kind:'Review',result:values.result,note:values.note.trim()};
    next.reviews = [...local.reviews.filter(r=>r.target!==target),review];
    next.changes = [...local.changes,review];
  }
  if (commitLocal(next)) { dialog.close(); paint(); notify('Im lokalen Journal gespeichert.'); }
}
function importForm() {
  show('Live-Journal importieren', `<p class="fine">Verwende den JSON-Export dieses Desks. Jede Live-Beobachtung wird einzeln geprüft. Unvollständige Beobachtungen landen in der Prüfliste.</p>
  <form class="form" id="import-form"><label>JSON-Datei<input type="file" accept=".json,application/json" name="file" required></label>
  <div class="form-error" role="alert"></div><div class="form-actions"><button class="button primary" type="submit">Live-Beobachtungen importieren</button></div></form>`);
}
async function importFile(form) {
  const file = new FormData(form).get('file');
  check(file && file.size && file.size<2_000_000,'Datei fehlt oder überschreitet 2 MB.');
  const at = new Date().toISOString();
  const next = {...local,trades:[...local.trades],changes:[...local.changes],rejected:[...local.rejected]};
  let imported = 0;
  let rejected = 0;
  const quarantine = (name,err,raw) => {
    next.rejected.push(rejectedTrade(crypto.randomUUID(),name,err,raw));
    rejected++;
  };
  let doc;
  try { doc=JSON.parse(await file.text()); } catch (_) { quarantine(file.name,new Error('JSON-Datei ist unlesbar.')); }
  const rows = Array.isArray(doc?.live) ? doc.live : null;
  if (doc !== undefined && !rows) quarantine(file.name,new Error('Live-Einträge fehlen.'));
  for (const [i, row] of (rows || []).entries()) {
    try {
      const t = validateLive(row);
      const existing = next.trades.find(x=>x.id===t.id);
      if (existing) {
        check(JSON.stringify(existing)===JSON.stringify(t),'Trade-ID kollidiert mit einem bestehenden Eintrag.');
        continue;
      }
      next.trades.push(t);
      next.changes.push({target:t.id,run:t.run,at,kind:'Import',note:t.ticker,next:t});
      imported++;
    } catch (err) { quarantine(`${file.name} · Eintrag ${i+1}`,err,row); }
  }
  if (commitLocal(next)) { dialog.close(); paint(); notify(`${imported} importiert · ${rejected} isoliert`); }
}
function exportForm() {
  show('Historie exportieren',`<p class="fine">Archivierte Modell-Orders, lokale Live-Beobachtungen, Review-Ereignisse und der Build-Bezug zum Datenstand.</p>
    <div class="form-actions">${button('Live-JSON importieren','import')}${button('Review-CSV','download','', 'data-key="reviews"')}
    ${button('Trade-CSV','download','', 'data-key="trades"')}${button('Vollständiges JSON','download','primary','data-key="json"')}</div>`);
}
function csv(rows) {
  return '\uFEFF'+rows.map(row=>row.map(x=>{
    let s = String(present(x));
    if (typeof x==='string' && /^[\s]*[=+\-@\t\r]/.test(s)) s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  }).join(';')).join('\r\n');
}
function download(kind) {
  const payload = {
    schema:'investorace-desk-export-v1', captured:data.captured, commit:data.commit, current:data.current,
    paper:modelOrders(), paperDecisions:data.paper?.decisions || [], paperAccounts:data.paper?.accounts || [],
    paperPositions:data.paper?.positions || [], frozen:data.frozen,
    live:validLive(), reviews:local.changes.filter(x=>x.kind==='Review'), changes:local.changes, reviewCases:issues(),
    status:{paper:paperStatus,live:localStatus}, builds:Object.fromEntries([...new Set([data.current,...allTrades().flatMap(t=>[t.run,t.executionRun,...(t.history || []).map(e=>e.run)]),
      ...data.frozen.flatMap(f=>[f.run,f.evaluationRun]),...(data.paper?.decisions || []).map(d=>d.run),...local.changes.map(c=>c.run)].filter(k=>k && Object.hasOwn(data.builds,k)))].map(k=>[k,data.builds[k]]))
  };
  const content = kind==='json' ? JSON.stringify(payload,null,2) : kind==='trades' ?
    csv([['ID','Datenstatus','Build','Ticker','Strategie','Modell','Status','Seite','Datum','Einstieg','Stop','Ziel','Ausstieg','Volumen EUR','Ziel Exposure %','Ist Exposure %','P&L EUR','Risiko EUR','Notiz'],
      ...allTrades().map(t=>[t.id,t.manual?localStatus:paperStatus,t.run,t.ticker,strategy(t.strategy),t.model,statusNames[t.status],t.side,
        t.observed||t.submitted,t.entry ?? (['Buy','BUY'].includes(t.side)?t.close:null),t.stop,t.target,t.exit ?? (['Sell','SELL'].includes(t.side)?t.close:null),
        t.notional??t.euros,t.targetExposure,t.actualExposure,t.pnl??t.realized,t.risk,t.decision||t.reason])]) :
    csv([['Eintrag','Build','Zeitpunkt','Prüfentscheidung','Notiz','Datenstatus'],
      ...payload.reviews.map(r=>[r.target,r.run,r.at,r.result,r.note,'Lokal · manuell']),
      ...payload.reviewCases.map(r=>[r.name,null,r.at,r.kind,r.message,'Isoliert'])]);
  saveDownload(content, `investorace-${kind}.${kind==='json'?'json':'csv'}`,
    kind==='json'?'application/json':'text/csv;charset=utf-8');
}
function saveDownload(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Export erstellt.');
}
function repaintTable(key) {
  const el = $('#table-result');
  if (!el) return;
  const output = {
    overview:()=>tradeRows(paperOrders(),key,8),
    active:()=>tradeRows(validLive(),key,Infinity),
    paper:()=>tradeRows(paperOrders().filter(t=>state.account==='all' || t.strategy===state.account),key,Infinity),
    journal:()=>tradeRows(journalTrades(),key,Infinity),
    score:scoreRows,checks:checkRows
  };
  if (output[key]) el.innerHTML = output[key]();
}
function go(hash) {
  if (location.hash === hash) { route(); paint(); }
  else location.hash = hash;
}
document.addEventListener('click',e=>{
  const locale=e.target.closest('[data-panic-language]');
  if (locale && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    e.preventDefault(); DeskPanic.changeLanguage(locale); paint();
    main.querySelector('[data-panic-language][aria-current]')?.focus({preventScroll:true});
    return;
  }
  const b = e.target.closest('[data-action]');
  if (!b || !data) return;
  const {action,key,value} = b.dataset;
  const actions = {
    instrument:()=>{instrument=key;chartMode='session';$('#desk-search').value='';$('#desk-results').hidden=true;go('#market');},
    'plot-mode':()=>{chartMode=key;paint();},
    stage:()=>go('#evidence/'+key), account:()=>{state.account=key;paint();},
    mode:()=>go('#journal/'+key), 'journal-source':()=>{state.journalSource=key;state.filter.journal='all';paint();}, checks:()=>go('#journal/checks'),
    filter:()=>{state.filter[key]=value; document.querySelectorAll(`[data-action="filter"][data-key="${key}"]`).forEach(c=>c.setAttribute('aria-pressed',c===b)); repaintTable(key);},
    build:()=>showBuild(key), score:()=>showScore(key), trade:()=>showTrade(key), issue:()=>showIssue(key),
    review:()=>reviewForm(key), 'new-live':()=>liveForm(), 'edit-live':()=>liveForm(key),
    export:exportForm, download:()=>download(key), 'tradingview-watchlist':downloadTradingViewWatchlist, import:importForm
  };
  actions[action]?.();
});
document.addEventListener('input',e=>{
  if(e.target.id==='desk-search' && data){const el=$('#desk-results');el.innerHTML=searchDesk(e.target.value);el.hidden=!e.target.value.trim();return;}
  const key = e.target.dataset.search;
  if (!key) return;
  state.queries[key] = e.target.value;
  repaintTable(key);
});
document.addEventListener('change',e=>{
  if(e.target.id==='market-symbol'){instrument=e.target.value;paint();return;}
  const key = e.target.dataset.select;
  if (key==='window') { state.window=Number(e.target.value); paint(); $('#window')?.focus(); }
  if (key==='regime') { state.regime=e.target.value; repaintTable('score'); }
});
dialog.addEventListener('submit',async e=>{
  if (!['live-form','review-form','import-form'].includes(e.target.id)) return;
  e.preventDefault();
  try { if (e.target.id==='import-form') await importFile(e.target); else handleForm(e.target); }
  catch (err) { $('.form-error',e.target).textContent=err.message; }
});
window.addEventListener('hashchange',()=>{
  if (dialog.open) dialog.close();
  route(); window.scrollTo(0,0); paint(true);
});
$('#build-top').addEventListener('click',()=>data && showBuild(data.current));
$('#export-top').addEventListener('click',()=>data && exportForm());
async function loadDeskSnapshot() {
  for(const url of ['snapshot.json']){
    try {
      const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(6000)});
      if(r.ok){const s=await r.json();if(s.market && s.builds?.[s.current])return s;}
    } catch {}
  }
  throw new Error('snapshot');
}
route(); paint();
loadDeskSnapshot().then(s=>{
  data = s; state.regime = data.macro?.regime || 'REFLATION'; readLocal(); route(); paint(); refreshSession(); refreshExperiments(); refreshCodexPaper(); refreshCompetitionTrades(); refreshMarketTrend(); setInterval(refreshSession, 60000);
  setInterval(refreshExperiments, 900000);
  setInterval(refreshCodexPaper, 900000);
  setInterval(refreshCompetitionTrades, 900000);
  setInterval(refreshMarketTrend, 900000);
}).catch(()=>{
  snapshotFailed=true; paint();
});


function activePositions(trades) {
  return `<article class="panel">${panelHead('Offene Live-Positionen','Lokal erfasste Beobachtungen · externer Abgleich offen')}
    ${trades.length ? cells(['Ticker','Ziel / Ist-Exposure','Einstieg','Stop','Ziel','P&L (EUR)','Risiko (EUR)'],trades.map(t=>[
      `<button class="table-link ticker" data-action="trade" data-key="${esc(t.id)}">${esc(t.ticker)}</button>`,
      `${num(t.targetExposure,'pct',localStatus)} / ${num(t.actualExposure,'pct',localStatus)}`,
      ...[t.entry,t.stop,t.target].map(v=>finite(v)?`${num(v,'n',localStatus)} ${esc(t.currency)}`:'Offen'),
      num(t.pnl,'eur',localStatus),num(t.risk,'eur',localStatus)])) :
      empty('Brokerbestand offen','Hier erscheinen manuell erfasste offene Positionen mit Quellenstatus.')}
  </article>`;
}
function paperHistory(decisions) {
  return `<article class="panel">${panelHead('Entscheidungsverlauf','Prospektive Simulation · nach Handelssitzung und Entscheidungs-Build')}
    ${cells(['Sitzung','Entscheidung','S&P-Trend','Neue Orders je Konto','Build'],decisions.slice().reverse().map(d=>[
      esc(day(d.session)),esc(time(d.at)),esc(present(d.market)),
      Object.keys(d.outcomes).map(k=>`<div>${esc(strategy(k))} · ${num(d.outcomes[k].new_orders,'n',paperStatus)}</div>`).join(''),
      button('Nachweis','build','small',`data-key="${esc(d.run)}"`)]))}
  </article>`;
}
