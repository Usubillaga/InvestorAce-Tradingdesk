(() => {
  const supported=['de','es','en'];
  const requested=new URLSearchParams(location.search).get('lang');
  const lang=requested||(location.pathname.endsWith('/heat-overlap.html')?navigator.language.slice(0,2):document.documentElement.lang);
  const hash=location.hash;
  const book=/^#account-(original|5|6)$/.exec(hash);
  const code=supported.includes(lang)?lang:'de';
  const target=hash==='#historia'
    ? 'https://usubillaga.github.io/InvestorAce/heat-archive'+(code==='en'?'.en':'')+'.html#historia'
    : './?lang='+code+'#panic-paper'+(book?'/'+book[1]:'');
  location.replace(new URL(target, location.href).href);
})();
