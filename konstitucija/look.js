// Вид сайта: «Įprasta» (по умолчанию), «Vaikams» (для детей) или «Kontrastas» (высокий контраст) — html[data-look],
// стили в look.css. Подключается в <head> без defer: вид применяется до отрисовки, без мигания. Переключатель — в шапке,
// справа от заголовка (на телефоне — выпадающий список); выбор хранится в localStorage этого браузера (общий для
// витрины и всех страниц раздела).
(() => {
  'use strict';
  const KEY = 'konst.look', root = document.documentElement;
  const LOOKS = [['calm', 'Įprasta', 'обычный вид'], ['kids', 'Vaikams', 'для детей: крупнее и ярче'],
                 ['contrast', 'Kontrastas', 'высокий контраст: крупнее, чётче, толстые рамки']];
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* приватный режим */ }
  root.dataset.look = LOOKS.some(([id]) => id === saved) ? saved : 'calm';

  function mount() {
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
