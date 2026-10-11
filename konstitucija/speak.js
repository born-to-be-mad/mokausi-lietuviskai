// Произношение: литовский голос самого браузера/системы (Web Speech API) — Ona (macOS/iOS), Google lt-LT (Android),
// Microsoft Ona/Leonas (Edge). Ничего не записываем и не раздаём: говорит устройство читателя.
// window.Speak: available() · say(text, {onend}) · stop() · rate (0.8 / 1) · onReady(cb) · icon() · clean(text).
(() => {
  'use strict';
  const synth = window.speechSynthesis;
  const KEY = 'konst.speak.v1';
  let voice = null, ready = false;
  const waiters = [];
  const prefs = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();

  // лучший литовский голос: «естественные»/онлайн-голоса выше системных компактных
  function pickVoice() {
    const lt = (synth ? synth.getVoices() : []).filter(v => /^lt([-_]|$)/i.test(v.lang));
    const score = v => (/natural|neural|online/i.test(v.name) ? 4 : 0) + (/ona|leonas/i.test(v.name) ? 2 : 0) + (/google/i.test(v.name) ? 1 : 0);
    voice = lt.sort((a, b) => score(b) - score(a))[0] || null;
    if (!ready && (voice || (synth && synth.getVoices().length))) {
      ready = true;
      waiters.splice(0).forEach(cb => cb(!!voice));
    }
  }
  if (synth) {
    pickVoice();
    synth.addEventListener && synth.addEventListener('voiceschanged', pickVoice);
    setTimeout(() => { if (!ready) { ready = true; waiters.splice(0).forEach(cb => cb(!!voice)); } }, 2500);
  } else {
    ready = true;
  }

  // текст из данных → для голоса: без разметки, дроби — словами, пропуск — пауза
  const FRAC = { '1/2': 'pusė', '1/3': 'trečdalis', '1/4': 'ketvirtadalis', '1/5': 'penktadalis', '2/3': 'du trečdaliai',
                 '3/4': 'trys ketvirtadaliai', '3/5': 'trys penktadaliai', '4/5': 'keturi penktadaliai', '1/12': 'dvyliktoji dalis' };
  function clean(s) {
    return String(s || '')
      .replace(/\|/g, '').replace(/\*\*/g, '').replace(/^\s*\[[~?!]\]\s*/, '')
      .replace(/\b\d+\/\d+\b/g, f => FRAC[f] || f)
      .replace(/_{2,}/g, ' … ')
      .replace(/^[\s•–—-]+/, '').replace(/\s+[–—]\s+/g, ', ')
      .replace(/\s+\/\s+/g, ', ').replace(/\s·\s/g, ', ')
      .trim();
  }

  const api = {
    get rate() { return prefs.rate || 0.9; },
    set rate(r) { prefs.rate = r; try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* приватный режим */ } },
    available: () => !!voice,
    onReady(cb) { ready ? cb(!!voice) : waiters.push(cb); },
    clean,
    stop() { if (synth) synth.cancel(); },
    say(text, opts = {}) {
      if (!voice) return false;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(clean(text));
      u.voice = voice; u.lang = voice.lang; u.rate = api.rate;
      if (opts.onend) { u.onend = opts.onend; u.onerror = opts.onend; }
      synth.speak(u);
      return true;
    },
    // кнопка-динамик (SVG, без эмодзи)
    icon() {
      const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';
      return svg;
    },
    button(getText, label = 'Klausyti (слушать)') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'say'; b.title = label; b.setAttribute('aria-label', label);
      b.append(api.icon());
      b.addEventListener('click', e => { e.stopPropagation(); api.say(typeof getText === 'function' ? getText() : getText); });
      return b;
    },
  };
  window.Speak = api;
})();
