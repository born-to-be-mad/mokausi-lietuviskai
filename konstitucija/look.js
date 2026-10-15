// Вид сайта: «Įprasta» (по умолчанию) или «Vaikams» (для детей) — html[data-look], стили в look.css.
// Подключается в <head> без defer: вид применяется до отрисовки, без мигания. Переключатель — в шапке, справа от заголовка;
// выбор хранится в localStorage этого браузера (общий для витрины и всех страниц раздела).
(() => {
  'use strict';
  const KEY = 'konst.look', root = document.documentElement;
  const LOOKS = [['calm', 'Įprasta', 'обычный вид'], ['kids', 'Vaikams', 'для детей: крупнее и ярче']];
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* приватный режим */ }
  root.dataset.look = saved === 'kids' ? 'kids' : 'calm';

  function mount() {
    const host = document.querySelector('.shell-head .top, .shell-head .wrap');
    if (!host) return;
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
    const sync = () => btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lookSet === root.dataset.look)));
    function set(id) {
      root.dataset.look = id;
      try { if (id === 'kids') localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* приватный режим */ }
      sync();
    }
    box.append(...btns);
    host.insertBefore(box, host.querySelector('h1'));   // справа, на строке заголовка
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
