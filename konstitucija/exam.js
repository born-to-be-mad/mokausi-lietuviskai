// Пробный экзамен по Конституции: 20 вопросов (по одному из каждой главы + 6 случайных), 3 варианта,
// сдано — от 14 верных. Режимы: «Egzaminas» (ответы — в конце; 45 минут обратным отсчётом, за 15 минут — предупреждение,
// по нулю — итог, как на настоящем экзамене: инструкция NŠA VK-395) и «Treniruotė» (проверка сразу, время идёт вперёд;
// 20 вопросов или быстрые 5).
// Перевод: в тренировке вопрос и каждый вариант можно подсмотреть кнопкой RU (подсказки считаются), после ответа
// переведено всё и есть цитата статьи (data/citatos.js); в экзамене перевода нет — он в разборе в конце, как на настоящем.
// Незаконченный экзамен хранится в konst.exam.cur (только этот браузер): после перезагрузки — «Tęsti egzaminą»; время
// идёт и пока страница закрыта, вышло — итог по данным ответам.
// Банк — window.KONST.exam (data/egzaminas.tsv → scripts/web.py); история попыток и журнал по вопросам — localStorage.
// Старт: кнопки, ниже свёрнутые карточки — план (в заголовке — что сегодня), готовность (в заголовке — «N iš 3»),
// по главам, как это работает, попытки; открытые запоминаются. Накануне и в день экзамена (по плану) — только главное.
// «Pasiruošimo planas»: дата экзамена → главы по дням, «сегодня» — следующие несделанные; ?sk=N — вопросы одной главы.
(() => {
  'use strict';
  const D = window.KONST, S = window.Speak, C = window.KONST_CIT, app = document.getElementById('app');
  const N = 20, QUICK = 5, PASS = 14, KNOWN = 2, REVIEW_DAYS = 14, DAY = 864e5;
  const HIST = 'konst.exam.v1', JOURNAL = 'konst.examq.v1', CUR = 'konst.exam.cur', OPEN = 'konst.exam.open', LEN = 'konst.exam.len';
  const LIMIT = 45 * 60, WARN = 15 * 60;                  // экзамен: 45 минут, предупреждение — когда осталось 15
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
  const drop = k => { try { localStorage.removeItem(k); } catch { /* приватный режим */ } };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const chapter = no => D.chapters.find(c => c.no === no);
  // ссылка на статью — в тексте Конституции (tekstas.html), в новой вкладке, чтобы не сбить экзамен
  const cite = q => el('a', { class: 'artlink', href: q.art === '0' ? 'tekstas.html#sk0' : `tekstas.html#str${q.art}`, target: '_blank', rel: 'noopener', title: 'Atidaryti straipsnį (открыть статью в новой вкладке)' },
    q.art === '0' ? '(Preambulė)' : `(${q.artsk} SK. ${q.art} str.)`);
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
  const L = window.Look;
  const h2 = (lt, ru) => el('h2', { class: 'cardh' }, lt, el('span', { class: 'ru' }, ru));   // заголовок карточки
  const ico = name => (L ? L.iconEl(name) : null);                                            // значок из спрайта страницы
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100;
    return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`; };

  // журнал по вопросам (id — из текста вопроса): right / wrong — сколько раз, s — верно подряд без подсказки перевода,
  // w — был неверный ответ и после него ещё нет KNOWN верных подряд (одно угадывание — 1 из 3 — слабость не снимает),
  // t — когда последний ответ (и для синхронизации, sync.js), wt — когда последняя ошибка («Paskutinės klaidos»).
  // Вопрос новый, слабый (w), выучен (s ≥ KNOWN) или изучается; выученный, но не встречавшийся REVIEW_DAYS дней, — пора
  // повторить (в «Kartoti»; готовность это не снижает)
  const journal = () => read(JOURNAL, {});
  const state = r => !r ? 'new' : r.w ? 'weak' : (r.s || 0) >= KNOWN ? 'known' : 'learn';
  const due = r => state(r) === 'known' && Date.now() - (r.t || 0) > REVIEW_DAYS * DAY;
  const RANK = { new: 0, weak: 1, learn: 2, known: 3 };
  const rank = r => due(r) ? RANK.learn : RANK[state(r)];
  function record(items) {                                            // [{ q, ok, hint }]
    const j = journal();
    for (const { q, ok, hint } of items) {
      const r = Object.assign({ right: 0, wrong: 0, s: 0 }, j[q.id]);
      if (ok) { r.right++; if (!hint) r.s++; if (r.s >= KNOWN) r.w = false; } else { r.wrong++; r.w = true; r.s = 0; r.wt = Date.now(); }
      r.t = Date.now(); j[q.id] = r;
    }
    write(JOURNAL, j);
    L?.track('q', items.length);                                      // «сегодня сделано» (look.js)
  }
  const hinted = i => Object.keys(ex.peek).some(k => k.split(':')[0] === String(i));
  const prep = qs => qs.sort((a, b) => a.sk - b.sk).map(q => Object.assign(q, { order: shuffle([0, 1, 2]) }));   // 0 — верный вариант
  const qlen = () => (read(LEN, N) === QUICK ? QUICK : N);            // длина тренировки: 20 или быстрые 5
  // «Silpnos vietos» — слабые (их столько же, сколько в готовности и «Tęsti»); слабых нет — «Kartoti»: изучаемые и
  // выученные давно. За раз — столько, сколько выбрано для тренировки
  function drill(n = qlen()) {
    const j = journal(), pool = f => shuffle(D.exam).filter(q => f(j[q.id]));
    const weak = pool(r => state(r) === 'weak'), rep = weak.length ? [] : pool(r => state(r) === 'learn' || due(r));
    const qs = (weak.length ? weak : rep).slice(0, n).map(q => Object.assign({}, q));
    return weak.length ? { n: weak.length, qs, label: 'Silpnos vietos', btn: 'Silpnos vietos (слабые места)' }
      : { n: rep.length, qs, label: 'Kartojimas', btn: 'Kartoti (повторить)' };
  }
  // последние ошибки — для дня экзамена
  function lastWrong(n = N) {
    const j = journal();
    return D.exam.filter(q => j[q.id] && j[q.id].wrong).sort((a, b) => (j[b.id].wt || j[b.id].t || 0) - (j[a.id].wt || j[a.id].t || 0))
      .slice(0, n).map(q => Object.assign({}, q));
  }

  // n вопросов: при 20 — по одному из каждой главы, остальные — из всего банка; при 5 — из разных глав. Порядок — по главам.
  // В экзамене — случайно (честная мера готовности); в тренировке — сначала новые, потом слабые, изучаемые и выученные
  function pick(mode, n = N) {
    const j = journal();
    let bank = shuffle(D.exam.map(q => Object.assign({}, q)));
    if (mode === 'practice') bank = bank.map(q => [rank(j[q.id]), q]).sort((a, b) => a[0] - b[0]).map(([, q]) => q);
    const chosen = [], used = new Set(), take = q => { chosen.push(q); used.add(q.id); };
    if (n >= D.chapters.length) for (const c of D.chapters) { const q = bank.find(x => x.sk === c.no && !used.has(x.id)); if (q) take(q); }
    else for (const q of bank) { if (chosen.length >= n) break; if (!chosen.some(x => x.sk === q.sk)) take(q); }
    for (const q of bank) { if (chosen.length >= n) break; if (!used.has(q.id)) take(q); }
    return prep(chosen);
  }

  let ex = null, timer = null, keyHandler = null;
  const spent = () => Math.round((Date.now() - ex.t0) / 1000);
  const left = () => Math.max(0, LIMIT - spent());
  const timed = () => ex.mode === 'exam';
  const clockText = () => fmt(timed() ? left() : spent());
  const clockWarn = () => timed() && left() <= WARN;

  // незаконченный экзамен: konst.exam.cur = { ids, order, ans, i, t0 } — пишется при каждом показе вопроса
  function saveCur() {
    if (ex && ex.mode === 'exam' && !ex.custom && !ex.done)
      write(CUR, { ids: ex.qs.map(q => q.id), order: ex.qs.map(q => q.order), ans: ex.ans, i: ex.i, t0: ex.t0 });
  }
  function loadCur() {
    const c = read(CUR, null), by = new Map(D.exam.map(q => [q.id, q]));
    if (!c || !Array.isArray(c.ids) || !c.t0 || !c.ids.every(id => by.has(id))) { if (c) drop(CUR); return null; }   // банк сменился
    return { mode: 'exam', qs: c.ids.map((id, k) => Object.assign({}, by.get(id), { order: c.order[k] })), custom: false,
             ans: c.ans || {}, i: c.i || 0, t0: c.t0, done: false, peek: {} };
  }

  // questions — свой набор («Silpnos vietos», «Kartoti klaidas», глава): без вердикта «сдано» и не в истории попыток
  function start(mode, questions, label, n) {
    ex = { mode, qs: questions ? prep(questions) : pick(mode, mode === 'exam' ? N : (n || qlen())), custom: !!questions, label,
           ans: {}, i: 0, t0: Date.now(), done: false, peek: {} };   // peek: «вопрос:строка» → true
    run();
  }
  function run() {
    document.body.classList.toggle('focus-mode', ex.mode === 'exam');   // экзамен на время — без разделов и нижней панели
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

  // «Pranešti apie klaidą» у вопроса: сообщение уйдёт с id вопроса (look.js)
  const reportBtn = q => el('button', { type: 'button', class: 'linkish rep', 'data-report': '', 'data-ref': q.id },
    'Pranešti apie klaidą ', el('span', { class: 'ru' }, '(ошибка в вопросе?)'));
  // цитата статьи (data/citatos.js): раскрывается под ответом и в разборе; нужные пункты длинного списка — выделены
  function quote(q) {
    const k = C && C.q[q.id], p = k && C.p[k];
    if (!p) return null;
    const [lt, ru, label, hl] = p;
    const lines = (s, cls, lang) => el('div', { class: cls, lang }, s.split('\n').map((x, i) => el('p', { class: hl.includes(i) ? 'hl' : null }, x)));
    return el('details', { class: 'cit' },
      el('summary', {}, 'Straipsnio tekstas ', el('span', { class: 'ru' }, '(текст статьи)'), ' · ', label),
      lines(lt, 'cit-lt', 'lt'), lines(ru, 'cit-ru', 'ru'));
  }

  // focus: 'q' — к вопросу (переход), 'next' — к главной кнопке (после ответа в тренировке), 'peek:<ключ>' — к той же кнопке RU
  function show(focus = 'q') {
    saveCur();
    const q = ex.qs[ex.i], a = ex.ans[ex.i], practice = ex.mode === 'practice';
    const checked = practice && a !== undefined;
    const canPeek = practice && !checked;                    // подсмотреть — только в тренировке и до ответа
    const shown = key => checked || !!ex.peek[`${ex.i}:${key}`];
    const peek = key => { ex.peek[`${ex.i}:${key}`] = true; show(`peek:${key}`); };
    const peekBtn = key => canPeek ? el('button', { class: 'peek' + (shown(key) ? ' on' : ''), type: 'button', 'data-peek': key,
      title: 'Rodyti vertimą (показать перевод — считается подсказкой)', 'aria-label': 'Rodyti vertimą (показать перевод)',
      on: { click: () => peek(key) } }, 'RU') : null;
    const opts = q.order.map((o, k) => {
      // буква варианта (.ol: «a)» / в виде «Spalvota» — кружок); после проверки перед ней ✓ у верного и ✗ у выбранного неверного
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
      if (practice) record([{ q, ok: q.order[k] === 0, hint: hinted(ex.i) }]);   // в тренировке — сразу, в экзамене — в итоге
      if (!practice && ex.i < ex.qs.length - 1) { ex.i++; }
      const all = Object.keys(ex.ans).length === ex.qs.length;
      show(practice || (all && ex.i === ex.qs.length - 1) ? 'next' : 'q');   // экзамен: последний ответ — к «Baigti»
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
      !practice ? el('button', { class: 'primary', on: { click: e => {
        const left = ex.qs.length - Object.keys(ex.ans).length;
        if (!left) { finish(); return; }
        L.ask(e.currentTarget, `Neatsakyta: ${left}. Baigti egzaminą?`, `Без ответа: ${left}. Завершить экзамен?`,
          { yes: 'Baigti', yesRu: 'завершить', no: 'Tęsti', noRu: 'продолжить' }).then(ok => { if (ok) finish(); });
      } } }, `Baigti (${answered}/${ex.qs.length})`) : null);
    const c = chapter(q.sk);
    const verdict = checked ? el('div', {}, q.order[a] === 0 ? '✓ Teisingai! (верно)'
      : `✗ Ne visai (не совсем). Teisingas atsakymas — ${LETTERS[q.order.indexOf(0)]}: ${q.opts[0]}`) : null;
    const feedback = checked ? el('div', { class: 'feedback' }, verdict, el('div', { class: 'art' }, cite(q)), quote(q), reportBtn(q)) : null;
    keyHandler = e => {
      const n = 'abc123'.indexOf(e.key.toLowerCase());
      if (n >= 0) choose(n % 3);
      else if (e.key === 'ArrowRight' && !practice && ex.i < ex.qs.length - 1) { ex.i++; show(); }
      else if (e.key === 'ArrowLeft' && !practice && ex.i > 0) { ex.i--; show(); }
      else if ((e.key === 'Enter' || e.key === ' ') && checked && !e.target.closest?.('summary')) { e.preventDefault(); nav.querySelector('.primary').click(); }
      else if ((e.key === 't' || e.key === 'T') && canPeek) peek('q');      // T — перевод вопроса
    };
    app.replaceChildren(...[
      el('div', { class: 'examhead' },
        el('span', {}, `${ex.label || (practice ? 'Treniruotė' : 'Egzaminas')} · ${ex.i + 1} / ${ex.qs.length}`),
        el('span', { class: 'tools' }, L ? L.zoomButtons() : null,      // размер текста
          el('span', { class: 'ru clockbox' + (clockWarn() ? ' warn' : ''), role: 'timer',
            title: timed() ? 'Liko laiko (осталось времени), iš viso 45 min.' : 'Laikas (время)' },
            '⏱ ', el('span', { id: 'clock' }, clockText())))),
      timed() ? el('p', { id: 'timenote', class: 'timenote', role: 'status' }, clockWarn() ? 'Liko 15 minučių (осталось 15 минут).' : '') : null,
      dots, segs,
      el('div', { class: 'card' },
        el('div', { class: 'tag' }, c ? `${c.roman}. ${c.lt}` : ''),
        el('div', { class: 'front fact', tabindex: '-1' }, q.q, sayBtn(q.q), peekBtn('q')),
        shown('q') ? el('div', { class: 'qru' }, q.qru) : null,
        el('div', { class: 'opts long' }, opts),
        feedback),
      nav].filter(Boolean));          // в тренировке вместо сетки номеров (dots = null) — полоска делений (segs)
    const to = focus === 'next' ? nav.querySelector('.primary')
      : focus.startsWith('peek:') ? app.querySelector(`[data-peek="${focus.slice(5)}"]`) : app.querySelector('.front');
    if (focus === 'next' && verdict) L?.say(verdict.textContent);   // диктору — итог ответа (без цитаты)
    to?.focus({ preventScroll: focus !== 'next' });
  }

  function finish() {
    clearInterval(timer); keyHandler = null; ex.done = true;
    document.body.classList.remove('focus-mode');
    if (ex.mode === 'exam') drop(CUR);
    const n = ex.qs.length, full = !ex.custom && n === N;              // полный набор — с вердиктом «сдано»
    const secs = timed() ? Math.min(spent(), LIMIT) : spent();
    const right = ex.qs.filter((q, i) => ex.ans[i] !== undefined && q.order[ex.ans[i]] === 0).length;
    const passed = right >= PASS;
    if (ex.mode === 'exam') record(ex.qs.map((q, i) => ({ q, a: ex.ans[i] })).filter(x => x.a !== undefined)   // без ответа — не в журнал
      .map(({ q, a }) => ({ q, ok: q.order[a] === 0, hint: false })));
    if (!ex.custom) {
      const hist = read(HIST, []);
      hist.unshift({ d: new Date().toISOString().slice(0, 16).replace('T', ' '), right, n, passed: full ? passed : null, secs,
                     mode: ex.mode, hints: hints() });
      write(HIST, hist.slice(0, 20));
    }
    const wrong = ex.qs.map((q, i) => ({ q, a: ex.ans[i] })).filter(x => x.a === undefined || x.q.order[x.a] !== 0);
    // шкала 0–20 с отметкой порога 14: сколько набрано и сколько не хватило
    const scale = full ? el('div', { class: 'scale', role: 'img', 'aria-label': `${right} iš ${N}; išlaikyti reikia ${PASS} (нужно ${PASS})` },
      el('span', { class: 'track' }, el('span', { class: 'fill', style: `width:${(100 * right / N).toFixed(1)}%` }),
        el('span', { class: 'mark14', style: `left:${(100 * PASS / N).toFixed(1)}%` })),
      el('span', { class: 'ticks', 'aria-hidden': 'true' }, el('span', {}, '0'), el('span', { style: `left:${(100 * PASS / N).toFixed(1)}%` }, String(PASS)),
        el('span', { style: 'left:100%' }, String(N)))) : null;
    app.replaceChildren(...[
      el('div', { class: 'card result ' + (full ? (passed ? 'pass' : 'fail') : ''), tabindex: '-1' },
        el('p', { class: 'big' }, `${right} / ${n}`),
        scale,
        ex.timeout ? el('p', { class: 'summary' }, 'Laikas baigėsi (время вышло) — neatsakyti klausimai neįskaityti.') : null,
        el('p', { class: 'summary' }, !full ? `${ex.label || 'Treniruotė'}: teisingai ${right} iš ${n} (верно)`
          : passed ? 'Išlaikyta! (сдано)' : `Neišlaikyta (не сдано): trūko ${PASS - right} (не хватило ${PASS - right})`),
        el('p', { class: 'ru' }, `Laikas (время): ${fmt(secs)}`
          + (ex.mode === 'practice' ? ` · vertimo užuominos (подсказки перевода): ${hints()}` : ''))),
      byChapter(),
      wrong.length ? el('div', { class: 'card' },
        h2(`Klaidos: ${wrong.length}`, 'ошибки — с переводом и текстом статьи'),
        el('ol', { class: 'review' }, wrong.map(({ q, a }) => reviewItem(q, a)))) : null,
      el('details', { class: 'card all' },                  // разбор всех вопросов — с переводом
        el('summary', {}, 'Visi klausimai su vertimu (все вопросы с переводом)'),
        el('ol', { class: 'review' }, ex.qs.map((q, i) => reviewItem(q, ex.ans[i])))),
      el('div', { class: 'actions' },
        wrong.length ? el('button', { on: { click: () => start('practice', wrong.map(x => Object.assign({}, x.q)), 'Klaidų kartojimas') } },
          'Kartoti klaidas (повторить ошибки)') : null,
        el('button', { class: 'primary', on: { click: home } }, 'Į pradžią (в начало)'))].filter(Boolean));
    app.querySelector('.result').focus({ preventScroll: true });   // диктору — сразу результат
  }

  // итог по главам: сколько верно в каждой главе этой попытки; у глав с ошибками — ссылки, что повторить
  // (факты и слова главы в тренажёре, текст главы) — в новой вкладке, чтобы итог остался на экране
  function byChapter() {
    const by = new Map();
    ex.qs.forEach((q, i) => {
      const r = by.get(q.sk) || { n: 0, ok: 0 };
      r.n++; if (ex.ans[i] !== undefined && q.order[ex.ans[i]] === 0) r.ok++;
      by.set(q.sk, r);
    });
    const rows = [...by].sort((a, b) => a[0] - b[0]), weak = rows.filter(([, r]) => r.ok < r.n);
    const go = (href, lt, ru) => el('a', { href, target: '_blank', rel: 'noopener' }, lt, el('span', { class: 'ru' }, ' ' + ru));
    return el('div', { class: 'card' },
      h2('Pagal skyrius', 'по главам'),
      el('p', {}, weak.length ? `Pakartokite (повторите): ${weak.map(([no]) => chapter(no).roman).join(', ')} sk.`
        : 'Visi skyriai be klaidų (все главы без ошибок).'),
      el('ul', { class: 'bysk' }, rows.map(([no, r]) => {
        const c = chapter(no), bad = r.ok < r.n;
        return el('li', { class: bad ? 'weak' : 'ok' },
          el('span', { class: 'mk', 'aria-hidden': 'true' }, bad ? '✗' : '✓'),
          el('span', { class: 'nm' }, `${c.roman}. ${c.lt}`, el('span', { class: 'ru' }, c.ru)),
          el('span', { class: 'sc' }, `${r.ok} / ${r.n}`),
          bad ? el('span', { class: 'go' }, go(`index.html?d=facts&sk=${no}`, 'Faktai', 'факты'), ' · ',
            go(`index.html?d=terms&sk=${no}`, 'Terminai', 'термины'), ' · ', go(`tekstas.html#sk${no}`, 'Tekstas', 'текст главы')) : null);
      })));
  }

  // строка разбора: вопрос и ответы — с переводом и цитатой статьи
  function reviewItem(q, a) {
    const ok = a !== undefined && q.order[a] === 0, tr = i => el('span', { class: 'ru' }, ` — ${q.optsru[i]}`);
    return el('li', {},
      el('div', { class: 'rq' }, q.q), el('div', { class: 'ru' }, q.qru),
      ok ? null : (a !== undefined ? el('div', { class: 'bad' }, '✗ ', q.opts[q.order[a]], tr(q.order[a])) : el('div', { class: 'bad' }, '✗ —')),
      el('div', { class: 'good' }, '✓ ', q.opts[0], tr(0), ' ', el('span', { class: 'art' }, cite(q))),
      quote(q), reportBtn(q));
  }

  // готовность: по журналу и истории попыток. Честно и проверяемо — три условия, без «вероятности сдать»
  function readiness() {
    const j = journal(), hist = read(HIST, []), total = D.exam.length;
    const by = D.chapters.map(c => ({ c, all: 0, new: 0, weak: 0, learn: 0, known: 0 }));
    for (const q of D.exam) { const b = by.find(x => x.c.no === q.sk); b.all++; b[state(j[q.id])]++; }
    const sum = k => by.reduce((n, b) => n + b[k], 0);
    const seen = total - sum('new'), weak = sum('weak'), learn = sum('learn');
    const exams = hist.filter(h => h.mode === 'exam' && h.n === N).slice(0, 3), passed = exams.filter(h => h.passed).length;
    const met = (seen === total) + (seen > 0 && !weak) + (passed === 3);
    return { by, total, seen, weak, learn, exams, passed, met, ready: met === 3 };
  }

  // свёрнутая карточка: заголовок — в <summary>; открыта ли — запоминается (konst.exam.open)
  function fold(id, cls, head, ...body) {
    const open = read(OPEN, {});
    return el('details', { class: `card fold ${cls}`, id, open: open[id] ? '' : null, on: { toggle: e => {
      const o = read(OPEN, {}); if (e.target.open) o[id] = 1; else delete o[id]; write(OPEN, o); } } },
      el('summary', { class: 'cardsum' }, head), ...body);
  }
  const setOpen = (id, on) => { const o = read(OPEN, {}); if (on) o[id] = 1; else delete o[id]; write(OPEN, o); };
  const dotsOf = r => el('span', { class: 'rdots', role: 'img', 'aria-label': `${r.met} iš 3` },
    [0, 1, 2].map(i => el('span', { class: i < r.met ? 'on' : null })));

  function readyCard(r) {
    const check = (ok, lt, ru) => el('li', { class: ok ? 'ok' : '' },
      el('span', { class: 'mk', role: 'img', 'aria-label': ok ? 'įvykdyta (выполнено)' : 'dar ne (ещё нет)' }, ok ? '✓' : '○'),
      el('span', {}, lt, el('span', { class: 'ru' }, ru)));
    const fresh = !r.seen && !r.exams.length;
    const next = r.ready ? 'Чтобы не забыть, раз в несколько дней сдавайте пробный экзамен.'
      : r.seen < r.total ? `Тренировка даёт сначала новые вопросы: ещё примерно ${Math.ceil((r.total - r.seen) / N) + 1} — и вы увидите весь банк.`
      : r.weak ? 'Повторите слабые места — кнопка «Silpnos vietos» выше.'
      : 'Сдайте пробный экзамен на время, три раза подряд.';
    const verdictRu = r.ready ? 'похоже, вы готовы' : fresh ? 'ответов пока нет' : 'пока не совсем';
    return fold('pasirengimas', 'ready' + (r.ready ? ' yes' : ''),
      el('h2', { class: 'cardh' }, `Pasirengimas: ${r.met} iš 3 `, dotsOf(r), el('span', { class: 'ru' }, `готовность к экзамену · ${verdictRu}`)),
      el('p', { class: 'verdict' }, r.ready ? 'Atrodo, esate pasirengę! ' : fresh ? 'Dar nėra atsakymų. ' : 'Dar ne visai. ',
        el('span', { class: 'ru' }, `(${verdictRu})`)),
      el('ul', { class: 'checks' },
        check(r.seen === r.total, `Išbandyti visi klausimai: ${r.seen} iš ${r.total}`, 'все вопросы банка встречались хотя бы раз'),
        check(r.seen > 0 && !r.weak, !r.seen ? 'Silpni klausimai: —' : r.weak ? `Silpnų klausimų: ${r.weak}` : 'Silpnų klausimų nėra',
          'слабый — была ошибка, и после неё ещё нет двух верных ответов подряд'),
        check(r.passed === 3, `Išlaikyti 3 paskutiniai egzaminai: ${r.passed} iš 3`
          + (r.exams.length ? ` (${r.exams.map(h => h.right).join(', ')})` : ''), `режим «Egzaminas», 45 минут; сдано — от ${PASS} из ${N}`)),
      el('p', { class: 'ru next' }, next));
  }
  function chaptersCard(r) {
    const seg = (b, k) => b[k] ? el('span', { class: k, style: `width:${(100 * b[k] / b.all).toFixed(1)}%` }) : null;
    return fold('skyriai', 'readysk-card', h2('Pagal skyrius', 'по главам: выучено, учу, слабые, новые'),
      el('ul', { class: 'readysk' }, r.by.map(b => el('li', {},
        el('span', { class: 'nm' }, `${b.c.roman}. ${b.c.lt}`),
        el('span', { class: 'bar', role: 'img', 'aria-label': `Išmokta ${b.known}, mokomasi ${b.learn}, silpni ${b.weak}, nauji ${b.new} iš ${b.all}` },
          seg(b, 'known'), seg(b, 'learn'), seg(b, 'weak')),
        el('span', { class: 'sc' }, `${b.known} / ${b.all}`, b.weak ? el('span', { class: 'wk' }, ` · ✗ ${b.weak}`) : null)))),
      el('p', { class: 'legend' }, ...[['known', 'išmokta', 'выучено'], ['learn', 'mokomasi', 'учу'], ['weak', 'silpni', 'слабые'],
        ['new', 'nauji', 'новые']].map(([k, lt, ru]) => el('span', {}, el('i', { class: 'sw ' + k, 'aria-hidden': 'true' }), lt, ' ',
        el('span', { class: 'ru' }, ru)))),
      el('p', { class: 'ru' }, `Выучено — два верных ответа подряд без подсказки перевода; выученный вопрос, который не попадался `
        + `${REVIEW_DAYS} дней, снова попадёт в «Kartoti». Готовность — по нашему банку из ${r.total} вопросов: на настоящем `
        + 'экзамене формулировки другие, а темы — те же.'),
      r.seen ? el('p', { class: 'confirm-host' }, el('button', { class: 'linkish', type: 'button', on: { click: e => {
        L.ask(e.currentTarget, 'Išvalyti klausimų statistiką? Bandymų istorija liks.', 'Сбросить статистику по вопросам? История попыток останется.',
          { yes: 'Išvalyti', yesRu: 'сбросить', danger: true }).then(ok => {
          if (ok) { write(JOURNAL, { _reset: Date.now() }); home(); L.toast('Statistika išvalyta.', 'Статистика вопросов сброшена.'); }
        });                                                              // _reset — чтобы сброс дошёл и до других устройств (sync.js)
      } } }, 'Išvalyti statistiką ', el('span', { class: 'ru' }, '(сбросить статистику вопросов)'))) : null);
  }

  // ---------- план подготовки: konst.plan.v1 = { date: день экзамена ГГГГ-ММ-ДД, done: { глава: когда отмечена }, t } ----------
  // Главы идут по порядку; «сегодня» — следующие несделанные, по стольку в день, чтобы успеть до дней повторения
  // (3 последних дня; если до экзамена меньше 10 дней — 1, меньше 4 — ни одного). Пропустили день — темп пересчитается.
  const PLAN = 'konst.plan.v1';
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysTo = date => Math.round((new Date(date + 'T00:00') - new Date(ymd(new Date()) + 'T00:00')) / DAY);
  function planToday(p) {
    const left = daysTo(p.date), done = p.done || {}, rest = D.chapters.filter(c => !done[c.no]);
    if (left < 0) return { phase: 'past', left, rest };
    if (left === 0) return { phase: 'day', left, rest };
    const review = left >= 10 ? 3 : left >= 4 ? 1 : 0;
    if (!rest.length) return { phase: 'review', left, rest, review };
    const days = Math.max(1, left - review), per = Math.ceil(rest.length / days);
    return { phase: 'learn', left, rest, review, days, per, today: rest.slice(0, per) };
  }
  // сохранить план и показать его; pops — какие главы «вспыхнут» (только что отмечены), focus — вернуть фокус на первую
  function savePlan(p, pops = [], focus = false) {
    write(PLAN, Object.assign(p, { t: Date.now() })); setOpen('planas', true); home();
    document.getElementById('planas')?.scrollIntoView({ block: 'start' });
    const chips = pops.map(no => document.querySelector(`#planas .planchips [data-no="${no}"]`)).filter(Boolean);
    chips.forEach(c => L?.pop(c));
    if (focus && chips[0]) chips[0].focus({ preventScroll: true });
  }
  const sinceDays = ts => Math.round((new Date(ymd(new Date()) + 'T00:00') - new Date(ymd(new Date(ts)) + 'T00:00')) / DAY);
  // календарь: каждый день в выбранное время — 20 минут на план (до дня экзамена), и сам день экзамена (.ics, без сервера)
  function calendar(p, at) {
    const [hh, mm] = (at || '19:00').split(':'), d8 = d => ymd(d).replace(/-/g, ''), exam = new Date(p.date + 'T00:00');
    const url = new URL('egzaminas.html', location.href).href, memo = new URL('atmintine.html', location.href).href;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const txt = s => s.replace(/[\\,;]/g, m => '\\' + m);
    const wrap = s => { const out = []; for (let i = 0; i < s.length; i += 60) out.push((i ? ' ' : '') + s.slice(i, i + 60)); return out.join('\r\n'); };   // строки ≤ 75 байт
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mokausi lietuviskai//Pasiruosimo planas//LT', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', `UID:planas-${p.date}-${Date.now()}@mokausi-lietuviskai`, `DTSTAMP:${stamp}`,
      `DTSTART:${d8(new Date())}T${hh}${mm}00`, 'DURATION:PT20M', `RRULE:FREQ=DAILY;UNTIL=${d8(new Date(exam - DAY))}T235959`,
      `SUMMARY:${txt('Mokausi lietuviškai: Konstitucija, 20 min')}`, `DESCRIPTION:${txt('Šiandienos planas (план на сегодня): ' + url + '#planas')}`,
      `URL:${url}#planas`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${txt('Mokausi lietuviškai')}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT',
      'BEGIN:VEVENT', `UID:egzaminas-${p.date}@mokausi-lietuviskai`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(exam)}`,
      `DTEND;VALUE=DATE:${d8(new Date(exam.getTime() + DAY))}`, `SUMMARY:${txt('Konstitucijos egzaminas — sėkmės!')}`,
      `DESCRIPTION:${txt('Atmintinė (памятка): ' + memo)}`, 'END:VEVENT', 'END:VCALENDAR'];
    const a = el('a', { href: URL.createObjectURL(new Blob([lines.map(wrap).join('\r\n') + '\r\n'], { type: 'text/calendar' })),
      download: `mokausi-planas-${p.date}.ics` });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    L.toast('Kalendoriaus failas atsisiųstas.', 'Откройте файл — телефон или почта предложат добавить события в календарь.');
  }
  const chapterQs = no => shuffle(D.exam.filter(q => q.sk === no)).slice(0, N).map(q => Object.assign({}, q));
  const chapterGo = c => {                               // что делать с главой: рассказ, слова, текст, вопросы этой главы
    const st = (D.stories || {})[c.no] || [], nq = chapterQs(c.no).length;
    const a = (href, lt, ru) => el('a', { href }, lt, el('span', { class: 'ru' }, ' ' + ru));
    return el('span', { class: 'go' },
      st.length ? a(`skaitymas.html#${st[0]}`, 'Skaityti', plural(st.length, 'рассказ', 'рассказа', 'рассказов')) : null, st.length ? ' · ' : null,
      a(`index.html?d=terms&sk=${c.no}`, 'Žodžiai', 'слова'), ' · ', a(`tekstas.html#sk${c.no}`, 'Tekstas', 'текст главы'), ' · ',
      el('button', { type: 'button', class: 'linkish', on: { click: () => start('practice', chapterQs(c.no), `${c.roman} skyrius`) } },
        'Klausimai', el('span', { class: 'ru' }, ' ' + plural(nq, 'вопрос', 'вопроса', 'вопросов'))));
  };
  // заголовок свёрнутого плана: что сегодня
  function planHead(p, t) {
    if (!p || !p.date) return h2('Pasiruošimo planas', 'план подготовки: знаете дату экзамена? разложим главы по дням');
    const until = t.left > 0 ? ` · до экзамена ${plural(t.left, 'день', 'дня', 'дней')}` : '';
    if (t.phase === 'learn') return h2(`Šiandien: ${t.today.length === 1 ? `${t.today[0].roman}. ${t.today[0].lt}` : `${t.today.map(c => c.roman).join(', ')} skyriai`}`,
      `план подготовки${until}`);
    if (t.phase === 'review') return h2('Šiandien: kartojimas', `план: все главы пройдены — повторение${until}`);
    if (t.phase === 'day') return h2('Šiandien egzaminas', 'сегодня экзамен — удачи!');
    return h2('Pasiruošimo planas', 'экзамен прошёл — укажите новую дату, если будете сдавать снова');
  }
  function planCard(r) {
    const p = read(PLAN, null);
    const dateForm = (label, value) => el('form', { class: 'planform', on: { submit: e => {
        e.preventDefault(); const v = e.target.date.value;
        if (!v || daysTo(v) < 0) { L.toast('Pasirinkite šiandienos arba būsimą datą.', 'Выберите сегодняшнюю дату или дату в будущем.', { alert: true }); return; }
        const old = read(PLAN, null);
        savePlan(Object.assign(old && old.date ? old : { done: {}, c: Date.now() }, { date: v }));   // c — когда план составлен
      } } },
      el('label', {}, el('span', {}, 'Egzamino data ', el('span', { class: 'ru' }, '(дата экзамена)')),
        el('input', { type: 'date', name: 'date', required: '', min: ymd(new Date()), value: value || null })),
      el('button', { type: 'submit' }, label));
    if (!p || !p.date) return fold('planas', 'plan', planHead(p),
      el('p', { class: 'ru' }, 'Укажите дату экзамена — сайт разложит 14 глав по дням до неё, а последние дни оставит на повторение '
        + 'и пробные экзамены. Пропустили день — план подстроится сам.'),
      dateForm('Sudaryti planą (составить план)'));
    const t = planToday(p), done = p.done || {};
    // главы плана — кнопки: нажать — отметить пройденной (или снять отметку)
    const chips = el('ol', { class: 'planchips', 'aria-label': `Pereita skyrių: ${D.chapters.length - t.rest.length} iš ${D.chapters.length} (пройдено глав; нажмите главу, чтобы отметить)` },
      D.chapters.map(c => el('li', {}, el('button', { type: 'button', 'data-no': c.no, 'aria-pressed': String(!!done[c.no]),
        class: done[c.no] ? 'done' : (t.today || []).includes(c) ? 'now' : null,
        title: `${c.roman}. ${c.lt} — ${done[c.no] ? 'atlikta; paspauskite, kad atšauktumėte (снять отметку)' : 'paspauskite, kad pažymėtumėte (отметить пройденной)'}`,
        on: { click: () => {
          const pl = read(PLAN, p); pl.done = pl.done || {};
          if (pl.done[c.no]) { delete pl.done[c.no]; L?.track('p', -1); } else { pl.done[c.no] = Date.now(); L?.track('p'); }
          savePlan(pl, [c.no], true);
        } } }, c.roman))));
    const day = new Date(p.date + 'T00:00').toLocaleDateString('lt-LT', { month: 'long', day: 'numeric' });   // «lapkričio 19 d.»
    const when = el('p', { class: 'when' }, t.left > 0 ? `Iki egzamino ${t.left} d. · ${day} ` : `${day} `,
      el('span', { class: 'ru' }, t.left > 0 ? `(до экзамена ${plural(t.left, 'день', 'дня', 'дней')})` : ''));
    // честные подсказки о темпе: пропущенные дни и мало времени
    const last = Math.max(p.c || 0, ...Object.values(done)), gap = last ? sinceDays(last) : 0;
    const hints = t.phase === 'learn' ? [
      gap >= 2 ? el('p', { class: 'planhint' }, `Praleista ${gap - 1} d. — dabar po ${t.per} sk. per dieną `,
        el('span', { class: 'ru' }, `(пропущено ${plural(gap - 1, 'день', 'дня', 'дней')} — план пересчитан: теперь по ${plural(t.per, 'главе', 'главы', 'глав')} в день)`)) : null,
      t.per >= 3 ? el('p', { class: 'planhint warn' }, `Liko mažai laiko: po ${t.per} sk. per dieną `,
        el('span', { class: 'ru' }, `(до экзамена ${plural(t.left, 'день', 'дня', 'дней')}: успеть все главы можно, если проходить по ${t.per} в день; `
          + 'если не успеваете — повторяйте «Silpnos vietos» и памятку)')) : null] : [];
    const today = L?.todayLine();
    const done1 = today ? el('p', { class: 'plandone' }, today.lt + ' ', el('span', { class: 'ru' }, `(${today.ru}; ${today.wru})`)) : null;
    const cal = t.left >= 2 ? el('form', { class: 'plancal', on: { submit: e => { e.preventDefault(); calendar(read(PLAN, p), e.target.at.value); } } },
      el('label', {}, el('span', {}, 'Priminimas ', el('span', { class: 'ru' }, '(напоминание каждый день в)')),
        el('input', { type: 'time', name: 'at', value: '19:00', required: '' })),
      el('button', { type: 'submit' }, ico('plan'), el('span', {}, 'Įtraukti į kalendorių', el('span', { class: 'ru' }, 'добавить в календарь')))) : null;
    let body;
    if (t.phase === 'learn') {
      body = [el('p', { class: 'today' }, 'Šiandien ', el('span', { class: 'ru' }, '(сегодня)'), ':'),
        el('ul', { class: 'plantoday' }, t.today.map(c => el('li', {}, el('b', {}, `${c.roman}. ${c.lt}`), el('span', { class: 'ru' }, c.ru), chapterGo(c)))),
        el('div', { class: 'actions planok' }, el('button', { class: 'primary', type: 'button', on: { click: () => {   // «Grąžinti» — вернуть
          const pl = read(PLAN, p), before = Object.assign({}, pl.done || {}), nos = t.today.map(c => c.no);
          pl.done = Object.assign(pl.done || {}, Object.fromEntries(nos.map(no => [no, Date.now()]))); L?.track('p', nos.length);
          savePlan(pl, nos);
          L.toast(`Atlikta: ${t.today.map(c => c.roman).join(', ')} sk.`, 'отмечено в плане', { undo: () => {
            const x = read(PLAN, pl); x.done = before; L?.track('p', -nos.length); savePlan(x); } });
        } } }, `Atlikta ✓ (сделано)`)),
        el('p', { class: 'ru' }, `Осталось ${plural(t.rest.length, 'глава', 'главы', 'глав')} на ${plural(t.days, 'день', 'дня', 'дней')}: `
          + `по ${plural(t.per, 'главе', 'главы', 'глав')} в день` + (t.review === 1 ? ', последний день — повторение.'
            : t.review ? `, последние ${plural(t.review, 'день', 'дня', 'дней')} — повторение.` : '.'))];
    } else if (t.phase === 'review') {
      const worst = r.by.filter(b => b.weak + b.new).sort((a, b) => (b.weak * 2 + b.new) - (a.weak * 2 + a.new)).slice(0, 3);
      body = [el('p', { class: 'today' }, 'Visi skyriai pereiti — kartojimas ', el('span', { class: 'ru' }, '(все главы пройдены — повторение)')),
        worst.length ? el('ul', { class: 'plantoday' }, worst.map(b => el('li', {}, el('b', {}, `${b.c.roman}. ${b.c.lt}`),
          el('span', { class: 'ru' }, `слабых ${b.weak}, новых ${b.new}`), chapterGo(b.c)))) : null,
        el('p', { class: 'ru' }, 'Каждый день: «Silpnos vietos» и пробный экзамен на время — до трёх сданных подряд.')];
    } else if (t.phase === 'day') {
      body = [el('p', { class: 'today' }, 'Šiandien egzaminas — sėkmės! ', el('span', { class: 'ru' }, '(сегодня экзамен — удачи!)')),
        el('p', {}, el('a', { href: 'atmintine.html' }, 'Atmintinė ', el('span', { class: 'ru' }, '— памятка: числа и сроки')))];
    } else {
      body = [el('p', { class: 'today' }, 'Egzaminas jau buvo. ', el('span', { class: 'ru' }, '(экзамен уже прошёл — если будете сдавать снова, укажите новую дату)')),
        dateForm('Nauja data (новая дата)')];
    }
    return fold('planas', 'plan', planHead(p, t), when, ...hints, chips, ...body, done1, cal,
      el('p', { class: 'planfoot' },
        t.phase !== 'past' ? el('details', { class: 'planchange' }, el('summary', {}, 'Pakeisti datą ', el('span', { class: 'ru' }, '(изменить дату)')),
          dateForm('Išsaugoti (сохранить)', p.date)) : null,
        el('button', { type: 'button', class: 'linkish', on: { click: () => {   // удалить сразу, «Grąžinti» — вернуть
          const old = read(PLAN, p);
          savePlan({ date: '', done: {} });
          L.toast('Planas ištrintas.', 'План удалён; ответы и статистика остались.', { undo: () => savePlan(Object.assign({}, old)) });
        } } }, 'Ištrinti planą ', el('span', { class: 'ru' }, '(удалить план)'))));
  }

  // ---------- старт ----------
  // незаконченный экзамен: продолжить или начать заново; отсчёт идёт и здесь
  function resumeCard(cur) {
    const done = Object.keys(cur.ans).length, leftOf = () => Math.max(0, LIMIT - Math.round((Date.now() - cur.t0) / 1000));
    clearInterval(timer);
    timer = setInterval(() => {
      const s = leftOf(), t = document.getElementById('resumeclock');
      if (!s) { home(); return; }                                   // время вышло, пока смотрели на старт — итог
      if (t) t.textContent = fmt(s);
    }, 1000);
    return el('div', { class: 'card resume' },
      h2('Nebaigtas egzaminas', 'незаконченный экзамен: время идёт, как на настоящем'),
      el('p', { class: 'resume-st' }, `Atsakyta ${done} iš ${cur.qs.length} · liko `, el('b', { id: 'resumeclock' }, fmt(leftOf())),
        el('span', { class: 'ru' }, ` (отвечено ${done} из ${cur.qs.length}, осталось)`)),
      el('div', { class: 'actions' },
        el('button', { class: 'primary', on: { click: () => { ex = loadCur(); if (ex) run(); else home(); } } }, ico('exam'), 'Tęsti egzaminą (продолжить)'),
        el('button', { on: { click: e => L.ask(e.currentTarget, 'Pradėti naują egzaminą? Šio atsakymai nebus įskaityti.',
          'Начать новый экзамен? Ответы незаконченного не засчитаются.', { yes: 'Pradėti', yesRu: 'начать', danger: true })
          .then(ok => { if (ok) { drop(CUR); start('exam'); } }) } }, 'Pradėti iš naujo (начать заново)')));
  }
  // накануне и в день экзамена: только главное — памятка, слабые места, последние ошибки
  let showAll = false;
  function dayCard(t, d) {
    const lw = lastWrong(), tomorrow = t.left === 1;
    return el('div', { class: 'card dayx' },
      h2(tomorrow ? 'Rytoj egzaminas' : 'Šiandien egzaminas — sėkmės!',
        tomorrow ? 'завтра экзамен: повторите главное, новое учить не нужно' : 'сегодня экзамен — удачи! перед выходом — памятка'),
      el('div', { class: 'daylist' },
        el('a', { class: 'daybtn primary', href: 'atmintine.html' }, ico('memo'),
          el('span', {}, 'Atmintinė', el('span', { class: 'ru' }, 'памятка: числа и сроки на одном листе'))),
        d.n && d.label === 'Silpnos vietos' ? el('button', { class: 'daybtn', type: 'button', on: { click: () => { const x = drill(N); start('practice', x.qs, x.label); } } },
          ico('target'), el('span', {}, `Silpnos vietos · ${d.n}`, el('span', { class: 'ru' }, 'слабые места'))) : null,
        lw.length ? el('button', { class: 'daybtn', type: 'button', on: { click: () => start('practice', lastWrong(), 'Paskutinės klaidos') } },
          ico('repeat'), el('span', {}, `Paskutinės klaidos · ${lw.length}`, el('span', { class: 'ru' }, 'последние ошибки'))) : null,
        tomorrow ? el('button', { class: 'daybtn', type: 'button', on: { click: () => start('exam') } },
          ico('exam'), el('span', {}, 'Egzaminas', el('span', { class: 'ru' }, 'ещё один пробный экзамен на время'))) : null),
      el('p', {}, el('button', { class: 'linkish', type: 'button', on: { click: () => { showAll = true; home(); } } },
        'Rodyti viską ', el('span', { class: 'ru' }, '(показать всё)'))));
  }

  function home() {
    clearInterval(timer); keyHandler = null;
    document.body.classList.remove('focus-mode');
    const cur = loadCur();
    if (cur && Date.now() - cur.t0 >= LIMIT * 1000) { ex = cur; ex.timeout = true; finish(); return; }   // время вышло, пока не было
    const hist = read(HIST, []), r = readiness(), d = drill(), plan = read(PLAN, null);
    const t = plan && plan.date ? planToday(plan) : null, n = qlen();
    if (t && (t.left === 0 || t.left === 1) && !showAll) {
      app.replaceChildren(...[cur ? resumeCard(cur) : null, dayCard(t, d)].filter(Boolean));
      return;
    }
    app.replaceChildren(...[
      cur ? resumeCard(cur) : null,
      el('div', { class: 'actions exam-start' },                     // главные кнопки — первыми, на первом экране телефона
        cur ? null : el('button', { class: 'primary', on: { click: () => start('exam') } }, ico('exam'), 'Egzaminas · 45 min (экзамен)'),
        el('button', { on: { click: () => start('practice') } }, ico('repeat'), `Treniruotė · ${n} (с проверкой)`),
        d.n ? el('button', { on: { click: () => { const x = drill(); start('practice', x.qs, x.label); } } }, ico('target'), `${d.btn} · ${d.n}`) : null),
      el('div', { class: 'lenpick', role: 'group', 'aria-label': 'Treniruotės ilgis (сколько вопросов в тренировке)' },
        el('span', { class: 'lenlab' }, 'Treniruotėje ', el('span', { class: 'ru' }, '(в тренировке)')),
        [[N, `${N} klausimų`, ''], [QUICK, `${QUICK} klausimai`, ' (~3 min)']].map(([k, lt, ru]) =>
          el('button', { type: 'button', 'aria-pressed': String(n === k), on: { click: () => { write(LEN, k); home(); } } },
            lt, ru ? el('span', { class: 'ru' }, ru) : null))),
      planCard(r),
      readyCard(r),
      chaptersCard(r),
      fold('kaip', 'how', h2('Kaip tai veikia', 'как это работает: формат экзамена, перевод, голос, размер текста'),
        el('p', {}, `${N} klausimų lietuvių kalba, po 3 atsakymų variantus; išlaikyta, jei teisingai atsakyta į ne mažiau kaip ${PASS}.`),
        el('p', { class: 'ru' }, `${N} вопросов на литовском, по 3 варианта ответа; экзамен сдан, если верно не меньше ${PASS}. `
          + 'Так по официальной программе экзамена (2004 г., ред. 2009 г.): вопросы — по всем главам Конституции. '
          + 'Экзамен проводит Национальное агентство образования (NŠA) на компьютере, на него даётся 45 минут; '
          + 'здесь в режиме «Egzaminas» — тоже 45 минут обратным отсчётом, в тренировке время не ограничено. '
          + `Здесь вопросы — по всем 14 главам (банк: ${D.exam.length}). Незаконченный экзамен можно продолжить после `
          + 'перезагрузки страницы — время при этом идёт, как на настоящем экзамене.'),
        el('p', { class: 'ru' }, 'Перевод. В тренировке перевод вопроса и любого варианта можно подсмотреть кнопкой RU '
          + '(вопрос — и клавишей T); подсказки считаются в результате. После ответа переведено всё, а «Straipsnio tekstas» '
          + 'показывает часть статьи, где ответ. В экзамене перевода нет, как на настоящем экзамене: он в разборе в конце.'),
        el('p', { class: 'ru' }, 'Тренировка даёт сначала новые и слабые вопросы, экзамен — случайные, как на настоящем.'),
        (() => {                                                       // голос озвучки вопросов: Ona / Leonas
          const pick = S && S.available() ? S.voiceSelect() : null;
          return pick ? el('label', { class: 'voiceline' }, el('span', {}, 'Balsas ', el('span', { class: 'ru' }, '(голос)')), pick) : null;
        })(),
        L ? el('div', { class: 'voiceline' }, el('span', {}, 'Teksto dydis ', el('span', { class: 'ru' }, '(размер текста)')),
          L.zoomButtons()) : null),
      hist.length ? fold('bandymai', 'hist', h2(`Bandymai: ${hist.length}`, 'попытки: дата, режим, результат, время'),
        el('table', { class: 'stats' }, el('tbody', {}, hist.map(h => el('tr', {},
          el('td', {}, h.d), el('td', {}, h.mode === 'practice' ? 'treniruotė' : 'egzaminas'),
          el('td', { class: 'num' }, `${h.right}/${h.n}`), el('td', { class: 'num' }, fmt(h.secs)),
          el('td', { class: 'num', title: 'подсказки перевода' }, h.mode === 'practice' && h.hints != null ? `RU ${h.hints}` : ''),
          h.passed == null ? el('td', {}) : el('td', { class: h.passed ? 'okc' : 'badc' }, h.passed ? '✓' : '✗')))))) : null].filter(Boolean));
  }

  document.addEventListener('keydown', e => {
    if (keyHandler && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) keyHandler(e);
  });
  if (S) S.onReady(ok => { if (ok && ex && !ex.done) show(); });
  const qsk = +new URLSearchParams(location.search).get('sk'), qc = chapter(qsk);   // ?sk=N — вопросы одной главы (из плана, с витрины)
  if (location.hash === '#planas') setOpen('planas', true);
  home();
  if (qc) { history.replaceState(null, '', location.pathname); start('practice', chapterQs(qsk), `${qc.roman} skyrius`); }
  else if (location.hash === '#planas') document.getElementById('planas')?.scrollIntoView({ block: 'start' });
})();
