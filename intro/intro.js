(() => {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const items = Array.from(document.querySelectorAll('[data-reveal]'));
  let revealObserver;

  const revealAll = () => {
    root.classList.remove('reveal-ready');
    items.forEach((item) => item.classList.add('is-visible'));
    revealObserver?.disconnect();
  };

  if (reduced.matches || !('IntersectionObserver' in window)) {
    revealAll();
  } else {
    try {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -25px 0px' },
      );
      items.forEach((item) => {
        if (item.getBoundingClientRect().top < innerHeight - 25) item.classList.add('is-visible');
        else revealObserver.observe(item);
      });
      root.classList.add('reveal-ready');
    } catch {
      revealAll();
    }
  }

  reduced.addEventListener?.('change', (event) => {
    if (event.matches) revealAll();
  });

  // Reading progress
  let scrollQueued = false;
  const updateScroll = () => {
    const range = root.scrollHeight - innerHeight;
    root.style.setProperty('--scroll-progress', String(range > 0 ? scrollY / range : 0));
    scrollQueued = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!scrollQueued) {
        scrollQueued = true;
        requestAnimationFrame(updateScroll);
      }
    },
    { passive: true },
  );
  updateScroll();

  // Language menu accessibility
  document.addEventListener('click', (event) => {
    const menu = document.querySelector('.language-menu');
    if (menu?.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const menu = document.querySelector('.language-menu');
      if (menu?.open) {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    }
  });
  window.addEventListener('hashchange', () => {
    const target = document.getElementById(location.hash.slice(1));
    target?.classList.add('is-visible');
  });

  // Synchronized 4-channel video stages
  const stages = Array.from(document.querySelectorAll('.js-video-stage'));
  const playToggle = document.querySelector('.js-play-toggle');
  let userPaused = reduced.matches;

  const setPlayButtonState = (playing) => {
    if (!playToggle) return;
    playToggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
  };
  setPlayButtonState(!userPaused);

  const stageState = stages.map((el) => {
    const videos = Array.from(el.querySelectorAll('.cam-video'));
    const front = el.querySelector('[data-cam-video="front"]') || videos[0];
    return { el, videos, front, visible: false };
  });

  const syncStageVideos = (state) => {
    if (!state.front) return;
    const t = state.front.currentTime || 0;
    for (const v of state.videos) {
      if (v === state.front) continue;
      if (v.readyState >= 1 && Math.abs((v.currentTime || 0) - t) > 0.22) {
        try {
          v.currentTime = t;
        } catch {}
      }
    }
  };

  const applyPlayback = (state) => {
    const shouldPlay = state.visible && !userPaused && !reduced.matches;
    for (const v of state.videos) {
      if (shouldPlay) {
        if (v.preload === 'none') v.preload = 'metadata';
        if (v.paused) v.play().catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
    }
  };

  if ('IntersectionObserver' in window) {
    const stageObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const state = stageState.find((s) => s.el === entry.target);
          if (!state) continue;
          state.visible = entry.isIntersecting;
          applyPlayback(state);
        }
      },
      { threshold: 0.15 },
    );
    stageState.forEach((s) => stageObserver.observe(s.el));
  } else {
    stageState.forEach((s) => {
      s.visible = true;
      applyPlayback(s);
    });
  }

  playToggle?.addEventListener('click', () => {
    userPaused = !userPaused;
    setPlayButtonState(!userPaused);
    stageState.forEach(applyPlayback);
  });

  // Interactive Section 01 layout & camera switching
  const studyStage = document.querySelector('[data-stage="study"]');
  const layoutButtons = Array.from(document.querySelectorAll('[data-layout-btn]'));
  const camButtons = Array.from(document.querySelectorAll('[data-cam-btn]'));

  const setStudyCam = (cam) => {
    if (!studyStage) return;
    studyStage.dataset.activeCam = cam;
    studyStage.querySelectorAll('.cam-slot').forEach((slot) => {
      slot.classList.toggle('is-focused', slot.getAttribute('data-cam') === cam);
    });
    camButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-cam-btn') === cam);
    });
  };

  layoutButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout-btn');
      if (!studyStage || !layout) return;
      studyStage.dataset.layout = layout;
      layoutButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    });
  });

  camButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cam = btn.getAttribute('data-cam-btn');
      if (cam) setStudyCam(cam);
    });
  });

  studyStage?.querySelectorAll('.cam-slot').forEach((slot) => {
    slot.addEventListener('click', () => {
      const cam = slot.getAttribute('data-cam');
      if (!cam) return;
      if (studyStage.dataset.layout === 'quad' || studyStage.dataset.layout === 'single') {
        setStudyCam(cam);
      }
    });
  });

  // Video-synced live telemetry readout
  const timeNodes = Array.from(document.querySelectorAll('.js-hud-time'));
  const speedNodes = Array.from(document.querySelectorAll('.js-hud-speed'));
  const steerWheels = Array.from(document.querySelectorAll('.js-steer-wheel'));
  const steerDegs = Array.from(document.querySelectorAll('.js-steer-deg'));
  const pedalBars = Array.from(document.querySelectorAll('.js-pedal-bar'));
  const pedalPcts = Array.from(document.querySelectorAll('.js-pedal-pct'));
  const mapCars = Array.from(document.querySelectorAll('.js-map-car'));
  const blinkers = Array.from(document.querySelectorAll('.js-blinker'));
  const videoClock = document.querySelector('.js-video-clock');
  const playhead = document.querySelector('.js-playhead');
  const rangeHead = document.querySelector('.js-range-head');

  const pad2 = (n) => String(n).padStart(2, '0');
  let lastSync = 0;

  const updateTelemetry = (now) => {
    const hero = stageState[0];
    const study = stageState[1];
    const activeFront =
      (hero?.front && !hero.front.paused && hero.front) ||
      (study?.front && !study.front.paused && study.front) ||
      hero?.front;

    const duration = activeFront && Number.isFinite(activeFront.duration) && activeFront.duration > 0 ? activeFront.duration : 8;
    const t = activeFront ? activeFront.currentTime % duration : 0;
    const progress = Math.max(0, Math.min(1, t / duration));

    if (now - lastSync > 250) {
      stageState.forEach((s) => {
        if (s.visible && !userPaused) syncStageVideos(s);
      });
      lastSync = now;
    }

    const sec = Math.floor(t);
    const clockStr = `00:${pad2(sec)} / 00:${pad2(Math.round(duration))}`;
    if (videoClock) videoClock.textContent = clockStr;

    const timeStr = `12:34:${pad2(29 + sec)}`;
    timeNodes.forEach((n) => {
      n.textContent = timeStr;
    });

    const speed = Math.round(91 + Math.sin(progress * Math.PI * 2) * 3);
    speedNodes.forEach((n) => {
      n.textContent = String(speed);
    });

    const steer = Math.round(Math.sin(progress * Math.PI * 2 - 0.5) * 4);
    steerWheels.forEach((w) => {
      w.style.transform = `rotate(${steer * 2.5}deg)`;
    });
    const steerText = `${steer >= 0 ? '+' : ''}${steer}°`;
    steerDegs.forEach((d) => {
      d.textContent = steerText;
    });

    const pedal = Math.round(23 + Math.cos(progress * Math.PI * 2) * 5);
    pedalBars.forEach((b) => {
      b.style.width = `${pedal}%`;
    });
    pedalPcts.forEach((p) => {
      p.textContent = `${pedal}%`;
    });

    const mx = Math.round(24 + progress * 136);
    const my = Math.round(60 - progress * 44 - Math.sin(progress * Math.PI) * 5);
    mapCars.forEach((c) => {
      c.setAttribute('cx', String(mx));
      c.setAttribute('cy', String(my));
    });

    const rightBlink = t >= 4.2 && t <= 6.2 && Math.floor(t * 3.5) % 2 === 0;
    blinkers.forEach((b) => {
      const r = b.querySelector('.arrow-r');
      r?.classList.toggle('is-lit', rightBlink);
    });

    if (playhead) playhead.style.left = `${(progress * 100).toFixed(1)}%`;
    if (rangeHead) rangeHead.style.left = `${(25 + progress * 50).toFixed(1)}%`;

    requestAnimationFrame(updateTelemetry);
  };

  if (!reduced.matches) {
    requestAnimationFrame(updateTelemetry);
  }
})();
