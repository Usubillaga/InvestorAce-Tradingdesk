const DeskRadar = (() => {
  const language = new URLSearchParams(location.search).get('lang') || navigator.language.slice(0,2);
  const lang = Object.hasOwn(LowRadar.words,language)?language:'de';
  let data, pending, lastCheck=0, saved=true;
  const show=()=>{
    const panel=document.querySelector('[data-desk-radar]');
    if(panel && data) panel.innerHTML=LowRadar.draw(data,lang,true,saved);
  };
  async function get(url) {
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(7000)});
    if(!response.ok) throw Error('HTTP '+response.status);
    const next=await response.json();
    if(next.schema!==1 || !Number.isFinite(Date.parse(next.captured)) ||
        !Array.isArray(next.rows) || next.rows.length!==Math.min(30,next.eligible) ||
        !next.rows.every(r=>Number.isFinite(r.distance) && Number.isFinite(Date.parse(r.observed)))) throw Error('Invalid snapshot');
    return next;
  }
  async function refresh() {
    if(!data) {
      try {data=await get('low-radar.json');show();} catch {}
    }
    try {
      const current=await get('https://usubillaga.github.io/InvestorAce/low-radar.json');
      if(!data || Date.parse(current.captured)>=Date.parse(data.captured)) {
        data=current;
        saved=false;
      }
    } catch {saved=true;}
    show();
    if(!data) {
      const panel=document.querySelector('[data-desk-radar]');
      if(panel) panel.textContent={de:'Radardaten nicht verfügbar.',es:'Datos del radar no disponibles.',en:'Radar data unavailable.'}[lang];
    }
  }
  return {
    label:()=>LowRadar.words[lang].nav,
    mount(main) {
      if(!main.querySelector('[data-desk-radar]')) {
        const panel=document.createElement('section');
        panel.dataset.deskRadar='';
        panel.textContent={en:'Loading quotes…',de:'Kurse werden geladen…',es:'Cargando cotizaciones…'}[lang];
        main.replaceChildren(panel);
        show();
      }
      if(!pending && Date.now()-lastCheck>60000) {
        lastCheck=Date.now();
        pending=refresh().finally(()=>{pending=null;});
      }
    }
  };
})();
