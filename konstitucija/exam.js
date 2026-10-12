// Пробный экзамен по Конституции: 20 вопросов (по одному из каждой главы + 6 случайных), 3 варианта,
// сдано — от 14 верных. Режимы: «Egzaminas» (ответы — в конце) и «Treniruotė» (проверка сразу).
// Банк — window.KONST.exam (data/egzaminas.tsv → scripts/web.py); история попыток — localStorage.
(() => {
  'use strict';
  const D = window.KONST, S = window.Speak, app = document.getElementById('app');
  const N = 20, PASS = 14, HIST = 'konst.exam.v1', PREFS = 'konst.examprefs.v1';
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
  const prefs = Object.assign({ ru: false }, read(PREFS, {}));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const chapter = no => D.chapters.find(c => c.no === no);
  const cite = q => q.art === '0' ? '(Preambulė)' : `(${q.artsk} SK. ${q.art} str.)`;
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const LETTERS = 'abc';

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  const sayBtn = text => (S && S.available() ? S.button(text) : null);

  // 20 вопросов: по одному из каждой главы, остальные — случайно из всего банка; порядок — по главам
  function pick() {
    const bank = shuffle(D.exam.map((q, i) => Object.assign({ id: i }, q)));
    const chosen = [], used = new Set();
    for (const c of D.chapters) {
      const q = bank.find(x => x.sk === c.no && !used.has(x.id));
      if (q) { chosen.push(q); used.add(q.id); }
    }
    for (const q of bank) { if (chosen.length >= N) break; if (!used.has(q.id)) { chosen.push(q); used.add(q.id); } }
    return chosen.sort((a, b) => a.sk - b.sk)
      .map(q => Object.assign(q, { order: shuffle([0, 1, 2]) }));   // 0 — верный вариант
  }

  let ex = null, timer = null, keyHandler = null;

  function start(mode, questions) {
    ex = { mode, qs: questions || pick(), ans: {}, i: 0, t0: Date.now(), done: false };
    clearInterval(timer);
    timer = setInterval(() => { const t = document.getElementById('clock'); if (t) t.textContent = fmt(Math.round((Date.now() - ex.t0) / 1000)); }, 1000);
    show();
  }

  function show() {
    const q = ex.qs[ex.i], a = ex.ans[ex.i], practice = ex.mode === 'practice';
    const checked = practice && a !== undefined;
    const opts = q.order.map((o, k) => {
      const b = el('button', { on: { click: () => choose(k) } }, `${LETTERS[k]}) ${q.opts[o]}`);
      if (a === k) b.classList.add('picked');
      if (checked) { b.disabled = true; if (o === 0) b.classList.add('ok'); else if (a === k) b.classList.add('wrong'); }
      return b;
    });
    function choose(k) {
      if (checked) return;
      ex.ans[ex.i] = k;
      if (!practice && ex.i < ex.qs.length - 1) { ex.i++; }
      show();
    }
    const dots = !practice ? el('div', { class: 'dots' }, ex.qs.map((_, j) =>
      el('button', { class: 'dot' + (j === ex.i ? ' cur' : '') + (ex.ans[j] !== undefined ? ' done' : ''), title: `${j + 1}`,
        on: { click: () => { ex.i = j; show(); } } }, String(j + 1)))) : null;
    const answered = Object.keys(ex.ans).length;
    const nav = el('div', { class: 'actions' },
      ex.i > 0 && !practice ? el('button', { on: { click: () => { ex.i--; show(); } } }, '← Atgal') : null,
      practice
        ? (checked ? el('button', { class: 'primary', on: { click: () => { if (ex.i < ex.qs.length - 1) { ex.i++; show(); } else finish(); } } },
            ex.i < ex.qs.length - 1 ? 'Kitas (дальше) →' : 'Rezultatas (результат)') : null)
        : (ex.i < ex.qs.length - 1 ? el('button', { on: { click: () => { ex.i++; show(); } } }, 'Toliau →') : null),
      !practice ? el('button', { class: 'primary', on: { click: () => {
        const left = ex.qs.length - Object.keys(ex.ans).length;
        if (!left || confirm(`Neatsakyta (без ответа): ${left}. Baigti egzaminą? (Завершить?)`)) finish();
      } } }, `Baigti (${answered}/${ex.qs.length})`) : null);
    const c = chapter(q.sk);
    const feedback = checked ? el('div', { class: 'feedback' },
      el('div', {}, q.order[a] === 0 ? '✓ Teisingai! (верно)' : `✗ Teisingas atsakymas (верный ответ): ${q.opts[0]}`),
      el('div', { class: 'art' }, cite(q))) : null;
    keyHandler = e => {
      const n = 'abc123'.indexOf(e.key.toLowerCase());
      if (n >= 0) choose(n % 3);
      else if (e.key === 'ArrowRight' && !practice && ex.i < ex.qs.length - 1) { ex.i++; show(); }
      else if (e.key === 'ArrowLeft' && !practice && ex.i > 0) { ex.i--; show(); }
      else if ((e.key === 'Enter' || e.key === ' ') && checked) { e.preventDefault(); nav.querySelector('.primary').click(); }
    };
    app.replaceChildren(...[
      el('div', { class: 'examhead' },
        el('span', {}, `${practice ? 'Treniruotė' : 'Egzaminas'} · ${ex.i + 1} / ${ex.qs.length}`),
        el('span', { class: 'ru' }, '⏱ ', el('span', { id: 'clock' }, fmt(Math.round((Date.now() - ex.t0) / 1000))))),
      dots,
      el('div', { class: 'card' },
        el('div', { class: 'tag' }, c ? `${c.roman}. ${c.lt}` : ''),
        el('div', { class: 'front fact' }, q.q, sayBtn(q.q)),
        prefs.ru ? el('div', { class: 'hint' }, q.qru) : null,
        el('div', { class: 'opts long' }, opts),
        feedback),
      nav].filter(Boolean));          // в тренировке нет сетки номеров (dots = null)
  }

  function finish() {
    clearInterval(timer); keyHandler = null; ex.done = true;
    const secs = Math.round((Date.now() - ex.t0) / 1000);
    const right = ex.qs.filter((q, i) => ex.ans[i] !== undefined && q.order[ex.ans[i]] === 0).length;
    const passed = right >= PASS;
    const hist = read(HIST, []);
    hist.unshift({ d: new Date().toISOString().slice(0, 16).replace('T', ' '), right, n: ex.qs.length, passed, secs, mode: ex.mode });
    write(HIST, hist.slice(0, 20));
    const wrong = ex.qs.map((q, i) => ({ q, a: ex.ans[i] })).filter(x => x.a === undefined || x.q.order[x.a] !== 0);
    app.replaceChildren(...[
      el('div', { class: 'card result ' + (passed ? 'pass' : 'fail') },
        el('p', { class: 'big' }, `${right} / ${ex.qs.length}`),
        el('p', { class: 'summary' }, passed ? 'Išlaikyta! (сдано)' : `Neišlaikyta (не сдано) — reikia ne mažiau kaip ${PASS}`),
        el('p', { class: 'ru' }, `Laikas (время): ${fmt(secs)}`)),
      wrong.length ? el('div', { class: 'card' },
        el('p', { class: 'summary' }, `Klaidos (ошибки): ${wrong.length}`),
        el('ol', { class: 'review' }, wrong.map(({ q, a }) => el('li', {},
          el('div', { class: 'rq' }, q.q), el('div', { class: 'ru' }, q.qru),
          a !== undefined ? el('div', { class: 'bad' }, '✗ ', q.opts[q.order[a]]) : el('div', { class: 'bad' }, '✗ —'),
          el('div', { class: 'good' }, '✓ ', q.opts[0], ' ', el('span', { class: 'art' }, cite(q))))))) : null,
      el('div', { class: 'actions' },
        wrong.length ? el('button', { on: { click: () => start('practice', wrong.map(x => Object.assign({}, x.q, { order: shuffle([0, 1, 2]) }))) } },
          'Kartoti klaidas (повторить ошибки)') : null,
        el('button', { class: 'primary', on: { click: home } }, 'Į pradžią (в начало)'))].filter(Boolean));
  }

  function home() {
    clearInterval(timer); keyHandler = null;
    const hist = read(HIST, []);
    const ru = el('input', { type: 'checkbox', id: 'ru' }); ru.checked = prefs.ru;
    ru.addEventListener('change', () => { prefs.ru = ru.checked; write(PREFS, prefs); });
    app.replaceChildren(...[
      el('div', { class: 'card' },
        el('p', {}, `${N} klausimų lietuvių kalba, po 3 atsakymų variantus; išlaikyta, jei teisingai atsakyta į ne mažiau kaip ${PASS}.`),
        el('p', { class: 'ru' }, `${N} вопросов на литовском, по 3 варианта ответа; экзамен сдан, если верно не меньше ${PASS}. `
          + 'Такой формат описывают курсы подготовки; официальная программа экзамена не опубликована — экзамен проводит NŠA, на компьютере. '
          + `Вопросы — по всем 14 главам Конституции (банк: ${D.exam.length}).`),
        el('label', { class: 'check' }, ru, ' Rodyti klausimų vertimą (показывать перевод вопросов)')),
      el('div', { class: 'actions' },
        el('button', { class: 'primary', on: { click: () => start('exam') } }, 'Egzaminas (экзамен)'),
        el('button', { on: { click: () => start('practice') } }, 'Treniruotė (с проверкой сразу)')),
      hist.length ? el('div', { class: 'card' },
        el('p', { class: 'summary' }, 'Bandymai (попытки)'),
        el('table', { class: 'stats' }, el('tbody', {}, hist.map(h => el('tr', {},
          el('td', {}, h.d), el('td', {}, h.mode === 'practice' ? 'treniruotė' : 'egzaminas'),
          el('td', { class: 'num' }, `${h.right}/${h.n}`), el('td', { class: 'num' }, fmt(h.secs)),
          el('td', { class: h.passed ? 'okc' : 'badc' }, h.passed ? '✓' : '✗')))))) : null].filter(Boolean));
  }

  document.addEventListener('keydown', e => {
    if (keyHandler && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) keyHandler(e);
  });
  if (S) S.onReady(ok => { if (ok && ex && !ex.done) show(); });
  home();
})();
