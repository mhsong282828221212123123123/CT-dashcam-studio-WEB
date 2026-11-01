(() => {
  const root = document.documentElement;
  const themes = ['graphite','midnight','forest','burgundy','amber','paper','paper-blue','paper-violet','paper-rose','paper-sand'];
  const selector = document.getElementById('intro-theme');
  if (selector) {
    selector.value = root.dataset.theme || 'graphite';
    selector.addEventListener('change', () => {
      if (!themes.includes(selector.value)) return;
      root.dataset.theme = selector.value;
      const background = getComputedStyle(root).getPropertyValue('--bg-app').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
      try { localStorage.setItem(location.pathname.includes('/dev/') ? 'ct_theme_dev' : 'ct_theme', selector.value); } catch {}
    });
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const items = Array.from(document.querySelectorAll('[data-reveal]'));
  let observer;
  const revealAll = () => { root.classList.remove('reveal-ready'); items.forEach(item=>item.classList.add('is-visible')); observer?.disconnect(); };
  if (reduced.matches || !('IntersectionObserver' in window)) revealAll();
  else {
    try {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => { if(entry.isIntersecting){ entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
      }, {threshold:.12, rootMargin:'0px 0px -25px 0px'});
      items.forEach(item => { if(item.getBoundingClientRect().top < innerHeight - 25) item.classList.add('is-visible'); else observer.observe(item); });
      root.classList.add('reveal-ready');
    } catch { revealAll(); }
  }
  reduced.addEventListener?.('change', event => { if(event.matches) revealAll(); });
  let queued = false;
  const update = () => { const range = root.scrollHeight - innerHeight; root.style.setProperty('--scroll-progress', String(range > 0 ? scrollY / range : 0)); queued=false; };
  window.addEventListener('scroll', () => { if(!queued){queued=true;requestAnimationFrame(update);} }, {passive:true});
  update();
  document.addEventListener('click', event => {
    const menu=document.querySelector('.language-menu');
    if(menu?.open && !menu.contains(event.target)) menu.open=false;
  });
  document.addEventListener('keydown', event => { if(event.key==='Escape'){const menu=document.querySelector('.language-menu');if(menu?.open){menu.open=false;menu.querySelector('summary')?.focus();}} });
  // Hash targets stay readable even if a browser jumps past the reveal threshold.
  window.addEventListener('hashchange', () => { const target=document.getElementById(location.hash.slice(1));target?.classList.add('is-visible'); });
})();
