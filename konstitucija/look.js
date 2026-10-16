// Вид сайта: «Įprasta» (по умолчанию), «Vaikams» (для детей) или «Kontrastas» (высокий контраст) — html[data-look],
// стили в look.css. Подключается в <head> без defer: вид применяется до отрисовки, без мигания. Переключатель — в шапке,
// справа от заголовка (на телефоне — выпадающий список); выбор хранится в localStorage этого браузера (общий для
// витрины и всех страниц раздела). Здесь же — ссылка «Pereiti prie turinio» для клавиатуры (первая в странице) и размер
// текста A− / A+ для страниц, подключивших скрипт с data-zoom (тренажёр, экзамен): html --zoom, localStorage konst.zoom.
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
  // пара кнопок A− / A+ (экзамен рисует их сам: window.Look.zoomButtons())
  window.Look = {
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
  const LOOKS = [['calm', 'Įprasta', 'обычный вид'], ['kids', 'Vaikams', 'для детей: крупнее и ярче'],
                 ['contrast', 'Kontrastas', 'высокий контраст: крупнее, чётче, толстые рамки']];
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
    const btns = LOOKS.map(([id, lt, ru]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = lt; b.title = `${lt} (${ru})`; b.dataset.lookSet = id;
      b.addEventListener('click', () => set(id));
      return b;
    });
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
    wrap.append(box, sel);
    host.insertBefore(wrap, host.querySelector('h1'));  // справа, на строке заголовка
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
