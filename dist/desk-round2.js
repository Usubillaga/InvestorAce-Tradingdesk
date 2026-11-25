/* Bundle the verified opening snapshot for offline use, then load the current report. */
const DeskRoundTwo = (() => {
  const current='https://usubillaga.github.io/InvestorAce/paper-round2.json';
  let data, offline=false, pending, lastCheck=0;
  function language() {
    const lang=new URLSearchParams(location.search).get('lang') || navigator.language.slice(0,2);
    return Object.hasOwn(RoundTwo.words,lang)?lang:'de';
  }
  function show() {
    const panel=document.querySelector('[data-round2-desk]');
    if (!panel) return;
    const lang=language();
    const nav=document.createElement('nav');
    nav.className='ia-pp-lang';
    for (const [code,name] of Object.entries({de:'Deutsch',en:'English',es:'Español'})) {
      const a=document.createElement('a'), url=new URL(location.href);
      url.searchParams.set('lang',code);
      a.href=url.href;
      a.hreflang=code;
      a.textContent=name;
      if(lang===code) a.setAttribute('aria-current','true');
      nav.append(a,' ');
    }
    const opened=[...panel.querySelectorAll('details')].map(d=>d.open);
    panel.innerHTML=data?RoundTwo.draw(data,lang,offline):RoundTwo.words[lang].error;
    panel.prepend(nav);
    panel.querySelectorAll('details').forEach((el,i)=>{el.open=Boolean(opened[i]);});
  }
  async function refresh() {
    if (!data) {
      try {data=await RoundTwo.get('paper-round2.json');show();} catch {}
    }
    try {
      const next=await RoundTwo.get(current);
      if(!data || next.built>=data.built) data=next;
      offline=false;
    } catch {offline=true;}
    show();
  }
  return {
    label:()=>RoundTwo.words[language()].title,
    mount(main) {
      if(!main.querySelector('[data-round2-desk]')) {
        main.replaceChildren(document.createElement('section'));
        main.firstElementChild.setAttribute('data-round2-desk','');
        if(data) show();
        else main.firstElementChild.setAttribute('aria-busy','true');
      }
      if(!pending && Date.now()-lastCheck>60000) {
        lastCheck=Date.now();
        pending=refresh().finally(()=>{pending=null; main.querySelector('[data-round2-desk]')?.removeAttribute('aria-busy');});
      }
    }
  };
})();
