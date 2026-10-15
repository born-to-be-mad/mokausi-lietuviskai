// Произношение: сначала записанный звук выбранного голоса — Ona (женский, по умолчанию: web/audio/*.mp3 по словарю
// window.KONST_AUDIO из data/audio.js — генерирует scripts/tts.py) или Leonas (мужской: тот же файл в audio/leonas/;
// нет записи — играет Ona); если записи нет совсем — литовский голос браузера (Web Speech API, напр. Microsoft
// Ona/Leonas в Edge, тоже по выбору). На Mac браузеры литовского голоса не дают — там работают только записи.
// Скорость и голос — общие для всего сайта (localStorage konst.speak.v1).
// window.Speak: available() · say(text, {onend}) · stop() · rate (0.9 / 0.7) · voice ('ona' | 'leonas') · voices() ·
// voiceSelect() · onReady(cb) · icon() · button() · clean(text).
(() => {
  'use strict';
  const synth = window.speechSynthesis;
  const KEY = 'konst.speak.v1';
  const REC = window.KONST_AUDIO || {};                 // текст (после clean) → путь к mp3 голоса Ona
  const hasRec = Object.keys(REC).length > 0;
  const RECORDED = window.KONST_VOICES || { ona: Object.keys(REC).length };   // голос → сколько фраз записано
  const VOICES = { ona: ['Ona', 'женский голос'], leonas: ['Leonas', 'мужской голос'] };
  let voice = null, ready = false, player = null;
  const waiters = [];
  const prefs = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();

  // лучший литовский голос браузера: «естественные»/онлайн-голоса выше системных компактных
  function pickVoice() {
    const lt = (synth ? synth.getVoices() : []).filter(v => /^lt([-_]|$)/i.test(v.lang));
    const want = new RegExp(prefs.voice === 'leonas' ? 'leonas' : 'ona', 'i');   // выбранный голос — выше
    const score = v => (want.test(v.name) ? 8 : 0) + (/natural|neural|online/i.test(v.name) ? 4 : 0)
      + (/ona|leonas/i.test(v.name) ? 2 : 0) + (/google/i.test(v.name) ? 1 : 0);
    voice = lt.sort((a, b) => score(b) - score(a))[0] || null;
    if (!ready && (voice || hasRec || (synth && synth.getVoices().length))) finishReady();
  }
  function finishReady() { ready = true; waiters.splice(0).forEach(cb => cb(api.available())); }

  // текст из данных → для голоса: без разметки, дроби — словами, пропуск — пауза.
  // ТА ЖЕ функция — clean() в scripts/tts.py: по её результату ищется запись (менять обе вместе!)
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

  function speakVoice(text, opts) {                     // голос браузера (если есть литовский)
    if (!voice) return false;
    const u = new SpeechSynthesisUtterance(clean(text));
    u.voice = voice; u.lang = voice.lang; u.rate = api.rate;
    if (opts.onend) { u.onend = opts.onend; u.onerror = opts.onend; }
    synth.speak(u);
    return true;
  }

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* приватный режим */ } };
  // запись: проиграть src; не вышло — fallback (запись Ona или голос браузера)
  function play(src, opts, fallback) {
    const a = player = new Audio(src);
    a.playbackRate = api.rate <= 0.75 ? 0.75 : 1;           // «lėtai» — через playbackRate (тон сохраняется)
    a.onended = () => { if (player === a) player = null; if (opts.onend) opts.onend(); };
    a.onerror = () => { if (player === a) player = null; if (!fallback() && opts.onend) opts.onend(); };
    a.play().catch(() => {});
    return true;
  }

  const api = {
    get rate() { return prefs.rate || 0.9; },
    set rate(r) { prefs.rate = r; save(); },
    // голоса на выбор: с записями — те, что записаны; без записей (только голос браузера) — оба имени
    voices: () => Object.keys(VOICES).filter(v => !hasRec || RECORDED[v] > 0),
    get voice() { return api.voices().includes(prefs.voice) ? prefs.voice : 'ona'; },
    set voice(v) { prefs.voice = v; save(); if (synth) pickVoice(); },
    // выпадающий список «Ona (женский голос) / Leonas (мужской голос)», связанный с настройкой; short — только имена
    // (узкая панель чтения); один голос — null
    voiceSelect({ short = false } = {}) {
      const vs = api.voices();
      if (vs.length < 2) return null;
      const s = document.createElement('select');
      s.title = 'Balsas (голос)';
      vs.forEach(v => s.add(new Option(short ? VOICES[v][0] : `${VOICES[v][0]} (${VOICES[v][1]})`, v)));
      s.value = api.voice;
      s.addEventListener('change', () => { api.voice = s.value; api.stop(); });
      return s;
    },
    available: () => hasRec || !!voice,
    onReady(cb) { ready ? cb(api.available()) : waiters.push(cb); },
    clean,
    stop() {
      if (player) { player.onended = player.onerror = null; player.pause(); player = null; }
      if (synth) synth.cancel();
    },
    say(text, opts = {}) {
      api.stop();
      const src = REC[clean(text)];
      if (!src) return speakVoice(text, opts);
      const voiceless = () => speakVoice(text, opts);
      if (api.voice === 'leonas')                         // Leonas: тот же файл в audio/leonas/; нет его — Ona
        return play(src.replace(/^audio\//, 'audio/leonas/'), opts, () => play(src, opts, voiceless));
      return play(src, opts, voiceless);
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

  if (synth) {
    pickVoice();
    synth.addEventListener && synth.addEventListener('voiceschanged', pickVoice);
    setTimeout(() => { if (!ready) finishReady(); }, hasRec ? 0 : 2500);
  } else {
    finishReady();
  }
  window.Speak = api;
})();
