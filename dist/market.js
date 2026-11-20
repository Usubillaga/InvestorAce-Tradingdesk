'use strict';
let sessionData = null;
let experimentReport = null;
const experimentPageUrl = 'https://usubillaga.github.io/InvestorAce/swing-experiments.html';
const pairStatus = {DIVERGENCE:'Divergenz prüfen', NEUTRAL:'Keine Divergenz', UNSUPPORTED:'Kointegration nicht belegt'};

async function refreshExperiments() {
  for (const url of ['https://usubillaga.github.io/InvestorAce/swing-experiments.json','swing-experiments.json']) {
    try {
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(6000)});
      if (!response.ok) continue;
      const next=await response.json();
      if (next.schema!=='swing-experiments-v1' || !next.gap?.control || !next.gap?.capped
          || !Object.hasOwn(pairStatus,next.pair?.status) || !Array.isArray(next.pair.symbols)
          || !/^\d{4}-\d{2}-\d{2}$/.test(next.as_of)) continue;
      if (!experimentReport || next.as_of>=experimentReport.as_of) experimentReport=next;
      break;
    } catch {}
  }
  if (data && !dialog.open && ['paper','scanner'].includes(state.page)) paint();
}

function swingExperimentPanel() {
  const p=experimentReport;
  const action=link(experimentPageUrl,'Methode & Quelle');
  if (!p) return `<article class="panel">${panelHead('Swing-Experimente','Auswertung wird geladen',action)}</article>`;
  const limits=[['Fixes Gewicht 12 %',p.gap.control],['Gewicht nach Gap-Risiko',p.gap.capped]];
  return `<article class="panel">${panelHead('Swing-Experimente',`Historische Simulation · bis ${day(p.as_of)} · ${n(p.session_count)} Sitzungen`,action)}
    ${cells(['Positionsgröße','Käufe','Reduziert','Rendite EUR','Max. Drawdown','Schlechteste Eröffnung'],limits.map(([label,v])=>
      [esc(label),n(v.buys),n(v.capped),pct(v.ending_pct),pct(v.max_drawdown_pct),pct(v.worst_observed_open_pct)]))}
    <div class="details"><p>${n(p.gap.capped.sizing_coverage)} Käufe mit historischer Gap-Schätzung · ${n(p.gap.capped.observed_opens)} vollständig beobachtete Eröffnungen · ${n(p.gap.capped.incomplete_marks)} Schlussbewertung(en) mit Kurslücke.</p></div>
  </article>`;
}

function pairExperimentPanel() {
  const p=experimentReport?.pair;
  if (!p) return '';
  const pValue = value => finite(value) ? esc(value.toFixed(4)) : '—';
  return `<article class="panel">${panelHead('Paarbeobachtung',`Forschung · Schlusskurse vom ${day(p.as_of)}`,link(experimentPageUrl,'Methode & Quelle'))}
    ${cells(['Paar','Status','Z-Score','p-Wert Training','p-Wert letzte 252 Kurse','Geschätzte Halbwertszeit'],[[
      esc(p.symbols.join(' / ')),esc(pairStatus[p.status]),n(p.z),pValue(p.train_p),pValue(p.recent_p),
      finite(p.half_life) ? n(p.half_life)+' Sitzungen' : '—'
    ]])}
    <div class="details"><p>Zur Prüfung relativer Abweichungen. Swing-Käufe folgen weiter den Fundamental- und Timing-Regeln.</p></div>
  </article>`;
}
let positionData = null;
function shortPosition(ticker) {
  return positionData?.snapshot === data.current ? positionData.rows[ticker] : null;
}
async function refreshShortPositions() {
  if (positionData?.snapshot === data.current) return;
  try {
    const response=await fetch('positioning.json',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!response.ok) return;
    const next=await response.json();
    if(next.snapshot===data.current && next.rows) positionData=next;
  } catch {}
}
let instrument = '^GSPC';
let chartMode = 'session';
const quoteTime = t => finite(t) ? time(new Date(t*1000).toISOString()) : 'Offen';
function freshQuote(q) {
  const now=Date.now()/1000;
  return q && q.start<=q.at && q.at<=now && now<q.end && now-q.at<=300;
}
function quoteState(q) {
  if(!q) return 'Archiv';
  const now=Date.now()/1000;
  if(now>=q.end || now<q.start) return 'Außerhalb der Sitzung';
  return freshQuote(q)?'Sitzung · zeitnah':'Verzögert / veraltet';
}
function change(q) {
  return q && q.previous>0 ? 100*(q.price/q.previous-1) : null;
}
function marketPlot(points) {
  const values=points.filter(p=>finite(p[1]));
  if(values.length<2) return empty('Zu wenige Kursdaten','Für diese Ansicht liegen weniger als zwei Kurse vor.');
  const prices=values.map(p=>p[1]), lo=Math.min(...prices),hi=Math.max(...prices);
  const path=prices.map((p,i)=>[5+590*i/(prices.length-1),95-85*(hi===lo?.5:(p-lo)/(hi-lo))].join(',')).join(' ');
  const stamp=v=>typeof v==='number'?new Date(v*1000).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}):day(v);
  return `<figure class="price-plot"><svg viewBox="0 0 600 102" preserveAspectRatio="none" role="img" aria-label="Kursverlauf, Minimum ${n(lo)}, Maximum ${n(hi)}"><path d="M0 10H600 M0 52H600 M0 95H600" stroke="#304458"/><polyline points="${path}" fill="none" stroke="#65dbbb" stroke-width="2.7" vector-effect="non-scaling-stroke"/></svg><figcaption>${esc(stamp(values[0][0]))} – ${esc(stamp(values.at(-1)[0]))} · Min ${n(lo)} · Max ${n(hi)}</figcaption></figure>`;
}
function breadthBlock() {
  const quotes=sessionData?.quotes || {};
  const eligible=data.scorecard.map(r=>quotes[r.symbol]).filter(q=>freshQuote(q)&&finite(change(q)));
  const up=eligible.filter(q=>change(q)>0).length, down=eligible.filter(q=>change(q)<0).length, flat=eligible.length-up-down;
  const b=data.market?.components?.universe_above_ma200;
  return `<article class="panel panel-pad"><h2>Marktbreite</h2><p>InvestorAce-Universum · ${eligible.length} von ${data.scorecard.length} Werten mit zeitnahem Sitzungskurs und Vortagesschluss</p>
  ${eligible.length?`<div class="breadthbar" aria-hidden="true"><i style="width:${100*up/eligible.length}%"></i><b style="width:${100*down/eligible.length}%"></b></div><p>▲ ${up} steigend · ▼ ${down} fallend · ${flat} unverändert</p>`:badge('Intraday-Breite offen','warn')}
  <p><strong>${pct(b?.value)}</strong> über SMA 200 · Archivstichprobe ${n(b?.count)} Werte · Build ${day(data.captured)}</p></article>`;
}
function marketPanel() {
  const moves=data.market?.moves || [];
  const m=moves.find(m=>m.symbol===instrument);
  const stock=data.scorecard.find(r=>r.symbol===instrument)
    || sessionData?.watch?.find(r=>r.symbol===instrument)
    || sessionData?.scanner?.rows.find(r=>r.symbol===instrument);
  const q=sessionData?.quotes[instrument];
  const archive=data.market?.history?.[instrument] || [];
  const intraday=chartMode==='session' && q?.path?.length>1;
  const points=intraday?q.path:archive;
  const amplitude=q?.previous>0 && finite(q.high) && finite(q.low)?100*(q.high-q.low)/q.previous:null;
  return `<div class="market-layout"><article class="panel panel-pad"><div class="market-heading"><div><h2>${esc(m?.name || (stock && instrumentName(stock)) || instrument)}</h2>
  <strong class="market-price">${n(q?.price ?? m?.close)} <small>${esc(q?.currency || '')}</small></strong> ${badge(quoteState(q),freshQuote(q)?'good':'soft')}</div>
  <select aria-label="Markt auswählen" id="market-symbol">${[...moves.map(x=>[x.symbol,x.name]),...(stock?[[stock.symbol,instrumentName(stock)]]:[])].map(([k,v])=>`<option value="${esc(k)}" ${instrument===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
  <p>Vortag ${pct(q?change(q):m?.change_pct)} · Tagesamplitude ${pct(amplitude)} · (Hoch − Tief) / Vortagsschluss</p>
  <div class="controls">${button('Sitzung','plot-mode','small','data-key="session"')} ${button('Archiv','plot-mode','small','data-key="archive"')}</div>
  ${marketPlot(points)}<div class="fine">${intraday?'5-Minuten-Kurse · Yahoo Finance': 'Archivierte Kurse · InvestorAce'} · Kursstand ${q?quoteTime(q.at):day(m?.date)}</div></article>${breadthBlock()}</div>
  <article class="panel">${panelHead('Indizes, Volatilität & Makro','Kurszeit je Instrument · Archivwerte sind gekennzeichnet')}
  ${cells(['Markt','Kurs','Δ Vortag','Kurszeit','Datenstatus'],moves.map(m=>{const q=sessionData?.quotes[m.symbol];return [button(esc(m.name),'instrument','small',`data-key="${esc(m.symbol)}"`),n(q?.price??m.close),pct(q?change(q):m.change_pct),q?quoteTime(q.at):day(m.date),badge(quoteState(q),'soft')];}))}</article>`;
}
function sessionBook() {
  const l=deskBook;
  if(!l || !sessionData) return notice('Lokales Intraday-Paperjournal wartet auf Kurse und verfügbaren Browser-Speicher.');
  const fills=Object.values(l.fills).reverse();
  const rows=Object.entries(l.accounts).map(([k,a])=>{
    let value=a.cash; let complete=true;
    for(const p of Object.values(a.holdings)){
      const q=sessionData.quotes[p.symbol],fx=sessionData.quotes['EURUSD=X'];
      if(!q || (p.currency==='USD'&&!fx)){complete=false;break;}
      value+=p.shares*q.price/(p.currency==='USD'?fx.price:1);
    }
    return [esc(strategy(k)),eur(a.cash),n(Object.keys(a.holdings).length),eur(complete?value:null),eur(complete?value-10000:null)];
  });
  const positions=Object.entries(l.accounts).flatMap(([k,a])=>Object.entries(a.holdings).map(([ticker,h])=>{
    const q=sessionData.quotes[h.symbol], fx=sessionData.quotes['EURUSD=X'];
    const value=q && (h.currency==='EUR' || fx) ? h.shares*q.price/(h.currency==='EUR'?1:fx.price):null;
    return [esc(ticker),esc(strategy(k)),n(h.shares),n(q?.price)+' '+esc(h.currency),eur(value),eur(finite(value)?value-h.cost:null),quoteTime(q?.at)];
  }));
  return `<article class="panel">${panelHead('Intraday-Paperhandel','Lokal in diesem Browser · letzter Kursabruf '+quoteTime(sessionData.sampled))}
  ${cells(['Konto','Cash','Positionen','Wert zu letzten Kursen','P&L'],rows)}
  ${positions.length?cells(['Offene Position','Konto','Stück','Letzter Kurs','Wert','P&L','Kurszeit'],positions):''}
  <div class="details"><p>Neue Swing-Käufe erfordern einen Fundamental- und Opportunity-Score ab 7, ein Buy-Label und bestätigten Markt- und Aktientrend. Die beiden Vergleichskonten eröffnen keine neuen Positionen. Das Intraday-Konto simuliert zum ersten beobachteten, höchstens fünf Minuten alten regulären Kurs nach Aufnahme der Order. USD-Fills benötigen einen zeitnahen EUR/USD-Kurs. Gebühr je Fill 0,10 %. Offene Orders und abgelaufene Signale erzeugen ohne gültigen Kurs keine Ausführung.</p></div>
  ${fills.length?cells(['Zeit (Berlin)','Wert','Konto','Seite','Kurs','Volumen','Entscheidungs-Build'],fills.map(f=>[quoteTime(f.at),esc(f.ticker),esc(strategy(f.strategy)),esc(f.side),n(f.price)+' '+esc(f.currency),eur(f.euros),link('https://github.com/Usubillaga/InvestorAce/tree/'+encodeURIComponent(f.commit)+'/history/_builds/'+encodeURIComponent(f.run),'Build')])):empty('Noch keine simulierten Intraday-Fills','Das Journal startet prospektiv und erfasst jede Ausführung mit Kurszeit und Entscheidungs-Build.')}</article>`;
}
function instrumentName(row) {return row?.name || sessionData?.quotes[row?.symbol]?.name || row?.symbol || row?.ticker || 'Offen';}
function tradingViewWatchlist(rows) {
  return [...new Set(rows.map(r=>r.tradingViewSymbol).filter(Boolean))];
}
function scannerAndWatchSymbols() {
  return tradingViewWatchlist([...(sessionData?.scanner?.rows || []), ...(sessionData?.watch || [])]);
}
function downloadTradingViewWatchlist() {
  const symbols=scannerAndWatchSymbols();
  if (symbols.length) saveDownload(symbols.join(','),'investorace-tradingview-watchlist.txt','text/plain;charset=utf-8');
}
function deskWatchPanel(download) {
  const watch=sessionData?.watch || [];
  if (!watch.length) return '';
  const scores=new Map(data.scorecard.map(row=>[row.symbol,row]));
  return `<article class="panel">${panelHead('Beobachtungsliste','Titel mit Kursbeobachtung',download)}
  ${cells(['Aktie','Unternehmen','Kurs','Kurszeit','Research'],watch.map(row=>{
    const q=sessionData.quotes[row.symbol];
    const ticker=scores.get(row.symbol)?.ticker;
    const research=ticker ? button('Scorecard','score','small',`data-key="${esc(ticker)}"`) : 'Bewertung offen';
    return [button(esc(row.ticker),'instrument','small',`data-key="${esc(row.symbol)}"`),
      esc(instrumentName(row)),q?`${n(q.price)} ${esc(q.currency)}`:'Offen',quoteTime(q?.at),research];
  }))}</article>`;
}
function scannerPage() {
  const scanner=sessionData?.scanner;
  const title=header('Scanner-Universum','Die rangfähigen Treffer des InvestorAce-Marktscanners fließen automatisch in die Kursbeobachtung ein.');
  const watchlist=scannerAndWatchSymbols();
  const download=watchlist.length ? button('TradingView-Watchlist (.txt)','tradingview-watchlist','small') : '';
  const watch=deskWatchPanel(scanner ? '' : download);
  if(!scanner) return title+pairExperimentPanel()+watch+empty('Scannerstand ausstehend','Der Kursdienst hat noch keinen passenden Scannerbericht geliefert.');
  const added=scanner.rows.filter(r=>r.added);
  const scorecardBySymbol=new Map(data.scorecard.map(row=>[row.symbol,row]));
  const source=link('https://github.com/Usubillaga/InvestorAce/blob/'+encodeURIComponent(scanner.revision)+'/market-scan/latest.json','Scannerquelle');
  return title+pairExperimentPanel()+watch+`<article class="panel">${panelHead(added.length+' zusätzliche Aktien',scanner.rows.length+' rangfähige Treffer · Scan vom '+day(scanner.asOf),download+' '+source)}
  <div class="details"><p>${esc(scanner.coverage || '')}</p>${watchlist.length ? `<p>TradingView-Export · ${watchlist.length} Titel mit Börsenkürzel · Import im Watchlist-Menü von TradingView</p>` : ''}<p>Das Rating stammt aus dem Scanner. Für eine reale Order braucht der Desk eine Handelsregel, Positionsgröße und Brokeranbindung.</p></div>
  ${cells(['Aktie','Unternehmen','Scanner-Rating','Score / 10','Abdeckung','Letzter Kurs','Kurszeit','Short Interest','Prüfstatus'],scanner.rows.map(r=>{
    const q=sessionData.quotes[r.symbol];
    const stock=scorecardBySymbol.get(r.symbol);
    const position=stock && shortPosition(stock.ticker);
    const positioning=position?.status==='REPORTED' && finite(position.pct_float)
      ? `${pct(position.pct_float)} · ${day(position.settlement_date)}` : position ? 'Prüfung offen' : 'Kein Archivwert';
    return [button(esc(r.ticker),'instrument','small',`data-key="${esc(r.symbol)}"`),esc(r.name),esc(r.band),n(r.score),
      r.added?'Scanner-Erweiterung':'Scorecard',q?n(q.price)+' '+esc(q.currency):'Offen',quoteTime(q?.at),
      stock ? button(esc(positioning),'score','small',`data-key="${esc(stock.ticker)}"`) : esc(positioning),esc(r.review)];
  }))}</article>`;
}
function searchDesk(term) {
  const query=term.trim().toLowerCase();
  if(!query)return '';
  const rows=[];
  const add=(title,detail,action,key)=>{if((title+' '+detail).toLowerCase().includes(query))rows.push([button(esc(title),action,'small',`data-key="${esc(key)}"`),esc(detail)]);};
  for(const m of data.market?.moves || [])add(m.name,m.symbol+' · Markt','instrument',m.symbol);
  for(const t of allTrades())add(t.ticker,strategy(t.strategy)+' · '+t.status+' · '+(t.reason || t.signal || ''),'trade',t.id);
  for(const r of data.scorecard){add(r.ticker+' · '+instrumentName(r),r.sector+' · '+(r.opportunity.label || '')+' · Scorecard','score',r.ticker);add(r.symbol,instrumentName(r)+' · Kurschart','instrument',r.symbol);}
  const covered=new Set(data.scorecard.map(r=>r.symbol));
  for(const r of sessionData?.watch || [])if(!covered.has(r.symbol))add(r.ticker+' · '+r.name,'Beobachtung · Kurschart','instrument',r.symbol);
  for(const r of sessionData?.scanner?.rows || [])if(r.added)add(r.ticker+' · '+r.name,[r.symbol,r.sector,r.band,'Scanner'].join(' · '),'instrument',r.symbol);
  return cells(['Treffer','Kontext'],rows);
}
async function refreshSession() {
  const archivePositions=refreshShortPositions();
  const urls=['quotes.json'];
  for(const url of urls){
    try{
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)continue;
      const next=await response.json();
      if(next.version!==1 || !next.quotes || Object.hasOwn(next,'ledger'))continue;
      if(next.snapshot!==data.current){
        const latest=await loadDeskSnapshot();
        if(latest.current!==next.snapshot)continue;
        data=latest;
        state.regime=data.macro?.regime || state.regime;
      }
      if(!sessionData || next.sampled>=sessionData.sampled)sessionData=next;
      if(data.current===next.snapshot)await updateLocalBook(next);
      break;
    }catch{}
  }
  await archivePositions;
  await refreshShortPositions();
  if(data && !dialog.open && ['overview','paper','market','scanner'].includes(state.page) && !document.querySelector('#desk-search')?.value)paint();
}

let deskBook=null;
const newPaperBook=()=>({accounts:Object.fromEntries(['timing','fundamental','opportunity'].map(k=>[k,{cash:10000,holdings:{}}])),armed:{},fills:{}});
const swingPolicy = 'fundamental-and-technical-v1';
function confirmedSwing(order) {
  const proof=order.inputs;
  if (order.strategy!=='timing' || order.entryPolicy!==swingPolicy || order.entryMarket!=='UPTREND' || !proof) return false;
  return ['Buy','Strong Buy'].includes(proof.signal)
    && finite(proof.fundamental) && proof.fundamental>=7 && finite(proof.opportunity) && proof.opportunity>=7
    && proof.status==='AVAILABLE' && proof.trend==='ABOVE_SMA200' && finite(proof.close)
    && [proof.sma36,proof.sma50,proof.sma200].every(level=>finite(level) && proof.close>level)
    && finite(proof.extension_atr) && proof.extension_atr>=0 && proof.extension_atr<=3;
}
function stepPaper(book,snapshot,sample,now) {
  if(sample.snapshot!==snapshot.current || now-sample.sampled>300 || sample.sampled>now)return;
  const current=q=>q && q.start<=q.at && q.at<=now && now<q.end && now-q.at<=300 && finite(q.price) && q.price>0;
  const today=new Date(now*1000).toISOString().slice(0,10);
  for(const o of snapshot.paper?.orders || []){
    const expiry=Date.parse(o.inputs?.signalExpiry)/1000;
    if(o.status!=='Pending' || !Object.hasOwn(snapshot.builds,o.run) || o.expires<today)continue;
    if(o.side==='Buy' && (!confirmedSwing(o) || !finite(expiry) || expiry<now))continue;
    const account=book.accounts[o.strategy];
    if (!account) continue;
    const id=[o.id,o.run,o.ticker,o.side].join('|');
    if(book.fills[id])continue;
    const armed=book.armed[id] ??= now;
    const q=sample.quotes[o.symbol], fx=sample.quotes['EURUSD=X'];
    if(!current(q) || q.at<=Math.max(armed,Date.parse(o.submitted)/1000) || q.currency!==o.currency)continue;
    if(!['EUR','USD'].includes(o.currency) || (o.currency==='USD' && (!current(fx) || Math.abs(fx.at-q.at)>300)))continue;
    const rate=o.currency==='EUR'?1:fx.price;
    const held=account.holdings;
    let euros,shares;
    if(o.side==='Buy'){
      euros=o.euros;
      if(!finite(euros) || euros<=0 || held[o.ticker] || euros*1.001>account.cash)continue;
      shares=euros*rate/q.price;
      held[o.ticker]={shares,symbol:o.symbol,currency:o.currency,cost:euros*1.001};
      account.cash-=euros*1.001;
    }else if(o.side==='Sell' && held[o.ticker]){
      shares=held[o.ticker].shares;euros=shares*q.price/rate;
      account.cash+=euros*.999;
      delete held[o.ticker];
    }else continue;
    book.fills[id]={ticker:o.ticker,strategy:o.strategy,side:o.side,shares,euros,fee:euros*.001,price:q.price,
      currency:o.currency,fx:rate,fxAt:o.currency==='USD'?fx.at:null,at:q.at,recorded:now,armed,submitted:o.submitted,
      order:o.id,reason:o.reason,run:o.run,commit:snapshot.commit,model:o.model};
  }
}
async function updateLocalBook(sample) {
  if(!navigator.locks)return;
  const key='investorace-intraday-paper-v1';
  try{
    await navigator.locks.request(key,()=>{
      const saved=localStorage.getItem(key);
      const book=saved?JSON.parse(saved):newPaperBook();
      stepPaper(book,data,sample,Date.now()/1000);
      localStorage.setItem(key,JSON.stringify(book));
      deskBook=book;
    });
  }catch{deskBook=null;}
}

const codexRoot = 'https://raw.githubusercontent.com/Usubillaga/InvestorAce/main/history/';
const codexJournal = 'https://usubillaga.github.io/InvestorAce/codex-long-short.html';
let codexPaper = null;
let codexPaperLoaded = false;

function isCodexPaperReport(report) {
  return report?.schema === 'codex-long-short-v1'
    && /^\d{8}T\d{12}-[0-9a-f]{32}$/.test(report.archive_build)
    && Number.isFinite(Date.parse(report.as_of))
    && report.paper?.fundamental_sides?.join(',') === 'LONG'
    && report.paper?.positions && !Array.isArray(report.paper.positions) && typeof report.paper.positions === 'object'
    && Object.values(report.paper.positions).every(pos => ['LONG', 'SHORT'].includes(pos?.side))
    && Array.isArray(report.paper.pending) && Array.isArray(report.paper.orders)
    && report.backtest?.forward_rules?.by_side?.LONG && report.backtest.forward_rules.by_side.SHORT;
}

async function refreshCodexPaper() {
  const read = async url => {
    const response = await fetch(url, { cache:'no-store', signal:AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Codex paper data unavailable');
    return response.json();
  };
  try {
    const next = await read(codexRoot + 'long_short_lab.json');
    if (!isCodexPaperReport(next)) throw new Error('Invalid Codex paper report');
    const manifest = await read(codexRoot + '_builds/' + next.archive_build + '/manifest.json');
    if (manifest?.run_id !== next.archive_build) throw new Error('Unmatched Codex generated report');
    if (!codexPaper || Date.parse(next.as_of) >= Date.parse(codexPaper.as_of)) codexPaper = next;
  } catch {}
  codexPaperLoaded = true;
  if (data && !dialog.open && ['paper', 'long-short'].includes(state.page)) paint();
}

function codexPaperPanel() {
  const report = codexPaper;
  const action = link(codexJournal, 'InvestorAce-Journal');
  if (!report) return `<article class="panel">${panelHead('Automatische Longs & Shorts',
    codexPaperLoaded ? 'Verifizierter Paper-Kontostand aktuell nicht abrufbar' : 'Paper-Konto wird geladen', action)}</article>`;
  const {paper, backtest} = report;
  const positions = Object.entries(paper.positions);
  const orders = [...paper.orders.slice(-8), ...paper.pending].reverse();
  const count = side => positions.filter(([, pos]) => pos.side === side).length;
  const usd = value => new Intl.NumberFormat('de-DE', {style:'currency', currency:'USD'}).format(value);
  const test = backtest.forward_rules;
  const build = 'https://github.com/Usubillaga/InvestorAce/tree/main/history/_builds/' + report.archive_build;
  return `<article class="panel section-gap">${panelHead('Automatische Longs & Shorts', `Paper-Konto · Stand ${time(report.as_of)}`, action)}
    <div class="summary-grid">
      ${stat('Offene Longs',n(count('LONG')),'Simulation','soft','Fundamental + technisch','active')}
      ${stat('Offene Shorts',n(count('SHORT')),'Simulation','soft','Rein technisch','active')}
      ${stat('Ausstehende Orders',n(paper.pending.length),'Simulation','soft','Orderjournal','journal')}
    </div>
    ${positions.length ? cells(['Ticker','Richtung','Eröffnet','Einstieg','Letzte Bewertung','Positionswert'],positions.map(([ticker,pos])=>
        [esc(ticker),esc(pos.side),esc(day(pos.opened_on)),finite(pos.entry_close)?esc(usd(pos.entry_close)):'Offen',
         esc(day(pos.marked_on)),finite(pos.marked_notional)?esc(usd(pos.marked_notional)):'Offen']))
      : empty('Keine aktiven Paper-Positionen',paper.sessions ? 'Für den verifizierten Stand ist das Konto ohne offene Positionen.'
        : 'Das Konto wartet auf seine erste zulässige Handelssitzung.')}
    ${orders.length ? cells(['Order','Richtung','Ticker','Ausführung','Status'],orders.map(o=>
      [esc(o.action),esc(o.side),esc(o.ticker),esc(day(o.execution_session)),esc(o.status)])) : ''}
    <div class="details"><p>Historischer Backtest · ${n(test.by_side.LONG.entries)} Long-Einstiege ·
      ${n(test.by_side.SHORT.entries)} Short-Einstiege · ${pct(test.return_pct)} nach simulierten Kosten.</p>
      <p>${link(build,'Verifizierter Daten-Build')}${link(codexRoot + 'long_short_lab.json','Aktueller Bericht (JSON)')}</p>
    </div>
  </article>`;
}
