'use strict';
let sessionData = null;
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
  const m=moves.find(m=>m.symbol===instrument), stock=data.scorecard.find(r=>r.symbol===instrument);
  const q=sessionData?.quotes[instrument];
  const archive=data.market?.history?.[instrument] || [];
  const intraday=chartMode==='session' && q?.path?.length>1;
  const points=intraday?q.path:archive;
  const amplitude=q?.previous>0 && finite(q.high) && finite(q.low)?100*(q.high-q.low)/q.previous:null;
  return `<div class="market-layout"><article class="panel panel-pad"><div class="market-heading"><div><h2>${esc(m?.name || stock?.name || instrument)}</h2>
  <strong class="market-price">${n(q?.price ?? m?.close)} <small>${esc(q?.currency || '')}</small></strong> ${badge(quoteState(q),freshQuote(q)?'good':'soft')}</div>
  <select aria-label="Markt auswählen" id="market-symbol">${[...moves.map(x=>[x.symbol,x.name]),...(stock?[[stock.symbol,stock.name]]:[])].map(([k,v])=>`<option value="${esc(k)}" ${instrument===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
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
  <div class="details"><p>Bei geöffnetem Desk liefern die bestätigten Tagesregeln die Orders. Das Intraday-Konto simuliert zum ersten beobachteten, höchstens fünf Minuten alten regulären Kurs nach Aufnahme der Order. USD-Fills benötigen einen zeitnahen EUR/USD-Kurs. Gebühr je Fill 0,10 %. Offene Orders und abgelaufene Signale erzeugen ohne gültigen Kurs keine Ausführung.</p></div>
  ${fills.length?cells(['Zeit (Berlin)','Wert','Konto','Seite','Kurs','Volumen','Entscheidungs-Build'],fills.map(f=>[quoteTime(f.at),esc(f.ticker),esc(strategy(f.strategy)),esc(f.side),n(f.price)+' '+esc(f.currency),eur(f.euros),link('https://github.com/Usubillaga/InvestorAce/tree/'+encodeURIComponent(f.commit)+'/history/_builds/'+encodeURIComponent(f.run),'Build')])):empty('Noch keine simulierten Intraday-Fills','Das Journal startet prospektiv und erfasst jede Ausführung mit Kurszeit und Entscheidungs-Build.')}</article>`;
}
function searchDesk(term) {
  const query=term.trim().toLowerCase();
  if(!query)return '';
  const rows=[];
  const add=(title,detail,action,key)=>{if((title+' '+detail).toLowerCase().includes(query))rows.push([button(esc(title),action,'small',`data-key="${esc(key)}"`),esc(detail)]);};
  for(const m of data.market?.moves || [])add(m.name,m.symbol+' · Markt','instrument',m.symbol);
  for(const t of allTrades())add(t.ticker,strategy(t.strategy)+' · '+t.status+' · '+(t.reason || t.signal || ''),'trade',t.id);
  for(const r of data.scorecard){add(r.ticker+' · '+r.name,r.sector+' · '+(r.opportunity.label || '')+' · Scorecard','score',r.ticker);add(r.symbol,r.name+' · Kurschart','instrument',r.symbol);}
  return cells(['Treffer','Kontext'],rows);
}
async function refreshSession() {
  const urls=['quotes.json'];
  for(const url of urls){
    try{
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)continue;
      const next=await response.json();
      if(next.version!==1 || !next.quotes || Object.hasOwn(next,'ledger'))continue;
      if(!sessionData || next.sampled>=sessionData.sampled)sessionData=next;
      if(data.current===next.snapshot)await updateLocalBook(next);
      break;
    }catch{}
  }
  if(data && !dialog.open && ['overview','paper','market'].includes(state.page) && !document.querySelector('#desk-search')?.value)paint();
}

let deskBook=null;
const newPaperBook=()=>({accounts:Object.fromEntries(['timing','fundamental','opportunity'].map(k=>[k,{cash:10000,holdings:{}}])),armed:{},fills:{}});
function stepPaper(book,snapshot,sample,now) {
  if(sample.snapshot!==snapshot.current || now-sample.sampled>300 || sample.sampled>now)return;
  const current=q=>q && q.start<=q.at && q.at<=now && now<q.end && now-q.at<=300 && finite(q.price) && q.price>0;
  const today=new Date(now*1000).toISOString().slice(0,10);
  for(const o of snapshot.paper?.orders || []){
    const expiry=Date.parse(o.inputs?.signalExpiry)/1000;
    if(o.status!=='Pending' || !Object.hasOwn(snapshot.builds,o.run) || o.expires<today || !finite(expiry) || expiry<now)continue;
    const id=[o.id,o.run,o.ticker,o.side].join('|');
    if(book.fills[id])continue;
    const armed=book.armed[id] ??= now;
    const q=sample.quotes[o.symbol], fx=sample.quotes['EURUSD=X'];
    if(!current(q) || q.at<=Math.max(armed,Date.parse(o.submitted)/1000) || q.currency!==o.currency)continue;
    if(!['EUR','USD'].includes(o.currency) || (o.currency==='USD' && (!current(fx) || Math.abs(fx.at-q.at)>300)))continue;
    const rate=o.currency==='EUR'?1:fx.price;
    const account=book.accounts[o.strategy], held=account.holdings;
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
