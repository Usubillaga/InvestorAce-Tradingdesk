'use strict';
const words = {
  de: {
    title:'Fünf oder sechs Indexführer', kicker:'Panik · Paper-Test in USD', intro:'Zwei Konten starten mit je 10.000 USD. Beide kaufen bei bestätigter Panik unter 20. Jedes Unternehmen bekommt beim Einstieg gleich viel Kapital.',
    book:'Unternehmen', cash:'Bargeld', flat:'Wartet auf einen Kauf', open:'Investiert seit', pending:'Order zum Schluss am', BUY:'Kauf', SELL:'Verkauf', marked:'Letzter abgeschlossener Handelstag', started:'Testbeginn',
    universe:'Gemeinsame Unternehmen der beiden Top 10', method:'Die Aktienklassen jedes Unternehmens werden zuerst je ETF zusammengezählt. Unter den zehn größten Unternehmen beider ETFs entscheidet das mittlere Gewicht in SPY und QQQ über die Reihenfolge. Die Tabelle zeigt Kaufkandidaten.',
    rules:'Ein- und Ausstieg', protocol:'Ein zeitgestempeltes Intraday-Signal unter 20 löst einen Kauf zum selben US-Schluss aus, sofern der Auftrag vor Schluss dokumentiert ist. Nach mindestens 42 Kalendermonaten löst der erste bestätigte Schlusswert ab 80 einen Verkauf zum folgenden Handelsschluss aus. Kein Stop-Loss. Die Gebühr beträgt 0,1 % je Seite. SPY und QQQ werden separat mit identischen Handelsterminen und Kosten verglichen.',
    journal:'Kontodaten', legacy:'Ursprüngliches rosa Konto', claude:'Claudes Mix-Konten', security:'Unternehmen · Aktienklassen', order:'Order', date:'Datum', units:'Stücke beim Kauf', price:'Kaufkurs', value:'Positionswert', eligible:'Frühestes Euphoriedatum', history:'Orders und Ausführungen', bought:'Gekauft', sold:'Verkauft', expired:'Order verfallen', waiting:'Noch keine Order', noData:'Kontodaten derzeit nicht erreichbar.', noWeights:'Keine verifizierte Auswahl verfügbar.', blocked:'Für diesen Korb fehlen genügend gemeinsame Unternehmen.', latest:'Letzte geprüfte Messung', noReading:'Seit Testbeginn liegt noch keine neue bestätigte Intraday-Messung für diese Sitzung vor.', missed:'Sitzungen ohne rechtzeitige Signalprüfung', slot:'Zielgewicht beim Kauf', checked:'Auswahl geprüft', local:'Datenstand der veröffentlichten Seite'
  },
  en: {
    title:'Five or six index leaders', kicker:'Panic · USD paper test', intro:'Two accounts start with $10,000 each. Both buy on confirmed panic below 20. Each company receives the same allocation at entry.',
    book:'companies', cash:'Cash', flat:'Waiting for an entry', open:'Invested since', pending:'Order for the close on', BUY:'Buy', SELL:'Sell', marked:'Last completed session', started:'Test started',
    universe:'Companies in both top tens', method:'Share classes are combined by issuer in each ETF before ranking. Among the ten largest companies in both ETFs, the average SPY and QQQ weight sets the order. The table shows potential purchases.',
    rules:'Entry and exit', protocol:'A timestamped intraday reading below 20 triggers an entry at the same US close if the order was recorded before the close. After at least 42 calendar months, the first confirmed closing reading of 80 or above triggers a sale at the next session close. No stop-loss. Costs are 0.1% each side. SPY and QQQ are tracked separately on identical trade dates and costs.',
    journal:'Account data', legacy:'Original pink paper account', claude:'Claude’s mixed accounts', security:'Company · share classes', order:'Order', date:'Date', units:'Shares at entry', price:'Entry price', value:'Position value', eligible:'First eligible euphoria date', history:'Orders and fills', bought:'Bought', sold:'Sold', expired:'Order expired', waiting:'No order yet', noData:'Account data currently unavailable.', noWeights:'No verified selection available.', blocked:'Too few common companies for this basket.', latest:'Latest verified reading', noReading:'No new verified intraday reading for this session since launch.', missed:'Sessions without a timely signal check', slot:'Target weight at entry', checked:'Selection checked', local:'Showing the published snapshot'
  },
  es: {
    title:'Cinco o seis líderes de índices', kicker:'Pánico · Prueba en papel en USD', intro:'Dos cuentas empiezan con 10.000 USD cada una. Ambas compran al confirmarse pánico bajo 20. Cada empresa recibe el mismo importe al entrar.',
    book:'empresas', cash:'Efectivo', flat:'En espera de una compra', open:'Invertido desde', pending:'Orden para el cierre del', BUY:'Compra', SELL:'Venta', marked:'Última sesión cerrada', started:'Inicio de la prueba',
    universe:'Empresas entre las diez mayores de ambos índices', method:'Primero se suman las clases de acciones por empresa en cada ETF. Entre las diez mayores empresas de ambos fondos, el peso medio en SPY y QQQ determina el orden. La tabla muestra posibles compras.',
    rules:'Entrada y salida', protocol:'Una lectura intradía bajo 20 permite comprar al cierre estadounidense de ese día si la orden queda registrada antes del cierre. Tras al menos 42 meses naturales, el primer cierre confirmado en 80 o más activa la venta al cierre de la siguiente sesión. Sin stop-loss. El coste es del 0,1 % por operación. SPY y QQQ se siguen por separado con las mismas fechas y costes.',
    journal:'Datos de las cuentas', legacy:'Cuenta rosa original', claude:'Cuentas mixtas de Claude', security:'Empresa · clases de acciones', order:'Orden', date:'Fecha', units:'Acciones al entrar', price:'Precio de entrada', value:'Valor de la posición', eligible:'Primera fecha apta para euforia', history:'Órdenes y ejecuciones', bought:'Compra ejecutada', sold:'Venta ejecutada', expired:'Orden caducada', waiting:'Sin órdenes', noData:'Datos de las cuentas no disponibles.', noWeights:'Selección verificada no disponible.', blocked:'Faltan empresas comunes para esta cesta.', latest:'Última lectura verificada', noReading:'Desde el inicio no hay una nueva lectura intradía verificada para esta sesión.', missed:'Sesiones sin comprobación a tiempo', slot:'Peso objetivo al entrar', checked:'Selección comprobada', local:'Datos de la versión publicada'
  }
};
const language = new URLSearchParams(location.search).get('lang') || navigator.language.slice(0, 2);
const lang = Object.hasOwn(words, language) ? language : 'de';
const t = words[lang];
const id = key => document.getElementById(key);
const node = (tag, text) => {const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e;};
const usd = value => new Intl.NumberFormat(lang,{style:'currency',currency:'USD'}).format(value);
const percent = value => new Intl.NumberFormat(lang,{style:'percent',maximumFractionDigits:2}).format(value);
const when = stamp => new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}).format(new Date(stamp))+' NY';
document.documentElement.lang = lang;
document.title = t.title+' · InvestorAce';
for (const k of ['title','kicker','intro','universe','method','rules','protocol','legacy','claude','journal']) id(k).textContent=t[k];
id('legacy').href=lang==='es'?'heat-leaders.html':'heat-leaders.en.html';
document.querySelector('[hreflang="'+lang+'"]').setAttribute('aria-current','page');
function table(headers, rows) {
  const tbl=node('table'), tr=tbl.createTHead().insertRow();
  for (const h of headers) tr.append(node('th',h));
  const body=tbl.createTBody();
  for(const row of rows){const r=body.insertRow();for(const val of row)r.insertCell().textContent=val;}
  return tbl;
}
function link(label,url) {const a=node('a',label);if(url && url.startsWith('https://'))a.href=url;return a;}
function book(account, selection) {
  const panel=node('section'); panel.className='portfolio card';
  const amount=node('div',usd(account.nav));amount.className='amount';
  const state=account.pending?t[account.pending.side]+' · '+t.pending+' '+account.pending.target:account.entry?t.open+' '+account.entry:t.flat;
  panel.append(node('h2',account.size+' '+t.book),amount,node('p',state));
  const dl=node('dl');dl.className='details';
  for(const [name,value] of [[t.cash,usd(account.cash)],[t.slot,percent(1/account.size)],...Object.entries(account.controls).map(([f,v])=>[f,usd(v)])])
    dl.append(node('dt',name),node('dd',value));
  panel.append(dl);
  if(account.entry)panel.append(node('p',t.eligible+' · '+account.eligible));
  if(!account.entry && selection && selection.candidates.length<account.size)panel.append(node('p',t.blocked));
  if(account.holdings.length){const scroll=node('div');scroll.className='scroll';scroll.tabIndex=0;
    scroll.append(table([t.security,t.price,t.units,t.value],account.holdings.map(h=>[h.symbol,usd(h.price),h.units.toFixed(5),usd(h.value)])));panel.append(scroll);}
  const details=node('details'), list=node('ul');list.className='orders';details.append(node('summary',t.history));
  const events=[...account.events].reverse();if(account.pending)events.unshift({status:account.pending.side,day:account.pending.target,order:account.pending});
  for(const e of events){const symbols=(e.fills||e.order.picks||[]).map(x=>x.symbol).join(', ');
    const li=node('li',t[e.status]+' · '+e.day+(symbols?' · '+symbols:'')+' · '+when(e.order.submitted)+' · ');
    li.append(link('Heat '+e.order.signal.heat,e.order.signal.url));list.append(li);}
  details.append(events.length?list:node('p',t.waiting));panel.append(details);return panel;
}
async function read(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error(r.status);const s=await r.json();if(s.schema!==1||!s.books)throw Error('schema');return s;}
async function render(){
  const raw='https://raw.githubusercontent.com/Usubillaga/InvestorAce-Tradingdesk/main/dist/heat-overlap.json';
  let s, fallback=false;try{s=await read(raw);}catch{s=await read('heat-overlap.json');fallback=true;}
  id('status').textContent=[t.started+' · '+when(s.started),t.marked+' · '+s.as_of, fallback?t.local:''].filter(Boolean).join(' | ');
  for(const b of Object.values(s.books))id('books').append(book(b,s.selection));
  if(s.selection){id('ranking').append(table(['#',t.security,'SPY','QQQ'],s.selection.candidates.map((c,i)=>[i+1,c.name+' · '+c.classes.join(' / '),percent(c.weights.SPY),percent(c.weights.QQQ)])));
    id('sources').append(t.checked+' · '+when(s.selection.checked));
    for(const [f,v] of Object.entries(s.selection.sources))id('sources').append(' · ',link(f+' '+v.date,v.url));
  }else id('ranking').textContent=t.noWeights;
  const checks=id('checks');if(s.monitor)checks.append(t.latest+' · ',link(s.monitor.heat+' / 100 · '+when(s.monitor.as_of),s.monitor.url),'. ');
  checks.append(s.warnings.map(x=>x==='NO_NEW_READING'?t.noReading:x).join(' '));
  if(s.missed_checks.length)checks.append(' '+t.missed+' · '+s.missed_checks.join(', '));
}
render().catch(()=>{id('status').textContent=t.noData;});
