// Пробный экзамен по Конституции: 20 вопросов (по одному из каждой главы + 6 случайных), 3 варианта,
// сдано — от 14 верных. Режимы: «Egzaminas» (ответы — в конце; 45 минут обратным отсчётом, за 15 минут — предупреждение,
// по нулю — итог, как на настоящем экзамене: инструкция NŠA VK-395) и «Treniruotė» (проверка сразу, время идёт вперёд).
// Перевод: в тренировке вопрос и каждый вариант можно подсмотреть кнопкой RU (подсказки считаются), после ответа
// переведено всё; в экзамене перевода нет — он в разборе в конце, как на настоящем экзамене.
// Банк — window.KONST.exam (data/egzaminas.tsv → scripts/web.py); история попыток — localStorage.
(() => {
  'use strict';
  const D = window.KONST, S = window.Speak, app = document.getElementById('app');
  const N = 20, PASS = 14, HIST = 'konst.exam.v1';
  const LIMIT = 45 * 60, WARN = 15 * 60;                  // экзамен: 45 минут, предупреждение — когда осталось 15
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
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
  const spent = () => Math.round((Date.now() - ex.t0) / 1000);
  const left = () => Math.max(0, LIMIT - spent());
  const timed = () => ex.mode === 'exam';
  const clockText = () => fmt(timed() ? left() : spent());
  const clockWarn = () => timed() && left() <= WARN;

  function start(mode, questions) {
    ex = { mode, qs: questions || pick(), ans: {}, i: 0, t0: Date.now(), done: false, peek: {} };   // peek: «вопрос:строка» → true
    clearInterval(timer);
    timer = setInterval(() => {
      if (timed() && left() === 0) { ex.timeout = true; finish(); return; }   // время вышло — итог
      const t = document.getElementById('clock');
      if (!t) return;
      t.textContent = clockText();
      if (clockWarn() && !t.parentElement.classList.contains('warn')) {
        t.parentElement.classList.add('warn');
        const n = document.getElementById('timenote');                        // «осталось 15 минут» — один раз, вслух тоже
        if (n) n.textContent = 'Liko 15 minučių (осталось 15 минут).';
      }
    }, 1000);
    show();
  }

  const hints = () => Object.keys(ex.peek).length;

  function show() {
    const q = ex.qs[ex.i], a = ex.ans[ex.i], practice = ex.mode === 'practice';
    const checked = practice && a !== undefined;
    const canPeek = practice && !checked;                    // подсмотреть — только в тренировке и до ответа
    const shown = key => checked || !!ex.peek[`${ex.i}:${key}`];
    const peek = key => { ex.peek[`${ex.i}:${key}`] = true; show(); };
    const peekBtn = key => canPeek ? el('button', { class: 'peek' + (shown(key) ? ' on' : ''), type: 'button',
      title: 'Rodyti vertimą (показать перевод — считается подсказкой)', 'aria-label': 'Rodyti vertimą (показать перевод)',
      on: { click: () => peek(key) } }, 'RU') : null;
    const opts = q.order.map((o, k) => {
      // буква варианта (.ol: «a)» / в виде «Vaikams» — кружок); после проверки перед ней ✓ у верного и ✗ у выбранного неверного
      const mark = checked ? (o === 0 ? '✓' : a === k ? '✗' : null) : null;
      const b = el('button', { class: 'abc', on: { click: () => choose(k) } },
        mark ? el('span', { class: 'mark', 'aria-hidden': 'true' }, mark) : null,
        el('span', { class: 'ol' }, LETTERS[k]),
        el('span', { class: 'ot' }, q.opts[o], shown(k) ? el('span', { class: 'optru' }, q.optsru[o]) : null));
      if (a === k) b.classList.add('picked');
      if (checked) { b.disabled = true; if (o === 0) b.classList.add('ok'); else if (a === k) b.classList.add('wrong'); }
      return canPeek ? el('div', { class: 'optrow' }, b, peekBtn(k)) : b;
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
    // тренировка: полоска из делений — по одному на вопрос: зелёное — верно, красное — нет, синее — текущий
    const right = j => ex.qs[j].order[ex.ans[j]] === 0;
    const nOk = Object.keys(ex.ans).filter(right).length;
    const segs = practice ? el('div', { class: 'segs', role: 'img',
      'aria-label': `Teisingai ${nOk}, neteisingai ${answered - nOk} iš ${ex.qs.length} (верно, неверно)` },
      ex.qs.map((_, j) => el('span', { class: ex.ans[j] !== undefined ? (right(j) ? 'ok' : 'bad') : j === ex.i ? 'cur' : null }))) : null;
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
      el('div', {}, q.order[a] === 0 ? '✓ Teisingai! (верно)'
        : `✗ Ne visai (не совсем). Teisingas atsakymas — ${LETTERS[q.order.indexOf(0)]}: ${q.opts[0]}`),
      el('div', { class: 'art' }, cite(q))) : null;
    keyHandler = e => {
      const n = 'abc123'.indexOf(e.key.toLowerCase());
      if (n >= 0) choose(n % 3);
      else if (e.key === 'ArrowRight' && !practice && ex.i < ex.qs.length - 1) { ex.i++; show(); }
      else if (e.key === 'ArrowLeft' && !practice && ex.i > 0) { ex.i--; show(); }
      else if ((e.key === 'Enter' || e.key === ' ') && checked) { e.preventDefault(); nav.querySelector('.primary').click(); }
      else if ((e.key === 't' || e.key === 'T') && canPeek) peek('q');      // T — перевод вопроса
    };
    app.replaceChildren(...[
      el('div', { class: 'examhead' },
        el('span', {}, `${practice ? 'Treniruotė' : 'Egzaminas'} · ${ex.i + 1} / ${ex.qs.length}`),
        el('span', { class: 'tools' }, window.Look ? window.Look.zoomButtons() : null,      // размер текста
          el('span', { class: 'ru clockbox' + (clockWarn() ? ' warn' : ''),
            title: timed() ? 'Liko laiko (осталось времени), iš viso 45 min.' : 'Laikas (время)' },
            '⏱ ', el('span', { id: 'clock' }, clockText())))),
      timed() ? el('p', { id: 'timenote', class: 'timenote', role: 'status' }, clockWarn() ? 'Liko 15 minučių (осталось 15 минут).' : '') : null,
      dots, segs,
      el('div', { class: 'card' },
        el('div', { class: 'tag' }, c ? `${c.roman}. ${c.lt}` : ''),
        el('div', { class: 'front fact' }, q.q, sayBtn(q.q), peekBtn('q')),
        shown('q') ? el('div', { class: 'qru' }, q.qru) : null,
        el('div', { class: 'opts long' }, opts),
        feedback),
      nav].filter(Boolean));          // в тренировке вместо сетки номеров (dots = null) — полоска делений (segs)
  }

  function finish() {
    clearInterval(timer); keyHandler = null; ex.done = true;
    const secs = timed() ? Math.min(spent(), LIMIT) : spent();
    const right = ex.qs.filter((q, i) => ex.ans[i] !== undefined && q.order[ex.ans[i]] === 0).length;
    const passed = right >= PASS;
    const hist = read(HIST, []);
    hist.unshift({ d: new Date().toISOString().slice(0, 16).replace('T', ' '), right, n: ex.qs.length, passed, secs, mode: ex.mode,
                   hints: hints() });
    write(HIST, hist.slice(0, 20));
    const wrong = ex.qs.map((q, i) => ({ q, a: ex.ans[i] })).filter(x => x.a === undefined || x.q.order[x.a] !== 0);
    app.replaceChildren(...[
      el('div', { class: 'card result ' + (passed ? 'pass' : 'fail') },
        el('p', { class: 'big' }, `${right} / ${ex.qs.length}`),
        ex.timeout ? el('p', { class: 'summary' }, 'Laikas baigėsi (время вышло) — neatsakyti klausimai neįskaityti.') : null,
        el('p', { class: 'summary' }, passed ? 'Išlaikyta! (сдано)' : `Neišlaikyta (не сдано) — reikia ne mažiau kaip ${PASS}`),
        el('p', { class: 'ru' }, `Laikas (время): ${fmt(secs)}`
          + (ex.mode === 'practice' ? ` · vertimo užuominos (подсказки перевода): ${hints()}` : ''))),
      wrong.length ? el('div', { class: 'card' },
        el('p', { class: 'summary' }, `Klaidos (ошибки): ${wrong.length}`),
        el('ol', { class: 'review' }, wrong.map(({ q, a }) => reviewItem(q, a)))) : null,
      el('details', { class: 'card all' },                  // разбор всех вопросов — с переводом
        el('summary', {}, 'Visi klausimai su vertimu (все вопросы с переводом)'),
        el('ol', { class: 'review' }, ex.qs.map((q, i) => reviewItem(q, ex.ans[i])))),
      el('div', { class: 'actions' },
        wrong.length ? el('button', { on: { click: () => start('practice', wrong.map(x => Object.assign({}, x.q, { order: shuffle([0, 1, 2]) }))) } },
          'Kartoti klaidas (повторить ошибки)') : null,
        el('button', { class: 'primary', on: { click: home } }, 'Į pradžią (в начало)'))].filter(Boolean));
  }

  // строка разбора: вопрос и ответы — с переводом
  function reviewItem(q, a) {
    const ok = a !== undefined && q.order[a] === 0, tr = i => el('span', { class: 'ru' }, ` — ${q.optsru[i]}`);
    return el('li', {},
      el('div', { class: 'rq' }, q.q), el('div', { class: 'ru' }, q.qru),
      ok ? null : (a !== undefined ? el('div', { class: 'bad' }, '✗ ', q.opts[q.order[a]], tr(q.order[a])) : el('div', { class: 'bad' }, '✗ —')),
      el('div', { class: 'good' }, '✓ ', q.opts[0], tr(0), ' ', el('span', { class: 'art' }, cite(q))));
  }

  function home() {
    clearInterval(timer); keyHandler = null;
    const hist = read(HIST, []);
    app.replaceChildren(...[
      el('div', { class: 'card' },
        el('p', {}, `${N} klausimų lietuvių kalba, po 3 atsakymų variantus; išlaikyta, jei teisingai atsakyta į ne mažiau kaip ${PASS}.`),
        el('p', { class: 'ru' }, `${N} вопросов на литовском, по 3 варианта ответа; экзамен сдан, если верно не меньше ${PASS}. `
          + 'Так по официальной программе экзамена (2004 г., ред. 2009 г.): вопросы — по всем главам Конституции. '
          + 'Экзамен проводит Национальное агентство образования (NŠA) на компьютере, на него даётся 45 минут; '
          + 'здесь в режиме «Egzaminas» — тоже 45 минут обратным отсчётом, в тренировке время не ограничено. '
          + `Здесь вопросы — по всем 14 главам (банк: ${D.exam.length}).`),
        el('p', { class: 'ru' }, 'Перевод. В тренировке перевод вопроса и любого варианта можно подсмотреть кнопкой RU '
          + '(вопрос — и клавишей T); подсказки считаются в результате. После ответа переведено всё. В экзамене перевода '
          + 'нет, как на настоящем экзамене: он в разборе в конце.')),
      el('div', { class: 'actions' },
        el('button', { class: 'primary', on: { click: () => start('exam') } }, 'Egzaminas (экзамен)'),
        el('button', { on: { click: () => start('practice') } }, 'Treniruotė (с проверкой сразу)')),
      (() => {                                                       // голос озвучки вопросов: Ona / Leonas
        const pick = S && S.available() ? S.voiceSelect() : null;
        return pick ? el('label', { class: 'voiceline' }, el('span', {}, 'Balsas ', el('span', { class: 'ru' }, '(голос)')), pick) : null;
      })(),
      window.Look ? el('div', { class: 'voiceline' }, el('span', {}, 'Teksto dydis ', el('span', { class: 'ru' }, '(размер текста)')),
        window.Look.zoomButtons()) : null,
      hist.length ? el('div', { class: 'card' },
        el('p', { class: 'summary' }, 'Bandymai (попытки)'),
        el('table', { class: 'stats' }, el('tbody', {}, hist.map(h => el('tr', {},
          el('td', {}, h.d), el('td', {}, h.mode === 'practice' ? 'treniruotė' : 'egzaminas'),
          el('td', { class: 'num' }, `${h.right}/${h.n}`), el('td', { class: 'num' }, fmt(h.secs)),
          el('td', { class: 'num', title: 'подсказки перевода' }, h.mode === 'practice' && h.hints != null ? `RU ${h.hints}` : ''),
          el('td', { class: h.passed ? 'okc' : 'badc' }, h.passed ? '✓' : '✗')))))) : null].filter(Boolean));
  }

  document.addEventListener('keydown', e => {
    if (keyHandler && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) keyHandler(e);
  });
  if (S) S.onReady(ok => { if (ok && ex && !ex.done) show(); });
  home();
})();
