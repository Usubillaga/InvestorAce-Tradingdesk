/* Native TradingDesk view. Both journals are read-only and use the same schema as InvestorAce. */
const DeskPanic = (() => {
  const page = 'panic-paper';
  const labels = {es:'Pánico', de:'Panik', en:'Panic'};
  const ledgers = {original:'heat-account.json', overlap:'heat-overlap.json'};
  const raw = 'https://raw.githubusercontent.com/Usubillaga/InvestorAce-Tradingdesk/main/dist/';
  const referenceRoot = 'https://raw.githubusercontent.com/Usubillaga/InvestorAce/main/paper_trades/';
  const referenceNames = ['index-leaders.json','index-leaders-17.json','index-leaders-17-spcx-ant.json'];
  const fetchOptions = () => ({cache:'no-store', signal:AbortSignal.timeout(6000)});
  let records = JSON.parse(document.getElementById('desk-panic-seed').textContent);
  let container, section, shownLanguage, checked = 0, pending, revision = 0, displayed = -1;

  function language() {
    const requested = new URLSearchParams(location.search).get('lang') || navigator.language.slice(0,2);
    return Object.hasOwn(labels,requested) ? requested : 'de';
  }
  async function get(url) {
    const response = await fetch(url,fetchOptions());
    if (!response.ok) throw Error(String(response.status));
    return response.json();
  }
  function valid(key, value) {
    return value?.schema===1 && typeof value.as_of==='string' && (key==='original'
      ? Number.isFinite(value.equity) && Array.isArray(value.history)
      : value.books?.[5] && value.books?.[6]);
  }
  function relativeTime(value) {
    return Math.max(0,...[value?.monitor?.as_of,value?.intraday_monitor?.as_of,value?.selection?.checked,
      value?.pending?.submitted,...Object.values(value?.books || {}).map(book=>book.pending?.submitted)]
      .filter(Boolean).map(Date.parse).filter(Number.isFinite));
  }
  function update(key, value) {
    if (!valid(key,value)) return;
    const previous=records[key];
    if (previous && (previous.as_of>value.as_of ||
        previous.as_of===value.as_of && relativeTime(previous)>relativeTime(value))) return;
    if (JSON.stringify(value)===JSON.stringify(previous)) return;
    records[key]=value;
    revision++;
    draw();
  }
  async function refresh() {
    if (pending || Date.now()-checked<60000) return;
    checked=Date.now();
    const tasks=Object.entries(ledgers).map(async ([key,name])=>{
      // Local Pages data renders independently of GitHub or the general desk snapshot.
      try { update(key, await get(name)); } catch {}
      try { update(key, await get(raw+name)); } catch {}
    });
    tasks.push(Promise.all(referenceNames.map(name=>get(referenceRoot+name))).then(accounts=>{
      if (!accounts.every(a=>Array.isArray(a.marks) && a.marks.length && Number.isFinite(a.capital))) return;
      if (JSON.stringify(accounts)===JSON.stringify(records.claude)) return;
      records.claude=accounts;
      revision++;
      draw();
    }));
    pending=Promise.allSettled(tasks);
    await pending;
    pending=null;
    draw();
  }
  function languageNav(lang) {
    return '<nav class="panic-languages" aria-label="Español · Deutsch · English">'+
      ['es','de','en'].map(code=>{
        const url=new URL(location.href);
        url.searchParams.set('lang',code);
        const title={es:'Español',de:'Deutsch',en:'English'}[code];
        return '<a data-panic-language="'+code+'" lang="'+code+'" hreflang="'+code+'" href="'+esc(url.pathname+url.search+url.hash)+'"'+
          (lang===code?' aria-current="true"':'')+'>'+title+'</a>';
      }).join('')+'</nav>';
  }
  function reveal() {
    if(!container?.isConnected || !section) return;
    const details=container.querySelector('#panic-paper-'+section);
    if(!details) return;
    details.open=true;
    details.scrollIntoView({block:'start'});
  }
  function draw(force=false) {
    if (!container?.isConnected) return;
    const lang=language();
    if (!force && lang===shownLanguage && displayed===revision && records.original && records.overlap) return;
    const open=[...container.querySelectorAll('details[open]')].map(d=>d.id);
    const focused=document.activeElement?.closest('details')?.id;
    const complete=valid('original',records.original)&&valid('overlap',records.overlap);
    const first=!container.querySelector('article');
    const body=complete ? paperPanel(lang,records,paperWords,PaperModel) :
      '<p role="status">'+esc(pending||!checked?paperWords[lang].loading:paperWords[lang].unavailable)+'</p>';
    container.lang=lang;
    container.innerHTML=languageNav(lang)+'<ia-panic-alert lang="'+lang+'"></ia-panic-alert>'+body;
    for(const id of open){const d=document.getElementById(id);if(d) d.open=true;}
    if(focused)document.getElementById(focused)?.querySelector('summary')?.focus({preventScroll:true});
    shownLanguage=lang;displayed=revision;
    if(first && complete) reveal();
  }
  function mount(main, requestedSection) {
    const changed=!container?.isConnected;
    const next=['original','5','6','candidates','claude'].includes(requestedSection)?requestedSection:null;
    const moved=section!==next;
    section=next;
    if(changed) {
      container=document.createElement('section');
      container.className='desk-panic';
      main.replaceChildren(container);
    }
    draw(changed);
    if (moved) {
      for (const anchor of container.querySelectorAll('[data-panic-language]')) anchor.hash=location.hash;
      if (!changed) reveal();
    }
    refresh();
  }
  function changeLanguage(anchor) {
    const url=new URL(location.href);
    url.searchParams.set('lang',anchor.dataset.panicLanguage);
    history.replaceState(null,'',url);
  }
  const visible=()=>document.visibilityState!=='hidden' && container?.isConnected;
  document.addEventListener('visibilitychange',()=>{if(visible())refresh();});
  setInterval(()=>{if(visible())refresh();},300000);
  return {mount, changeLanguage, label:()=>labels[language()]};
})();
