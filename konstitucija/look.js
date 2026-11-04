// Вид сайта: «Įprasta» (по умолчанию), «Spalvota» (цветной; id kids) или «Kontrastas» (высокий контраст) — html[data-look],
// стили в look.css. Подключается в <head> без defer: вид применяется до отрисовки, без мигания. Переключатель — в шапке,
// справа в строке разделов (до 1100px — выпадающий список, на телефоне — рядом с заголовком; у кнопок — подсказка при
// наведении); выбор хранится в localStorage этого браузера (общий для витрины и всех страниц раздела).
// Look.ask / Look.toast — подтверждение и сообщение прямо на странице вместо confirm() / alert(); «Daugiau» — popover. Здесь же — ссылка «Pereiti prie turinio» для клавиатуры (первая в странице) и размер
// текста A− / A+ для страниц, подключивших скрипт с data-zoom (тренажёр, экзамен): html --zoom, localStorage konst.zoom.
// И резервная копия прогресса: кнопки [data-backup="save" | "load"] — файл со всеми записями konst.* этого браузера
// (тренажёр, экзамен, чтение, настройки); загрузка из файла заменяет их на этом устройстве (без сервера и регистрации).
(() => {
  'use strict';
  const KEY = 'konst.look', root = document.documentElement;
  const SELF = document.currentScript ? document.currentScript.src : '';   // …/konstitucija/look.js — от него пути раздела
  // сервер (sync/worker.js): синхронизация (sync.js) и «Pranešti apie klaidą»; для проверки — localStorage mokausi.sync.api
  const API = (() => { try { return localStorage.getItem('mokausi.sync.api'); } catch { return null; } })()
    || 'https://mokausi-sync.d-marudau.workers.dev';
  const ZKEY = 'konst.zoom', ZOOM = [0.9, 1, 1.12, 1.25, 1.4];       // шаги размера текста; 1 — по умолчанию
  const zoomable = !!(document.currentScript && 'zoom' in document.currentScript.dataset);
  let zi = 1;
  try { const v = parseInt(localStorage.getItem(ZKEY), 10); if (v >= 0 && v < ZOOM.length) zi = v; } catch { /* приватный режим */ }
  const syncZoom = () => document.querySelectorAll('[data-zoom-step]').forEach(b => {
    b.disabled = Number(b.dataset.zoomStep) < 0 ? zi === 0 : zi === ZOOM.length - 1;
  });
  if (zoomable) root.style.setProperty('--zoom', ZOOM[zi]);
  document.addEventListener('click', e => {                         // кнопки A− / A+ где угодно на странице
    const b = e.target.closest && e.target.closest('[data-zoom-step]');
    if (!b || !zoomable) return;
    zi = Math.max(0, Math.min(ZOOM.length - 1, zi + Number(b.dataset.zoomStep)));
    root.style.setProperty('--zoom', ZOOM[zi]);
    try { if (zi === 1) localStorage.removeItem(ZKEY); else localStorage.setItem(ZKEY, String(zi)); } catch { /* приватный режим */ }
    syncZoom();
  });
  // ---------- прогресс в файл и из файла ----------
  const OWN = /^konst\.(?!sync$)/;                                // свои записи (на домене живут и другие сайты); код синхронизации — нет
  const APP = 'mokausi-lietuviskai';
  function snapshot() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (OWN.test(k)) data[k] = localStorage.getItem(k); }
    return { app: APP, kind: 'progress', v: 1, saved: new Date().toISOString(), data };
  }
  function restore(obj) {
    if (!obj || obj.app !== APP || obj.kind !== 'progress' || !obj.data || typeof obj.data !== 'object') throw new Error('ne pažangos failas');
    Object.keys(localStorage).filter(k => OWN.test(k)).forEach(k => localStorage.removeItem(k));
    for (const [k, v] of Object.entries(obj.data)) if (OWN.test(k) && typeof v === 'string') localStorage.setItem(k, v);
  }
  function saveFile() {
    try { localStorage.setItem('konst.saved', String(Date.now())); } catch { /* приватный режим */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' }));
    a.download = `mokausi-lietuviskai-pazanga-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function loadFile(btn) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      let obj;
      try { obj = JSON.parse(await f.text()); if (obj.app !== APP || obj.kind !== 'progress') throw 0; }
      catch { toast('Tai ne pažangos failas.', 'Это не файл прогресса «Mokausi lietuviškai».', { alert: true }); return; }
      const when = obj.saved ? new Date(obj.saved).toLocaleDateString('lt-LT') : '?';
      if (!await ask(btn, `Pakeisti pažangą šiame įrenginyje failo pažanga (${when})?`,
        'Заменить прогресс на этом устройстве прогрессом из файла? Текущий прогресс здесь будет заменён.',
        { yes: 'Pakeisti', yesRu: 'заменить', danger: true })) return;
      try { restore(obj); } catch { toast('Nepavyko įkelti.', 'Не удалось загрузить.', { alert: true }); return; }
      location.reload();
    });
    inp.click();
  }
  document.addEventListener('click', e => {                         // кнопки «сохранить / загрузить» где угодно
    const b = e.target.closest && e.target.closest('[data-backup]');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.backup === 'save') saveFile(); else loadFile(b);
  });

  // ---------- подтверждения и сообщения на странице (вместо confirm() / alert()) ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // ask(кнопка, вопрос LT, перевод, { yes, yesRu, no, noRu, danger }) → Promise<boolean>: под рядом кнопок — вопрос и
  // «Taip / Ne» (опасное действие — фокус на «Ne»; Esc — «Ne»). Без кнопки — окно <dialog> посреди экрана.
  let asking = null;
  function ask(anchor, lt, ru, o = {}) {
    if (asking) asking(false);
    return new Promise(done => {
      const id = 'ask' + Date.now();
      const box = document.createElement(anchor ? 'div' : 'dialog');
      box.className = anchor ? 'confirm' : 'confirm confirm-dlg';
      box.setAttribute('role', anchor ? 'group' : 'alertdialog');
      box.setAttribute('aria-labelledby', id);
      box.innerHTML = `<p id="${id}">${esc(lt)} <span class="ru">${esc(ru)}</span></p><div class="confirm-btns">`
        + `<button type="button" class="${o.danger ? 'danger' : 'primary'}" data-a="1">${esc(o.yes || 'Taip')} <span class="ru">${esc(o.yesRu || 'да')}</span></button>`
        + `<button type="button" data-a="0">${esc(o.no || 'Ne')} <span class="ru">${esc(o.noRu || 'нет')}</span></button></div>`;
      const finish = ok => {
        asking = null;
        if (box.close) box.close();
        box.remove();
        if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
        done(ok);
      };
      asking = finish;
      box.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) finish(b.dataset.a === '1'); });
      box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
      if (anchor) {
        const row = anchor.closest('.actions, .backup-btns, .planfoot, .confirm-host') || anchor;
        row.after(box);
        box.scrollIntoView({ block: 'nearest' });
      } else {
        document.body.append(box);
        box.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
        box.showModal();
      }
      box.querySelector(o.danger ? '[data-a="0"]' : '[data-a="1"]').focus({ preventScroll: true });
      say(`${lt} ${ru}`);
    });
  }
  // toast(LT, перевод, { undo, alert, ms }) — строка внизу экрана; с undo — кнопка «Grąžinti (вернуть)»
  let toastEl = null, toastTimer = 0;
  function toast(lt, ru, o = {}) {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.remove();
    const t = toastEl = document.createElement('div');
    t.className = 'toast' + (o.alert ? ' alert' : '');
    t.setAttribute('role', o.alert ? 'alert' : 'status');
    t.innerHTML = `<p>${esc(lt)}${ru ? ` <span class="ru">${esc(ru)}</span>` : ''}</p>`
      + (o.undo ? '<button type="button" data-undo>Grąžinti <span class="ru">вернуть</span></button>' : '')
      + '<button type="button" class="toastx" aria-label="Uždaryti (закрыть)">✕</button>';
    const hide = () => { clearTimeout(toastTimer); t.remove(); if (toastEl === t) toastEl = null; };
    t.addEventListener('click', e => {
      if (e.target.closest('[data-undo]')) { hide(); o.undo(); } else if (e.target.closest('.toastx')) hide();
    });
    const arm = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hide, o.ms || (o.undo ? 8000 : 6000)); };
    t.addEventListener('focusin', () => clearTimeout(toastTimer));      // пока кнопка в фокусе — не исчезает
    t.addEventListener('focusout', arm);
    document.body.append(t);
    arm();
  }
  // ---------- сегодня сделано: konst.days.v1 = { 'ГГГГ-ММ-ДД': { c: карточек, q: вопросов, r: рассказов, p: глав плана } } ----------
  // Пишут тренажёр (app.js), экзамен (exam.js), чтение (reader.js) и план; «N iš 7» — сколько из последних 7 дней были занятия
  // (пропуск ничего не обнуляет). Хранятся 60 дней; синхронизируется (sync.js: по дню — наибольшее).
  const DKEY = 'konst.days.v1';
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = () => { try { return JSON.parse(localStorage.getItem(DKEY)) || {}; } catch { return {}; } };
  function track(kind, n = 1) {
    const all = days(), k = dayKey(), d = all[k] = all[k] || {};
    d[kind] = Math.max(0, (d[kind] || 0) + n);
    const old = dayKey(new Date(Date.now() - 60 * 864e5));
    for (const x of Object.keys(all)) if (x < old) delete all[x];
    try { localStorage.setItem(DKEY, JSON.stringify(all)); } catch { /* приватный режим */ }
  }
  const active = d => !!d && ['c', 'q', 'r', 'p'].some(k => d[k] > 0);
  const week = () => { const all = days(); return [6, 5, 4, 3, 2, 1, 0].map(i => active(all[dayKey(new Date(Date.now() - i * 864e5))])); };
  // строка «Šiandien atlikta: 12 kortelių · 8 klausimai · 5 iš 7 dienų» (LT и RU) — для главной и плана
  const ltN = (n, one, few, many) => { const a = n % 10, b = n % 100; return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && (b < 12 || b > 19) ? few : many}`; };
  const ruN = (n, one, few, many) => { const a = n % 10, b = n % 100; return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`; };
  function todayLine() {
    const d = days()[dayKey()] || {}, wk = week(), n = wk.filter(Boolean).length;
    if (!n) return null;
    const lt = [d.c && ltN(d.c, 'kortelė', 'kortelės', 'kortelių'), d.q && ltN(d.q, 'klausimas', 'klausimai', 'klausimų'),
      d.r && ltN(d.r, 'pasakojimas', 'pasakojimai', 'pasakojimų'), d.p && ltN(d.p, 'plano skyrius', 'plano skyriai', 'plano skyrių')].filter(Boolean);
    const ru = [d.c && ruN(d.c, 'карточка', 'карточки', 'карточек'), d.q && ruN(d.q, 'вопрос', 'вопроса', 'вопросов'),
      d.r && ruN(d.r, 'рассказ', 'рассказа', 'рассказов'), d.p && ruN(d.p, 'глава плана', 'главы плана', 'глав плана')].filter(Boolean);
    return { lt: lt.length ? `Šiandien atlikta: ${lt.join(' · ')}` : 'Šiandien dar nieko', ru: ru.length ? `сегодня: ${ru.join(', ')}` : 'сегодня ещё не занимались',
             week: wk, n, wlt: `${n} iš 7 dienų`, wru: `занимались ${ruN(n, 'день', 'дня', 'дней')} из последних 7` };
  }
  // разметка строки: текст и 7 квадратиков недели (последний — сегодня)
  function todayHtml() {
    const t = todayLine();
    if (!t) return '';
    return `<p class="daystrip"><span class="dt">${esc(t.lt)} <span class="ru">${esc(t.ru)}</span></span>`
      + `<span class="wk" role="img" aria-label="${esc(t.wlt)} (${esc(t.wru)})">${t.week.map(a => `<i class="${a ? 'on' : ''}"></i>`).join('')}`
      + `<b>${esc(t.wlt)}</b></span></p>`;
  }

  // ---------- «Pranešti apie klaidą»: окно с полем — сообщение уходит на сервер (без имени и почты) ----------
  // кнопки [data-report] где угодно; data-ref — что именно (id вопроса экзамена, статья); страница — адрес без #/?
  function report(btn) {
    const ref = (btn && btn.dataset.ref) || '';
    const d = document.createElement('dialog');
    d.className = 'confirm confirm-dlg reportdlg';
    d.setAttribute('aria-labelledby', 'rep-h');
    d.innerHTML = `<form method="dialog"><p id="rep-h">Pranešti apie klaidą <span class="ru">сообщить об ошибке</span></p>`
      + `<p class="ru rep-note">Опишите, что не так: опечатка, неточный перевод, неверный ответ, неправильное ударение в озвучке.`
      + ` Имя и почта не нужны — сообщение анонимное.${ref ? ` Вопрос: <code>${esc(ref)}</code>.` : ''}</p>`
      + `<label class="rep-l"><span class="sr">Tekstas (текст)</span><textarea name="text" rows="5" maxlength="1000" required minlength="3"`
      + ` placeholder="Pvz.: 12 str. vertime trūksta žodžio… / Например: в переводе статьи 12 пропущено слово…"></textarea></label>`
      + `<label class="hp" aria-hidden="true">Svetainė <input name="website" tabindex="-1" autocomplete="off"></label>`
      + `<div class="confirm-btns"><button type="submit" class="primary" value="send">Siųsti <span class="ru">отправить</span></button>`
      + `<button type="button" data-x>Atšaukti <span class="ru">отмена</span></button></div></form>`;
    const close = () => { d.close(); d.remove(); if (btn && btn.isConnected) btn.focus({ preventScroll: true }); };
    d.querySelector('[data-x]').addEventListener('click', close);
    d.addEventListener('cancel', e => { e.preventDefault(); close(); });
    d.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, send = f.querySelector('[type=submit]');
      send.disabled = true;
      try {
        const r = await fetch(`${API}/v1/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: location.pathname.replace(/^.*\/mokausi-lietuviskai/, ''), ref, text: f.text.value, hp: f.website.value }) });
        if (!r.ok) throw new Error(r.status === 429 ? 'per daug pranešimų, pabandykite vėliau' : 'HTTP ' + r.status);
        close(); toast('Ačiū! Pranešimas išsiųstas.', 'Спасибо! Сообщение отправлено.');
      } catch (err) {
        send.disabled = false;
        toast(`Nepavyko išsiųsti: ${err.message}.`, 'не удалось отправить — попробуйте ещё раз или напишите на GitHub', { alert: true });
      }
    });
    document.body.append(d);
    d.showModal();
    d.querySelector('textarea').focus();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-report]');
    if (!b) return;
    e.preventDefault();
    document.getElementById('daugiau')?.hidePopover?.();
    report(b);
  });

  // ---------- работа без интернета: service worker (корень сайта, sw.js — web.py), установка, озвучка по главам ----------
  const secure = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (SELF && secure && 'serviceWorker' in navigator) {
    const top = new URL('../', SELF);
    navigator.serviceWorker.register(new URL('sw.js', top), { scope: top.pathname, updateViaCache: 'none' }).catch(() => { /* без интернета — просто сайт */ });
  }
  let installEvt = null;                                            // Chrome/Edge/Android: «установить» — по кнопке в «Be interneto»
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
  const AUDIO_CACHE = 'mokausi-garsas';
  const mb = n => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace('.', ',')} MB`;
  const loadPacks = () => window.KONST_PACKS ? Promise.resolve(window.KONST_PACKS) : new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = new URL('data/garsas.js', SELF).href;
    s.onload = () => ok(window.KONST_PACKS || []); s.onerror = no; document.head.append(s);
  });
  const voice = () => { try { return (JSON.parse(localStorage.getItem('konst.speak.v1')) || {}).voice === 'leonas' ? 'leonas' : 'ona'; } catch { return 'ona'; } };
  const fileUrl = (h, v) => new URL(`audio/${v === 'leonas' ? 'leonas/' : ''}${h}.mp3`, SELF).href;
  async function offline(btn) {
    const d = document.createElement('dialog');
    d.className = 'confirm confirm-dlg offdlg';
    d.setAttribute('aria-labelledby', 'off-h');
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const can = secure && 'serviceWorker' in navigator && 'caches' in window;
    const ready = can && !!navigator.serviceWorker.controller;
    d.innerHTML = `<p id="off-h">Be interneto <span class="ru">без интернета</span></p>`
      + `<p class="offst ${ready ? 'ok' : ''}">${!can ? 'Šioje naršyklėje neveikia. <span class="ru">Этот браузер не умеет хранить сайт — откройте его в Chrome, Safari или Edge.</span>'
        : ready ? '✓ Puslapiai išsaugoti. <span class="ru">Слова, экзамен, чтение и памятка откроются и без интернета; прогресс — как обычно, в этом браузере.</span>'
        : 'Išsaugoma… <span class="ru">Сайт сохраняется — откройте любую страницу ещё раз при интернете, и он заработает без сети.</span>'}</p>`
      + `<div class="offinst">${standalone ? '✓ Programėlė įdiegta. <span class="ru">Сайт открывается как приложение.</span>'
        : `<b>Įdiegti telefone</b> <span class="ru">установить как приложение: значок на экране, без адресной строки — `
          + (ios ? 'в Safari нажмите «Поделиться» → «На экран „Домой“».' : 'в меню браузера ⋮ — «Установить приложение» (или «Добавить на главный экран»).') + '</span>'
          + '<button type="button" class="primary" data-install hidden>Įdiegti <span class="ru">установить</span></button>'}</div>`
      + `<p class="offh"><b>Garsas pagal skyrius</b> <span class="ru">озвучка по главам — скачайте нужные главы (голос ${voice() === 'leonas' ? 'Leonas' : 'Ona'})</span></p>`
      + '<ul class="packs"><li class="ru">…</li></ul>'
      + '<div class="confirm-btns"><button type="button" data-x>Uždaryti <span class="ru">закрыть</span></button></div>';
    const close = () => { d.close(); d.remove(); if (btn && btn.isConnected) btn.focus({ preventScroll: true }); };
    d.querySelector('[data-x]').addEventListener('click', close);
    d.addEventListener('cancel', e => { e.preventDefault(); close(); });
    const inst = d.querySelector('[data-install]');
    if (inst && installEvt) { inst.hidden = false; inst.addEventListener('click', async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; inst.hidden = true; }); }
    document.body.append(d);
    d.showModal();
    d.querySelector('[data-x]').focus();
    const list = d.querySelector('.packs');
    if (!can) { list.innerHTML = '<li class="ru">Скачать озвучку в этом браузере нельзя.</li>'; return; }
    let packs;
    try { packs = await loadPacks(); } catch { list.innerHTML = '<li class="ru">Нет связи — список глав не загрузился.</li>'; return; }
    const v = voice(), cache = await caches.open(AUDIO_CACHE);
    const have = new Set((await cache.keys()).map(r => r.url));
    const row = p => {
      const n = p.f.filter(h => have.has(fileUrl(h, v))).length, all = n === p.f.length;
      const li = document.createElement('li');
      li.innerHTML = `<span class="pn">${esc(p.lt)} <span class="ru">${esc(p.ru)} · ${p.f.length} записей · ${mb(p[v] || p.ona)}</span></span>`
        + (all ? `<span class="pok">✓ <span class="ru">скачано</span></span><button type="button" data-del>Ištrinti <span class="ru">удалить</span></button>`
          : `<button type="button" data-get>${n ? `Atsisiųsti likusius <span class="ru">докачать (${n} из ${p.f.length})</span>` : 'Atsisiųsti <span class="ru">скачать</span>'}</button>`);
      li.dataset.pack = p.id;
      li.querySelector('[data-get]')?.addEventListener('click', async e => {
        const b = e.currentTarget, todo = p.f.map(h => fileUrl(h, v)).filter(u => !have.has(u));
        b.disabled = true;
        let done = 0, failed = 0, i = 0;
        const step = async () => {
          while (i < todo.length) {
            const u = todo[i++];
            try { const r = await fetch(u); if (!r.ok) throw 0; await cache.put(u, r); have.add(u); } catch { failed++; }
            b.textContent = `${Math.round(100 * ++done / todo.length)} %`;
          }
        };
        await Promise.all([1, 2, 3, 4, 5, 6].map(step));
        if (failed) toast(`Nepavyko atsisiųsti: ${failed}.`, 'часть записей не скачалась — проверьте интернет и нажмите ещё раз', { alert: true });
        else say(`${p.lt}: atsisiųsta. Скачано.`);
        li.replaceWith(row(p));
      });
      li.querySelector('[data-del]')?.addEventListener('click', async () => {
        for (const h of p.f) { const u = fileUrl(h, v); await cache.delete(u); have.delete(u); }
        li.replaceWith(row(p));
      });
      return li;
    };
    list.replaceChildren(...packs.map(row));
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-offline]');
    if (!b) return;
    e.preventDefault();
    document.getElementById('daugiau')?.hidePopover?.();
    offline(b);
  });

  // короткая «вспышка» у отмеченного (галочка «Atlikta», глава плана); без анимации, если она отключена в системе
  const pop = node => { if (!node) return; node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop'); };
  const backupBox = () => {                                          // блок с двумя кнопками (тренажёр рисует его сам)
    const box = document.createElement('div');
    box.className = 'backup';
    box.innerHTML = '<p>Pažanga saugoma šioje naršyklėje. <span class="ru">Прогресс хранится в этом браузере. Чтобы не потерять '
      + 'его или перенести на другое устройство, сохраните его в файл (файл можно переслать себе) или включите синхронизацию '
      + 'по коду ниже.</span></p>'
      + '<div class="backup-btns"><button type="button" data-backup="save">Išsaugoti į failą <span class="ru">сохранить в файл</span></button>'
      + '<button type="button" data-backup="load">Įkelti iš failo <span class="ru">загрузить из файла</span></button></div>';
    if (window.Sync) window.Sync.mount(box);                         // и синхронизация по коду (sync.js)
    return box;
  };

  // объявления для экранного диктора: Look.say('Teisingai!') — в скрытую строку role="status" (создаётся при загрузке:
  // живая область должна существовать до первой записи). Вместо aria-live на всём экране, который перерисовывается целиком.
  let sayEl = null;
  const say = text => { if (!sayEl) return; sayEl.textContent = ''; setTimeout(() => { sayEl.textContent = text; }, 60); };
  // пара кнопок A− / A+ (экзамен рисует их сам: window.Look.zoomButtons())
  window.Look = {
    progress: { snapshot, restore },
    backupBox, say, ask, toast, pop, track, days, week, todayLine, todayHtml, dayKey, report, offline, api: API,
    icon: name => `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`,   // значки — спрайт страницы (web.py)
    iconEl(name) {
      const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use');
      s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
      u.setAttribute('href', '#i-' + name); s.append(u);
      return s;
    },
    zoomButtons() {
      const box = document.createElement('span');
      box.className = 'zoom';
      [[-1, 'A−', 'Mažesnis tekstas (меньше)'], [1, 'A+', 'Didesnis tekstas (больше)']].forEach(([s, t, l]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = t; b.dataset.zoomStep = s; b.setAttribute('aria-label', l); b.title = l;
        b.disabled = s < 0 ? zi === 0 : zi === ZOOM.length - 1;
        box.append(b);
      });
      return box;
    },
  };
  // id (html[data-look], localStorage — не менять), название, перевод, что меняется (подсказка при наведении)
  const LOOKS = [
    ['calm', 'Įprasta', 'обычный вид', ['Спокойное чтение: шрифт с засечками Literata', 'Перевод курсивом, сдержанные цвета',
      'Вид по умолчанию']],
    ['kids', 'Spalvota', 'цветной вид', ['Округлый шрифт Nunito, текст крупнее', 'Тёплый фон; у каждого раздела свой цвет — цвета флага',
      'Значок у реплики — видно, кто говорит']],
    ['contrast', 'Kontrastas', 'высокий контраст', ['Чёрное на белом (в тёмной теме — белое на чёрном)',
      'Крупный чёткий шрифт без засечек, толстые рамки', 'Подчёркнутые ссылки, жёлтая рамка фокуса']]];
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* приватный режим */ }
  root.dataset.look = LOOKS.some(([id]) => id === saved) ? saved : 'calm';

  // Русский текст — с lang="ru" (страницы — lang="lt"), чтобы экранный диктор читал его русским голосом. Помечается элемент,
  // чей собственный текст — только кириллица; смешанное «Kitas (дальше)» остаётся литовским. И то, что скрипты дорисуют позже.
  const CYR = /[А-Яа-яЁё]/, LAT = /[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]/, ABBR = /\b(A2|RU|PDF|CC BY-SA)\b/g, auto = new WeakSet();
  function markRu(top) {
    const w = document.createTreeWalker(top, NodeFilter.SHOW_TEXT), done = new Set();
    for (let n = top.nodeType === 3 ? top : w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!el || done.has(el) || el.closest('script, style')) continue;
      done.add(el);
      const own = [...el.childNodes].filter(c => c.nodeType === 3).map(c => c.nodeValue).join(' ');
      const ru = CYR.test(own) && !LAT.test(own.replace(ABBR, ''));
      if (ru && (el.closest('[lang]') || root).lang !== 'ru') { el.lang = 'ru'; auto.add(el); }
      else if (!ru && auto.has(el)) { el.removeAttribute('lang'); auto.delete(el); }   // текст сменился на литовский
    }
  }
  function mount() {
    syncZoom();
    sayEl = document.createElement('p'); sayEl.className = 'sr'; sayEl.setAttribute('role', 'status'); document.body.append(sayEl);
    markRu(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType === 1) markRu(n); else if (n.nodeType === 3 && n.parentElement) markRu(n.parentElement);
    }))).observe(document.body, { childList: true, subtree: true });
    // «Pereiti prie turinio»: первая ссылка страницы, видна только при фокусе с клавиатуры; ведёт к основной части
    const main = document.querySelector('.pane, .shell-main');
    if (main) {
      const skip = document.createElement('a');
      skip.className = 'skip'; skip.href = '#'; skip.innerHTML = 'Pereiti prie turinio <span>(к содержанию)</span>';
      skip.addEventListener('click', e => { e.preventDefault(); main.focus(); });   // без #хеша: в чтении хеш — номер рассказа
      document.body.prepend(skip);
    }
    mountSheet();
    const bar = document.querySelector('.shell-head .headbar');
    const host = bar || document.querySelector('.shell-head .top, .shell-head .wrap');
    if (!host) return;
    const wrap = document.createElement('div');           // кнопки (широкий экран) и список (телефон) — одно и то же
    wrap.className = 'look';
    const box = document.createElement('div');
    box.className = 'looksw';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Išvaizda (оформление)');
    // подсказка «что меняет вид»: при наведении мышью и при фокусе с клавиатуры; на неё можно навести, Esc закрывает
    let timer = 0;
    const show = (i, delay) => { clearTimeout(timer); timer = setTimeout(() => hints.forEach((h, j) => { h.hidden = j !== i; }), delay); };
    const hide = () => show(-1, 150);
    const hints = LOOKS.map(([id, lt, ru, more]) => {
      const h = document.createElement('div');
      h.className = 'lookhint'; h.id = 'lookhint-' + id; h.setAttribute('role', 'tooltip'); h.hidden = true;
      h.innerHTML = `<span class="lh-aa" data-s="${id}" aria-hidden="true">Aa</span><div><b>${lt}</b> <span class="lh-ru">— ${ru}</span>`
        + `<ul>${more.map(m => `<li>${m}</li>`).join('')}</ul></div>`;
      h.addEventListener('pointerenter', () => clearTimeout(timer));
      h.addEventListener('pointerleave', hide);
      return h;
    });
    const btns = LOOKS.map(([id, lt], i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = lt; b.dataset.lookSet = id; b.setAttribute('aria-describedby', 'lookhint-' + id);
      b.addEventListener('click', () => set(id));
      b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(i, hints.some(h => !h.hidden) ? 0 : 300); });
      b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
      b.addEventListener('focus', () => { if (b.matches(':focus-visible')) show(i, 0); });
      b.addEventListener('blur', hide);
      return b;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') show(-1, 0); });
    const sel = document.createElement('select');
    sel.className = 'looksel';
    sel.setAttribute('aria-label', 'Išvaizda (оформление)');
    LOOKS.forEach(([id, lt]) => sel.add(new Option(lt, id)));
    sel.addEventListener('change', () => set(sel.value));
    const sync = () => {
      btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lookSet === root.dataset.look)));
      sel.value = root.dataset.look;
    };
    function set(id) {
      root.dataset.look = id;
      try { if (id !== 'calm') localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* приватный режим */ }
      sync();
    }
    box.append(...btns);
    wrap.append(box, sel, ...hints);
    if (bar) bar.append(wrap);                          // справа в строке разделов (на телефоне — рядом с заголовком)
    else host.insertBefore(wrap, host.querySelector('h1'));
    sync();
  }
  // «Daugiau» (web.py: #daugiau, popover): на компьютере — под кнопкой «Daugiau» в строке разделов; браузер без
  // popover — открывается классом .open (Esc и нажатие мимо закрывают)
  function mountSheet() {
    const sheet = document.getElementById('daugiau');
    if (!sheet) return;
    const place = () => {
      const b = document.querySelector('.sitenav .morebtn');
      const r = b && b.offsetParent ? b.getBoundingClientRect() : null;
      if (r) { sheet.style.setProperty('--sheet-top', `${Math.round(r.bottom + 6)}px`);
               sheet.style.setProperty('--sheet-right', `${Math.max(8, Math.round(innerWidth - r.right))}px`); }
    };
    if (typeof sheet.showPopover === 'function') { sheet.addEventListener('beforetoggle', e => { if (e.newState === 'open') place(); }); return; }
    root.classList.add('no-popover');
    const open = on => { sheet.classList.toggle('open', on); document.querySelectorAll('[popovertarget="daugiau"]').forEach(b => b.setAttribute('aria-expanded', String(on))); if (on) { place(); sheet.querySelector('a, button')?.focus(); } };
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[popovertarget="daugiau"]');
      if (b) { open(b.getAttribute('popovertargetaction') === 'hide' ? false : !sheet.classList.contains('open')); return; }
      if (sheet.classList.contains('open') && !sheet.contains(e.target)) open(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open')) open(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
