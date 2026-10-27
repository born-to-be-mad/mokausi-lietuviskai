// Пробный экзамен по Конституции: 20 вопросов (по одному из каждой главы + 6 случайных), 3 варианта,
// сдано — от 14 верных. Режимы: «Egzaminas» (ответы — в конце; 45 минут обратным отсчётом, за 15 минут — предупреждение,
// по нулю — итог, как на настоящем экзамене: инструкция NŠA VK-395) и «Treniruotė» (проверка сразу, время идёт вперёд).
// Перевод: в тренировке вопрос и каждый вариант можно подсмотреть кнопкой RU (подсказки считаются), после ответа
// переведено всё; в экзамене перевода нет — он в разборе в конце, как на настоящем экзамене.
// Банк — window.KONST.exam (data/egzaminas.tsv → scripts/web.py); история попыток и журнал по вопросам — localStorage.
// «Pasirengimas» на старте: все вопросы банка встречались, слабых нет, 3 последних экзамена сданы; по главам — полоски.
// «Pasiruošimo planas»: дата экзамена → главы по дням, «сегодня» — следующие несделанные; ?sk=N — вопросы одной главы.
(() => {
  'use strict';
  const D = window.KONST, S = window.Speak, app = document.getElementById('app');
  const N = 20, PASS = 14, HIST = 'konst.exam.v1', JOURNAL = 'konst.examq.v1', KNOWN = 2;
  const LIMIT = 45 * 60, WARN = 15 * 60;                  // экзамен: 45 минут, предупреждение — когда осталось 15
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
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

  // журнал по вопросам (id — из текста вопроса): right / wrong — сколько раз, s — верно подряд без подсказки перевода,
  // w — последний ответ неверный, t — когда (для синхронизации, sync.js). Вопрос новый, слабый (w), выучен (s ≥ KNOWN) или изучается
  const journal = () => read(JOURNAL, {});
  const state = r => !r ? 'new' : r.w ? 'weak' : (r.s || 0) >= KNOWN ? 'known' : 'learn';
  const RANK = { new: 0, weak: 1, learn: 2, known: 3 };
  function record(items) {                                            // [{ q, ok, hint }]
    const j = journal();
    for (const { q, ok, hint } of items) {
      const r = Object.assign({ right: 0, wrong: 0, s: 0 }, j[q.id]);
      if (ok) { r.right++; r.w = false; if (!hint) r.s++; } else { r.wrong++; r.w = true; r.s = 0; }
      r.t = Date.now(); j[q.id] = r;
    }
    write(JOURNAL, j);
  }
  const hinted = i => Object.keys(ex.peek).some(k => k.split(':')[0] === String(i));
  const prep = qs => qs.sort((a, b) => a.sk - b.sk).map(q => Object.assign(q, { order: shuffle([0, 1, 2]) }));   // 0 — верный вариант
  // «Silpnos vietos»: сначала слабые, потом изучаемые — до 20
  const weakOnes = () => { const j = journal(); return shuffle(D.exam).map(q => [RANK[state(j[q.id])], q])
    .filter(([r]) => r === 1 || r === 2).sort((a, b) => a[0] - b[0]).slice(0, N).map(([, q]) => Object.assign({}, q)); };

  // 20 вопросов: по одному из каждой главы, остальные — из всего банка; порядок — по главам. В экзамене — случайно
  // (честная мера готовности); в тренировке — сначала новые, потом слабые, изучаемые и выученные (внутри — случайно)
  function pick(mode) {
    const j = journal();
    let bank = shuffle(D.exam.map(q => Object.assign({}, q)));
    if (mode === 'practice') bank = bank.map(q => [RANK[state(j[q.id])], q]).sort((a, b) => a[0] - b[0]).map(([, q]) => q);
    const chosen = [], used = new Set();
    for (const c of D.chapters) {
      const q = bank.find(x => x.sk === c.no && !used.has(x.id));
      if (q) { chosen.push(q); used.add(q.id); }
    }
    for (const q of bank) { if (chosen.length >= N) break; if (!used.has(q.id)) { chosen.push(q); used.add(q.id); } }
    return prep(chosen);
  }

  let ex = null, timer = null, keyHandler = null;
  const spent = () => Math.round((Date.now() - ex.t0) / 1000);
  const left = () => Math.max(0, LIMIT - spent());
  const timed = () => ex.mode === 'exam';
  const clockText = () => fmt(timed() ? left() : spent());
  const clockWarn = () => timed() && left() <= WARN;

  // questions — свой набор («Silpnos vietos», «Kartoti klaidas»): без вердикта «сдано» и не в истории попыток
  function start(mode, questions, label) {
    ex = { mode, qs: questions ? prep(questions) : pick(mode), custom: !!questions, label, ans: {}, i: 0, t0: Date.now(), done: false,
           peek: {} };                                                // peek: «вопрос:строка» → true
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
        el('span', {}, `${ex.label || (practice ? 'Treniruotė' : 'Egzaminas')} · ${ex.i + 1} / ${ex.qs.length}`),
        el('span', { class: 'tools' }, window.Look ? window.Look.zoomButtons() : null,      // размер текста
          el('span', { class: 'ru clockbox' + (clockWarn() ? ' warn' : ''), role: 'timer',
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
    if (ex.mode === 'exam') record(ex.qs.map((q, i) => ({ q, a: ex.ans[i] })).filter(x => x.a !== undefined)   // без ответа — не в журнал
      .map(({ q, a }) => ({ q, ok: q.order[a] === 0, hint: false })));
    if (!ex.custom) {
      const hist = read(HIST, []);
      hist.unshift({ d: new Date().toISOString().slice(0, 16).replace('T', ' '), right, n: ex.qs.length, passed, secs, mode: ex.mode,
                     hints: hints() });
      write(HIST, hist.slice(0, 20));
    }
    const wrong = ex.qs.map((q, i) => ({ q, a: ex.ans[i] })).filter(x => x.a === undefined || x.q.order[x.a] !== 0);
    app.replaceChildren(...[
      el('div', { class: 'card result ' + (ex.custom ? '' : passed ? 'pass' : 'fail') },
        el('p', { class: 'big' }, `${right} / ${ex.qs.length}`),
        ex.timeout ? el('p', { class: 'summary' }, 'Laikas baigėsi (время вышло) — neatsakyti klausimai neįskaityti.') : null,
        el('p', { class: 'summary' }, ex.custom ? `${ex.label}: teisingai ${right} iš ${ex.qs.length} (верно)`
          : passed ? 'Išlaikyta! (сдано)' : `Neišlaikyta (не сдано) — reikia ne mažiau kaip ${PASS}`),
        el('p', { class: 'ru' }, `Laikas (время): ${fmt(secs)}`
          + (ex.mode === 'practice' ? ` · vertimo užuominos (подсказки перевода): ${hints()}` : ''))),
      byChapter(),
      wrong.length ? el('div', { class: 'card' },
        el('p', { class: 'summary' }, `Klaidos (ошибки): ${wrong.length}`),
        el('ol', { class: 'review' }, wrong.map(({ q, a }) => reviewItem(q, a)))) : null,
      el('details', { class: 'card all' },                  // разбор всех вопросов — с переводом
        el('summary', {}, 'Visi klausimai su vertimu (все вопросы с переводом)'),
        el('ol', { class: 'review' }, ex.qs.map((q, i) => reviewItem(q, ex.ans[i])))),
      el('div', { class: 'actions' },
        wrong.length ? el('button', { on: { click: () => start('practice', wrong.map(x => Object.assign({}, x.q)), 'Klaidų kartojimas') } },
          'Kartoti klaidas (повторить ошибки)') : null,
        el('button', { class: 'primary', on: { click: home } }, 'Į pradžią (в начало)'))].filter(Boolean));
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
      el('p', { class: 'summary' }, 'Pagal skyrius ', el('span', { class: 'ru' }, '(по главам)')),
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

  // строка разбора: вопрос и ответы — с переводом
  function reviewItem(q, a) {
    const ok = a !== undefined && q.order[a] === 0, tr = i => el('span', { class: 'ru' }, ` — ${q.optsru[i]}`);
    return el('li', {},
      el('div', { class: 'rq' }, q.q), el('div', { class: 'ru' }, q.qru),
      ok ? null : (a !== undefined ? el('div', { class: 'bad' }, '✗ ', q.opts[q.order[a]], tr(q.order[a])) : el('div', { class: 'bad' }, '✗ —')),
      el('div', { class: 'good' }, '✓ ', q.opts[0], tr(0), ' ', el('span', { class: 'art' }, cite(q))));
  }

  // готовность: по журналу и истории попыток. Честно и проверяемо — три условия, без «вероятности сдать»
  function readiness() {
    const j = journal(), hist = read(HIST, []), total = D.exam.length;
    const by = D.chapters.map(c => ({ c, all: 0, new: 0, weak: 0, learn: 0, known: 0 }));
    for (const q of D.exam) { const b = by.find(x => x.c.no === q.sk); b.all++; b[state(j[q.id])]++; }
    const sum = k => by.reduce((n, b) => n + b[k], 0);
    const seen = total - sum('new'), weak = sum('weak'), learn = sum('learn');
    const exams = hist.filter(h => h.mode === 'exam' && h.n === N).slice(0, 3), passed = exams.filter(h => h.passed).length;
    return { by, total, seen, weak, learn, exams, passed, ready: seen === total && !weak && passed === 3 };
  }
  function readyCard(r) {
    const check = (ok, lt, ru) => el('li', { class: ok ? 'ok' : '' },
      el('span', { class: 'mk', role: 'img', 'aria-label': ok ? 'įvykdyta (выполнено)' : 'dar ne (ещё нет)' }, ok ? '✓' : '○'),
      el('span', {}, lt, el('span', { class: 'ru' }, ru)));
    const fresh = !r.seen && !r.exams.length;
    const next = r.ready ? 'Чтобы не забыть, раз в несколько дней сдавайте пробный экзамен.'
      : r.seen < r.total ? `Тренировка даёт сначала новые вопросы: ещё ${Math.ceil((r.total - r.seen) / N)} — и вы увидите весь банк.`
      : r.weak ? 'Повторите слабые места — кнопка «Silpnos vietos» ниже.'
      : 'Сдайте пробный экзамен на время, три раза подряд.';
    return el('div', { class: 'card ready' + (r.ready ? ' yes' : '') },
      el('p', { class: 'summary' }, 'Pasirengimas egzaminui ', el('span', { class: 'ru' }, '(готовность к экзамену)')),
      el('p', { class: 'verdict' }, r.ready ? 'Atrodo, esate pasirengę! ' : fresh ? 'Dar nėra atsakymų. ' : 'Dar ne visai. ',
        el('span', { class: 'ru' }, r.ready ? '(похоже, вы готовы)' : fresh ? '(ответов пока нет)' : '(пока не совсем)')),
      el('ul', { class: 'checks' },
        check(r.seen === r.total, `Išbandyti visi klausimai: ${r.seen} iš ${r.total}`, 'все вопросы банка встречались хотя бы раз'),
        check(r.seen > 0 && !r.weak, !r.seen ? 'Silpni klausimai: —' : r.weak ? `Silpnų klausimų: ${r.weak}` : 'Silpnų klausimų nėra',
          'слабый — последний ответ на него неверный'),
        check(r.passed === 3, `Išlaikyti 3 paskutiniai egzaminai: ${r.passed} iš 3`
          + (r.exams.length ? ` (${r.exams.map(h => h.right).join(', ')})` : ''), `режим «Egzaminas», 45 минут; сдано — от ${PASS} из ${N}`)),
      el('p', { class: 'ru next' }, next));
  }
  function chaptersCard(r) {
    const seg = (b, k) => b[k] ? el('span', { class: k, style: `width:${(100 * b[k] / b.all).toFixed(1)}%` }) : null;
    return el('details', { class: 'card readysk-card', open: r.seen ? '' : null },
      el('summary', {}, 'Pagal skyrius ', el('span', { class: 'ru' }, '(по главам)')),
      el('ul', { class: 'readysk' }, r.by.map(b => el('li', {},
        el('span', { class: 'nm' }, `${b.c.roman}. ${b.c.lt}`),
        el('span', { class: 'bar', role: 'img', 'aria-label': `Išmokta ${b.known}, mokomasi ${b.learn}, silpni ${b.weak}, nauji ${b.new} iš ${b.all}` },
          seg(b, 'known'), seg(b, 'learn'), seg(b, 'weak')),
        el('span', { class: 'sc' }, `${b.known} / ${b.all}`, b.weak ? el('span', { class: 'wk' }, ` · ✗ ${b.weak}`) : null)))),
      el('p', { class: 'legend' }, ...[['known', 'išmokta', 'выучено'], ['learn', 'mokomasi', 'учу'], ['weak', 'silpni', 'слабые'],
        ['new', 'nauji', 'новые']].map(([k, lt, ru]) => el('span', {}, el('i', { class: 'sw ' + k, 'aria-hidden': 'true' }), lt, ' ',
        el('span', { class: 'ru' }, ru)))),
      el('p', { class: 'ru' }, `Выучено — два верных ответа подряд без подсказки перевода. Готовность — по нашему банку из ${r.total} `
        + 'вопросов: на настоящем экзамене формулировки другие, а темы — те же.'),
      r.seen ? el('button', { class: 'linkish', type: 'button', on: { click: () => {
        if (confirm('Išvalyti klausimų statistiką? Bandymų istorija liks.\n(Сбросить статистику по вопросам? История попыток останется.)')) {
          write(JOURNAL, { _reset: Date.now() }); home();                // _reset — чтобы сброс дошёл и до других устройств (sync.js)
        } } } }, 'Išvalyti statistiką ', el('span', { class: 'ru' }, '(сбросить статистику вопросов)')) : null);
  }

  // ---------- план подготовки: konst.plan.v1 = { date: день экзамена ГГГГ-ММ-ДД, done: { глава: когда отмечена }, t } ----------
  // Главы идут по порядку; «сегодня» — следующие несделанные, по стольку в день, чтобы успеть до дней повторения
  // (3 последних дня; если до экзамена меньше 10 дней — 1, меньше 4 — ни одного). Пропустили день — темп пересчитается.
  const PLAN = 'konst.plan.v1';
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysTo = date => Math.round((new Date(date + 'T00:00') - new Date(ymd(new Date()) + 'T00:00')) / 864e5);
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100;
    return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`; };
  function planToday(p) {
    const left = daysTo(p.date), done = p.done || {}, rest = D.chapters.filter(c => !done[c.no]);
    if (left < 0) return { phase: 'past', left, rest };
    if (left === 0) return { phase: 'day', left, rest };
    const review = left >= 10 ? 3 : left >= 4 ? 1 : 0;
    if (!rest.length) return { phase: 'review', left, rest, review };
    const days = Math.max(1, left - review), per = Math.ceil(rest.length / days);
    return { phase: 'learn', left, rest, review, days, per, today: rest.slice(0, per) };
  }
  const savePlan = p => { write(PLAN, Object.assign(p, { t: Date.now() })); home(); document.getElementById('planas')?.scrollIntoView({ block: 'start' }); };
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
  function planCard(r) {
    const p = read(PLAN, null);
    const dateForm = (label, value) => el('form', { class: 'planform', on: { submit: e => {
        e.preventDefault(); const v = e.target.date.value;
        if (!v || daysTo(v) < 1) { alert('Pasirinkite būsimą datą (выберите дату в будущем).'); return; }
        savePlan(Object.assign(read(PLAN, null) || { done: {} }, { date: v }));
      } } },
      el('label', {}, el('span', {}, 'Egzamino data ', el('span', { class: 'ru' }, '(дата экзамена)')),
        el('input', { type: 'date', name: 'date', required: '', min: ymd(new Date(Date.now() + 864e5)), value: value || null })),
      el('button', { type: 'submit' }, label));
    const head = el('p', { class: 'summary' }, 'Pasiruošimo planas ', el('span', { class: 'ru' }, '(план подготовки)'));
    if (!p || !p.date) return el('div', { class: 'card plan', id: 'planas' }, head,
      el('p', { class: 'ru' }, 'Укажите дату экзамена — сайт разложит 14 глав по дням до неё, а последние дни оставит на повторение '
        + 'и пробные экзамены. Пропустили день — план подстроится сам.'),
      dateForm('Sudaryti planą (составить план)'));
    const t = planToday(p), done = p.done || {};
    const chips = el('ol', { class: 'planchips', 'aria-label': `Pereita skyrių: ${D.chapters.length - t.rest.length} iš ${D.chapters.length} (пройдено глав)` },
      D.chapters.map(c => el('li', { class: done[c.no] ? 'done' : (t.today || []).includes(c) ? 'now' : null,
        title: `${c.roman}. ${c.lt}${done[c.no] ? ' — atlikta' : ''}` }, c.roman)));
    const day = loc => new Date(p.date + 'T00:00').toLocaleDateString(loc, { month: 'long', day: 'numeric' });   // «lapkričio 19 d.», «19 ноября»
    const when = el('p', { class: 'when' }, t.left > 0 ? `Iki egzamino: ${t.left} d. — ${day('lt-LT')} ` : `${day('lt-LT')} `,
      el('span', { class: 'ru' }, t.left > 0 ? `(до экзамена ${plural(t.left, 'день', 'дня', 'дней')}, ${day('ru-RU')})` : `(${day('ru-RU')})`));
    let body;
    if (t.phase === 'learn') {
      body = [el('p', { class: 'today' }, 'Šiandien ', el('span', { class: 'ru' }, '(сегодня)'), ':'),
        el('ul', { class: 'plantoday' }, t.today.map(c => el('li', {}, el('b', {}, `${c.roman}. ${c.lt}`), el('span', { class: 'ru' }, c.ru), chapterGo(c)))),
        el('div', { class: 'actions planok' }, el('button', { class: 'primary', type: 'button', on: { click: () => {
          const pl = read(PLAN, p); pl.done = Object.assign(pl.done || {}, Object.fromEntries(t.today.map(c => [c.no, Date.now()]))); savePlan(pl);
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
    return el('div', { class: 'card plan', id: 'planas' }, head, when, chips, ...body,
      el('p', { class: 'planfoot' },
        t.phase !== 'past' ? el('details', { class: 'planchange' }, el('summary', {}, 'Pakeisti datą ', el('span', { class: 'ru' }, '(изменить дату)')),
          dateForm('Išsaugoti (сохранить)', p.date)) : null,
        el('button', { type: 'button', class: 'linkish', on: { click: () => {
          if (confirm('Ištrinti planą? (Удалить план? Ответы и статистика останутся.)')) savePlan({ date: '', done: {} });
        } } }, 'Ištrinti planą ', el('span', { class: 'ru' }, '(удалить план)'))));
  }

  function home() {
    clearInterval(timer); keyHandler = null;
    const hist = read(HIST, []), r = readiness(), weak = weakOnes(), plan = (read(PLAN, null) || {}).date;
    app.replaceChildren(...[
      plan ? planCard(r) : null,
      readyCard(r),
      el('div', { class: 'actions exam-start' },
        el('button', { class: 'primary', on: { click: () => start('exam') } }, 'Egzaminas (экзамен)'),
        el('button', { on: { click: () => start('practice') } }, 'Treniruotė (с проверкой сразу)'),
        weak.length ? el('button', { on: { click: () => start('practice', weakOnes(), 'Silpnos vietos') } },
          `Silpnos vietos (слабые места) · ${weak.length}`) : null),
      plan ? null : planCard(r),
      chaptersCard(r),
      el('div', { class: 'card' },
        el('p', {}, `${N} klausimų lietuvių kalba, po 3 atsakymų variantus; išlaikyta, jei teisingai atsakyta į ne mažiau kaip ${PASS}.`),
        el('p', { class: 'ru' }, `${N} вопросов на литовском, по 3 варианта ответа; экзамен сдан, если верно не меньше ${PASS}. `
          + 'Так по официальной программе экзамена (2004 г., ред. 2009 г.): вопросы — по всем главам Конституции. '
          + 'Экзамен проводит Национальное агентство образования (NŠA) на компьютере, на него даётся 45 минут; '
          + 'здесь в режиме «Egzaminas» — тоже 45 минут обратным отсчётом, в тренировке время не ограничено. '
          + `Здесь вопросы — по всем 14 главам (банк: ${D.exam.length}).`),
        el('p', { class: 'ru' }, 'Перевод. В тренировке перевод вопроса и любого варианта можно подсмотреть кнопкой RU '
          + '(вопрос — и клавишей T); подсказки считаются в результате. После ответа переведено всё. В экзамене перевода '
          + 'нет, как на настоящем экзамене: он в разборе в конце.'),
        el('p', { class: 'ru' }, 'Тренировка даёт сначала новые и слабые вопросы, экзамен — случайные, как на настоящем.')),
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
  const qsk = +new URLSearchParams(location.search).get('sk'), qc = chapter(qsk);   // ?sk=N — вопросы одной главы (из плана, с витрины)
  if (qc) { history.replaceState(null, '', location.pathname); start('practice', chapterQs(qsk), `${qc.roman} skyrius`); }
  else if (location.hash === '#planas') document.getElementById('planas')?.scrollIntoView({ block: 'start' });
})();
