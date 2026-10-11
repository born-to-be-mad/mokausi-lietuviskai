// Тренажёр Конституции: колоды «термины / глаголы / прилагательные / факты»; карточки (интервальное повторение
// по Лейтнеру), тест, прогресс. Данные — window.KONST из data/decks.js (генерирует scripts/web.py).
// Прогресс — localStorage этого браузера.
(() => {
  'use strict';
  const D = window.KONST;
  const app = document.getElementById('app');
  const STORE = 'konst.terms.v1', PREFS = 'konst.prefs.v1';   // имена ключей прежние: прогресс терминов сохраняется
  const MIN = 60e3, DAY = 864e5;
  const INTERVAL = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY];   // по номеру коробки 0…5
  const LEARNED = 3;            // коробка ≥ 3 — «выучено»
  const NEW_PER_SESSION = 15;   // новых карточек за сессию
  const QUIZ_LEN = 10;

  // ---------- хранение (localStorage может быть недоступен — тогда всё живёт до перезагрузки) ----------
  const read = (k, dflt) => { try { return JSON.parse(localStorage.getItem(k)) || dflt; } catch { return dflt; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
  let progress = read(STORE, {});
  const prefs = Object.assign({ deck: 'terms', sk: 'all', dir: 'lt-ru', mode: 'cards' }, read(PREFS, {}));
  if (!D.decks[prefs.deck]) prefs.deck = 'terms';
  const savePrefs = () => write(PREFS, prefs);

  const rec = t => progress[t.key] || { box: 0, due: 0, right: 0, wrong: 0 };
  function grade(t, ok) {
    const r = Object.assign({}, rec(t));
    if (ok) { r.box = Math.min(5, r.box + 1); r.right++; } else { r.box = 1; r.wrong++; }
    r.due = Date.now() + INTERVAL[r.box];
    progress[t.key] = r;
    write(STORE, progress);
  }

  // ---------- помощники ----------
  const deck = () => D.decks[prefs.deck];
  const items = () => deck().items;
  const chapter = no => D.chapters.find(c => c.no === no);
  const pool = () => prefs.sk === 'all' ? items() : items().filter(t => t.sk === +prefs.sk);
  const plain = s => (s || '').replace(/\|/g, '');
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isDue = t => { const r = rec(t); return r.box > 0 && r.due <= Date.now(); };
  const dupRu = () => new Set(items().map(t => t.ru).filter((ru, i, a) => a.indexOf(ru) !== i));
  // слова RU-перевода (≥ 4 букв): «гарантировать, обеспечивать» и «обеспечивать» — пересекаются
  const ruWords = s => new Set((s.toLowerCase().match(/[а-яё]{4,}/g) || []));
  const overlaps = (a, b) => { const w = ruWords(b); for (const x of ruWords(a)) if (w.has(x)) return true; return false; };

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  // «valstyb|ė» → valstyb<span class=end>ė</span> (окончание — цветом, как в книге)
  function forms(s) {
    const out = [], re = /([^\s|]+)\|([^\s|,.;:!?]+)/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      out.push(s.slice(last, m.index), m[1], el('span', { class: 'end' }, m[2]));
      last = re.lastIndex;
    }
    out.push(s.slice(last));
    return out;
  }
  // произношение (speak.js): что читать вслух — у глаголов формы с паузами, у фактов весь факт
  const S = window.Speak;
  const sayText = t => prefs.deck === 'verbs' ? t.lt.split(' ').join(', ') : t.lt;
  let speakNow = null;              // что прочитать по клавише S на текущем экране
  const sayBtn = text => (S && S.available() ? S.button(text) : null);
  // формы слова в карточке: у глаголов три формы через « · »
  const ltForms = t => forms(prefs.deck === 'verbs' ? t.lt.split(' ').join(' · ') : t.lt);
  const cite = t => t.art ? `(${t.artsk} SK. ${t.art} str.)` : '';
  const chTag = t => { const c = chapter(t.sk); return c ? `${c.roman}. ${c.lt}` : ''; };

  function stats(list) {
    const now = Date.now();
    let learned = 0, due = 0, fresh = 0;
    for (const t of list) {
      const r = rec(t);
      if (r.box >= LEARNED) learned++;
      if (r.box === 0) fresh++; else if (r.due <= now) due++;
    }
    return { total: list.length, learned, due, fresh };
  }
  const bar = (part, total) => el('div', { class: 'bar' }, el('span', { style: `width:${total ? Math.round(100 * part / total) : 0}%` }));

  function meter() {
    const s = stats(pool());
    document.getElementById('meter').replaceChildren(
      `Išmokta (выучено): ${s.learned} / ${s.total} · kartoti (повторить): ${s.due} · nauji (новые): ${s.fresh}`,
      bar(s.learned, s.total));
  }

  // ---------- карточки ----------
  let queue = [], session = { right: 0, wrong: 0 }, keyHandler = null;

  function startCards() {
    const list = pool();
    const due = list.filter(isDue).sort((a, b) => rec(a).due - rec(b).due);
    const fresh = list.filter(t => rec(t).box === 0).slice(0, NEW_PER_SESSION);
    queue = [...due, ...fresh];
    session = { right: 0, wrong: 0, total: queue.length };
    nextCard();
  }

  function backDetails(t) {
    if (prefs.deck === 'facts') return t.art ? el('div', { class: 'ex' }, el('span', { class: 'art' }, cite(t))) : null;
    const label = deck().forms;
    return [
      label || t.gram ? el('div', { class: 'gram' }, [label, t.gram].filter(Boolean).join(' · ')) : null,
      t.syn && t.syn.length ? el('div', { class: 'syn' }, `≈ ${t.syn.join(', ')} `, el('span', { class: 'ru' }, '(синонимы)')) : null,
      t.ex ? el('div', { class: 'ex' }, el('div', {}, forms(t.ex), sayBtn(t.ex), ' ', el('span', { class: 'art' }, cite(t))),
        el('div', { class: 'exru' }, t.exru)) : null,
    ];
  }

  function nextCard() {
    meter();
    if (!queue.length) return cardsDone();
    const t = queue[0], ltFirst = prefs.dir === 'lt-ru';
    const fc = isFacts() ? 'front fact' : 'front';   // факт — целое предложение: шрифт поменьше
    const front = ltFirst
      ? el('div', { class: fc }, ltForms(t), sayBtn(sayText(t)))
      : el('div', { class: fc + ' ru-side' }, t.ru);
    const hint = !ltFirst && dupRu().has(t.ru) && t.exru ? el('div', { class: 'hint' }, `Pvz. (напр.): ${t.exru}`) : null;
    const back = el('div', { class: 'back', hidden: true },
      ltFirst ? el('div', { class: 'main ru-side' }, t.ru) : el('div', { class: 'main' }, ltForms(t), sayBtn(sayText(t))),
      backDetails(t));
    const answer = ok => { grade(t, ok); queue.shift(); if (ok) session.right++; else { session.wrong++; queue.push(t); } nextCard(); };
    const show = el('button', { class: 'primary', on: { click: reveal } }, 'Rodyti (показать) ', el('span', { class: 'key' }, '␣'));
    const no = el('button', { class: 'no', hidden: true, on: { click: () => answer(false) } }, 'Nežinojau (не знал) ', el('span', { class: 'key' }, '1'));
    const yes = el('button', { class: 'yes', hidden: true, on: { click: () => answer(true) } }, 'Žinojau (знал) ', el('span', { class: 'key' }, '2'));
    function reveal() { back.hidden = false; show.hidden = true; no.hidden = false; yes.hidden = false; yes.focus(); speakNow = () => S.say(sayText(t)); }
    speakNow = ltFirst ? () => S.say(sayText(t)) : null;     // RU → LT: литовское — только после «Rodyti»
    keyHandler = e => {
      if (e.key === ' ' || e.key === 'Enter') { if (!show.hidden) { e.preventDefault(); reveal(); } }
      else if (show.hidden && e.key === '1') answer(false);
      else if (show.hidden && e.key === '2') answer(true);
    };
    app.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'tag' }, `${deck().lt} · ${chTag(t)} · liko (осталось): ${queue.length}`),
        front, hint, back),
      el('div', { class: 'actions' }, show, no, yes));
    show.focus();
  }

  function cardsDone() {
    keyHandler = null;
    const left = pool().filter(t => rec(t).box === 0).length;
    app.replaceChildren(el('div', { class: 'card empty' },
      session.total
        ? el('p', { class: 'summary' }, `Atlikta! (готово) Žinojau (знал): ${session.right}, nežinojau (не знал): ${session.wrong}.`)
        : el('p', { class: 'summary' }, 'Šiandien kartoti nieko nereikia. (Сегодня повторять нечего.)'),
      left ? el('p', {}, `Dar nauji žodžiai (ещё новые слова): ${left}.`) : null,
      el('div', { class: 'actions' },
        left ? el('button', { class: 'primary', on: { click: startCards } }, 'Toliau (дальше)') : null,
        el('button', { on: { click: () => { queue = shuffle(pool()).slice(0, 10); session = { right: 0, wrong: 0, total: queue.length }; nextCard(); } } },
          'Atsitiktiniai 10 (случайные 10)'))));
  }

  // ---------- тест ----------
  let quiz = null, answered = false;
  function startQuiz() {
    const list = pool();
    // сначала то, что пора повторить, затем новое, затем выученное — внутри групп случайно
    const prio = t => isDue(t) ? 0 : rec(t).box === 0 ? 1 : 2;
    const chosen = shuffle(list).sort((a, b) => prio(a) - prio(b)).slice(0, QUIZ_LEN);
    quiz = { items: chosen, i: 0, score: 0, mistakes: [] };
    nextQuestion();
  }

  // факты: вопрос «число» (в факте спрятано число) или «смысл» (какой перевод верный); слова: перевод / лемма
  const isFacts = () => prefs.deck === 'facts';
  function options(t) {
    const ltFirst = prefs.dir === 'lt-ru';
    if (isFacts() && t.num) return shuffle(t.num.options).map(o => ({ t: o === t.num.answer ? t : null, label: o }));
    if (isFacts()) {            // неверные — другие факты той же главы (их надо прочитать); перевод отличается
      const val = x => ltFirst ? x.ru : x.lt;
      // факты с числом в неверные варианты не берём — иначе перевод подскажет ответ на «Koks skaičius?»
      const pool2 = items().filter(x => x.key !== t.key && !x.num);
      const cand = [...shuffle(pool2.filter(x => x.sk === t.sk)), ...shuffle(pool2.filter(x => x.sk !== t.sk))]
        .filter((x, i, a) => a.findIndex(y => val(y) === val(x)) === i);
      return shuffle([t, ...cand.slice(0, 3)]).map(x => ({ t: x, label: val(x) }));
    }
    const val = x => ltFirst ? x.ru : x.lemma;
    const near = pool().length >= 4 ? pool() : items();             // варианты — из той же главы, если хватает
    // неверный вариант не должен оказаться верным: не синоним, без общих слов в переводе
    const wrongOk = x => x.key !== t.key && x.ru !== t.ru && !overlaps(x.ru, t.ru)
      && !(t.syn || []).includes(x.lemma) && !(x.syn || []).includes(t.lemma);
    const cand = [...shuffle(near), ...shuffle(items())]
      .filter((x, i, a) => wrongOk(x) && a.findIndex(y => val(y) === val(x)) === i);
    return shuffle([t, ...cand.slice(0, 3)]).map(x => ({ t: x, label: val(x) }));
  }

  function nextQuestion() {
    meter();
    if (quiz.i >= quiz.items.length) return quizDone();
    const t = quiz.items[quiz.i], ltFirst = prefs.dir === 'lt-ru';
    const opts = options(t);
    answered = false;
    const next = el('button', { class: 'btn primary', hidden: true, on: { click: () => { quiz.i++; nextQuestion(); } } }, 'Kitas (дальше)');
    const buttons = opts.map((o, k) => el('button', { on: { click: () => pick(k) } }, `${k + 1}. ${o.label}`));
    // после ответа на вопрос по факту — весь факт на обоих языках
    const feedback = isFacts() ? el('div', { class: 'feedback', hidden: true },
      el('div', {}, forms(t.lt), sayBtn(t.lt), ' ', el('span', { class: 'art' }, cite(t))), el('div', { class: 'exru' }, t.ru)) : null;
    function pick(k) {
      if (!next.hidden) return;
      const ok = opts[k].t === t;
      buttons.forEach((b, j) => { b.disabled = true; if (opts[j].t === t) b.classList.add('ok'); });
      if (!ok) { buttons[k].classList.add('wrong'); quiz.mistakes.push(t); } else quiz.score++;
      grade(t, ok);
      answered = true;
      if (feedback) feedback.hidden = false;
      next.hidden = false; next.focus();
    }
    keyHandler = e => {
      const n = +e.key;
      if (n >= 1 && n <= opts.length) pick(n - 1);
      else if ((e.key === 'Enter' || e.key === ' ') && !next.hidden) { e.preventDefault(); next.click(); }
    };
    let prompt;
    speakNow = null;
    if (isFacts() && t.num) {
      const [a, b] = t.num.text.split('___');
      speakNow = () => S.say(t.num.text);
      prompt = [el('div', { class: 'ask' }, 'Koks skaičius? (какое число?)'),
        el('div', { class: 'front fact' }, a, el('span', { class: 'blank' }, '___'), b, sayBtn(t.num.text))];
    } else if (isFacts()) {
      if (ltFirst) speakNow = () => S.say(t.lt);
      prompt = [el('div', { class: 'ask' }, ltFirst ? 'Ką tai reiškia? (что это значит?)' : 'Kaip tai lietuviškai? (как это по-литовски?)'),
        ltFirst ? el('div', { class: 'front fact' }, t.lt, sayBtn(t.lt)) : el('div', { class: 'front fact ru-side' }, t.ru)];
    } else {
      if (ltFirst) speakNow = () => S.say(t.lemma);
      prompt = [ltFirst ? el('div', { class: 'front' }, t.lemma, sayBtn(t.lemma)) : el('div', { class: 'front ru-side' }, t.ru),
        !ltFirst && dupRu().has(t.ru) && t.exru ? el('div', { class: 'hint' }, `Pvz. (напр.): ${t.exru}`) : null];
    }
    app.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'tag' }, `${quiz.i + 1} / ${quiz.items.length} · ${deck().lt} · ${chTag(t)}`),
        prompt, el('div', { class: 'opts' + (isFacts() && !t.num ? ' long' : '') }, buttons), feedback),
      next);
  }

  function quizDone() {
    keyHandler = null;
    const q = quiz;
    app.replaceChildren(el('div', { class: 'card' },
      el('p', { class: 'summary' }, `Rezultatas (результат): ${q.score} / ${q.items.length}`),
      bar(q.score, q.items.length),
      q.mistakes.length ? el('div', {},
        el('p', {}, 'Klaidos (ошибки) — jos grįš į korteles (вернутся в карточки):'),
        el('ul', { class: 'mistakes' }, q.mistakes.map(t => el('li', {}, ltForms(t), ' — ', t.ru)))) : null),
      el('div', { class: 'actions' }, el('button', { class: 'primary', on: { click: startQuiz } }, 'Dar kartą (ещё раз)')));
  }

  // ---------- прогресс ----------
  function showProgress() {
    keyHandler = null;
    meter();
    const rows = D.chapters.map(c => {
      const list = items().filter(t => t.sk === c.no);
      if (!list.length) return null;
      const s = stats(list);
      return el('tr', {},
        el('td', {}, el('div', {}, `${c.roman}. ${c.lt}`), el('div', { class: 'ru' }, c.ru), bar(s.learned, s.total)),
        el('td', { class: 'num' }, `${s.learned}/${s.total}`, s.due ? el('div', {}, `↻ ${s.due}`) : null),
        el('td', {}, el('button', { on: { click: () => { prefs.sk = String(c.no); setMode('cards'); } } }, 'Mokytis')));
    });
    const decksRow = Object.entries(D.decks).map(([k, d]) => {
      const s = stats(d.items);
      return el('div', { class: 'deckstat' }, el('div', {}, `${d.lt} `, el('span', { class: 'ru' }, `(${d.ru})`), ` — ${s.learned} / ${s.total}`), bar(s.learned, s.total));
    });
    app.replaceChildren(
      el('div', { class: 'card' },
        el('p', { class: 'summary' }, 'Visi rinkiniai (все наборы)'),
        decksRow,
        el('p', { class: 'ru' }, `«Выучено» — слово узнано правильно ${LEARNED} раза подряд с перерывами (10 минут, потом день). ↻ — пора повторить.`)),
      el('div', { class: 'card' },
        el('p', { class: 'summary' }, `${deck().lt} (${deck().ru}) — pagal skirsnius (по главам)`),
        el('table', { class: 'stats' }, el('tbody', {}, rows))),
      el('div', { class: 'actions' }, el('button', {
        on: { click: () => { if (confirm('Ištrinti visą pažangą? (Удалить весь прогресс во всех наборах?)')) { progress = {}; write(STORE, progress); showProgress(); } } }
      }, 'Pradėti iš naujo (сбросить прогресс)')));
  }

  // ---------- каркас ----------
  const deckSel = document.getElementById('deck'), skSel = document.getElementById('sk'), dirSel = document.getElementById('dir');

  function fillChapters() {     // главы, в которых в текущей колоде есть слова
    skSel.replaceChildren(el('option', { value: 'all' }, `Visi skirsniai (все главы) — ${items().length}`),
      ...D.chapters.map(c => {
        const n = items().filter(t => t.sk === c.no).length;
        return n ? el('option', { value: String(c.no) }, `${c.roman}. ${c.lt} — ${n}`) : null;
      }));
    if (![...skSel.options].some(o => o.value === prefs.sk)) prefs.sk = 'all';
    skSel.value = prefs.sk;
  }

  function setMode(mode) {
    prefs.mode = mode; savePrefs();
    skSel.value = prefs.sk;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    ({ cards: startCards, quiz: startQuiz, progress: showProgress })[mode]();
  }

  deckSel.append(...Object.entries(D.decks).map(([k, d]) => el('option', { value: k }, `${d.lt} — ${d.items.length}`)));
  deckSel.value = prefs.deck; dirSel.value = prefs.dir;
  fillChapters();
  deckSel.addEventListener('change', () => { prefs.deck = deckSel.value; fillChapters(); setMode(prefs.mode); });
  skSel.addEventListener('change', () => { prefs.sk = skSel.value; setMode(prefs.mode === 'progress' ? 'cards' : prefs.mode); });
  dirSel.addEventListener('change', () => { prefs.dir = dirSel.value; setMode(prefs.mode); });
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.addEventListener('keydown', e => {
    if ((e.key === 's' || e.key === 'S' || e.key === 'š' || e.key === 'Š') && speakNow && !e.ctrlKey && !e.metaKey && !e.altKey
        && !/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { speakNow(); return; }
    if (keyHandler && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) keyHandler(e);
  });
  // голос: есть литовский — показать выбор скорости и перерисовать экран с кнопками; нет — подсказка
  if (S) S.onReady(ok => {
    document.getElementById(ok ? 'voiceCtl' : 'novoice').hidden = false;
    if (!ok) return;
    const rate = document.getElementById('rate');
    rate.value = String(S.rate === 0.7 ? 0.7 : 0.9);
    rate.addEventListener('change', () => { S.rate = Number(rate.value); });
    // перерисовать текущий экран с кнопками, не сбрасывая сессию (вопрос — только если ещё без ответа)
    if (prefs.mode === 'cards' && queue.length) nextCard();
    else if (prefs.mode === 'quiz' && quiz && !answered && quiz.i < quiz.items.length) nextQuestion();
  });
  setMode(prefs.mode);
})();
