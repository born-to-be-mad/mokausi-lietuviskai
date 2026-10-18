// Вид сайта: «Įprasta» (по умолчанию), «Spalvota» (цветной; id kids) или «Kontrastas» (высокий контраст) — html[data-look],
// стили в look.css. Подключается в <head> без defer: вид применяется до отрисовки, без мигания. Переключатель — в шапке,
// справа от заголовка (на телефоне — выпадающий список; у кнопок — подсказка при наведении); выбор хранится в localStorage этого браузера (общий для
// витрины и всех страниц раздела). Здесь же — ссылка «Pereiti prie turinio» для клавиатуры (первая в странице) и размер
// текста A− / A+ для страниц, подключивших скрипт с data-zoom (тренажёр, экзамен): html --zoom, localStorage konst.zoom.
// И резервная копия прогресса: кнопки [data-backup="save" | "load"] — файл со всеми записями konst.* этого браузера
// (тренажёр, экзамен, чтение, настройки); загрузка из файла заменяет их на этом устройстве (без сервера и регистрации).
(() => {
  'use strict';
  const KEY = 'konst.look', root = document.documentElement;
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' }));
    a.download = `mokausi-lietuviskai-pazanga-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function loadFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      let obj;
      try { obj = JSON.parse(await f.text()); if (obj.app !== APP || obj.kind !== 'progress') throw 0; }
      catch { alert('Tai ne pažangos failas.\n(Это не файл прогресса «Mokausi lietuviškai».)'); return; }
      const when = obj.saved ? new Date(obj.saved).toLocaleDateString('lt-LT') : '?';
      if (!confirm(`Pakeisti pažangą šiame įrenginyje failo pažanga (${when})?\n`
        + '(Заменить прогресс на этом устройстве прогрессом из файла? Текущий прогресс здесь будет заменён.)')) return;
      try { restore(obj); } catch { alert('Nepavyko įkelti (не удалось загрузить).'); return; }
      location.reload();
    });
    inp.click();
  }
  document.addEventListener('click', e => {                         // кнопки «сохранить / загрузить» где угодно
    const b = e.target.closest && e.target.closest('[data-backup]');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.backup === 'save') saveFile(); else loadFile();
  });
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

  // пара кнопок A− / A+ (экзамен рисует их сам: window.Look.zoomButtons())
  window.Look = {
    progress: { snapshot, restore },
    backupBox,
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
    ['kids', 'Spalvota', 'цветной вид', ['Округлый шрифт Nunito, текст крупнее', 'Мягкие цвета, у каждого сборника — свой',
      'Значок у реплики — видно, кто говорит']],
    ['contrast', 'Kontrastas', 'высокий контраст', ['Чёрное на белом (в тёмной теме — белое на чёрном)',
      'Крупный чёткий шрифт без засечек, толстые рамки', 'Подчёркнутые ссылки, жёлтая рамка фокуса']]];
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* приватный режим */ }
  root.dataset.look = LOOKS.some(([id]) => id === saved) ? saved : 'calm';

  function mount() {
    syncZoom();
    // «Pereiti prie turinio»: первая ссылка страницы, видна только при фокусе с клавиатуры; ведёт к основной части
    const main = document.querySelector('.pane, .shell-main');
    if (main) {
      const skip = document.createElement('a');
      skip.className = 'skip'; skip.href = '#'; skip.textContent = 'Pereiti prie turinio (к содержанию)';
      skip.addEventListener('click', e => { e.preventDefault(); main.focus(); });   // без #хеша: в чтении хеш — номер рассказа
      document.body.prepend(skip);
    }
    const host = document.querySelector('.shell-head .top, .shell-head .wrap');
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
    host.insertBefore(wrap, host.querySelector('h1'));  // справа, на строке заголовка
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
