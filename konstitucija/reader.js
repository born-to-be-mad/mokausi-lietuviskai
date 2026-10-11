// Чтение «Arbatos vakarai su Konstitucija»: перевод вкл./выкл. (клавиша T; выключен — перевод предложения
// по нажатию на него), при включённом — рядом или под строкой; размер шрифта,
// отметки «прочитано» и место, где остановился. Всё — в localStorage этого браузера; без JS страница читается как есть.
(() => {
  'use strict';
  const KEY = 'konst.reader.v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const st = Object.assign({ on: true, layout: 'side', size: 0, done: {}, last: '' }, load());
  if (st.tr) { st.on = st.tr !== 'tap'; if (st.tr !== 'tap') st.layout = st.tr; delete st.tr; }   // прежний формат
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* приватный режим */ } };
  const $$ = sel => [...document.querySelectorAll(sel)];
  const stories = $$('section.story');

  function applyTr() {
    const b = document.body.classList;
    b.toggle('tr-on', st.on); b.toggle('tr-off', !st.on);
    b.toggle('tr-side', st.layout === 'side'); b.toggle('tr-under', st.layout === 'under');
    document.getElementById('tr').setAttribute('aria-pressed', String(st.on));
    $$('[data-layout]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.layout === st.layout)));
    $$('.row').forEach(r => {
      r.classList.remove('show');
      if (!st.on) { r.tabIndex = 0; r.setAttribute('role', 'button'); r.title = 'Rodyti vertimą (показать перевод)'; }
      else { r.removeAttribute('tabindex'); r.removeAttribute('role'); r.removeAttribute('title'); }
    });
  }
  const toggleTr = () => { st.on = !st.on; save(); applyTr(); };
  const applySize = () => document.documentElement.style.setProperty('--fs', (17 + 2 * st.size) + 'px');
  function applyDone() {
    $$('a[data-story]').forEach(a => a.classList.toggle('isdone', !!st.done[a.dataset.story]));
    $$('button.done').forEach(b => {
      const d = !!st.done[b.dataset.story];
      b.classList.toggle('isdone', d);
      b.firstChild.textContent = d ? '✓ Perskaityta ' : 'Perskaičiau ';
    });
    const n = stories.filter(s => st.done[s.id]).length;
    document.getElementById('count').textContent = `· perskaityta (прочитано): ${n} / ${stories.length}`;
  }

  document.getElementById('tr').addEventListener('click', toggleTr);
  $$('[data-layout]').forEach(b => b.addEventListener('click', () => { st.layout = b.dataset.layout; save(); applyTr(); }));
  $$('[data-size]').forEach(b => b.addEventListener('click', () => {
    st.size = Math.max(-1, Math.min(4, st.size + Number(b.dataset.size))); save(); applySize();
  }));
  $$('button.done').forEach(b => b.addEventListener('click', () => {
    st.done[b.dataset.story] = !st.done[b.dataset.story]; save(); applyDone();
  }));
  // перевод выключен: щелчок / Enter по предложению показывает (и снова прячет) его перевод
  document.addEventListener('click', e => {
    if (st.on) return;
    const r = e.target.closest('.row');
    if (r) r.classList.toggle('show');
  });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === 't' || e.key === 'T') && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { toggleTr(); return; }
    if (!st.on && (e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('row')) {
      e.preventDefault(); e.target.classList.toggle('show');
    }
  });

  // место чтения: рассказ, чей заголовок последним прошёл верхнюю треть экрана
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { st.last = en.target.closest('section').id; save(); }
    }, { rootMargin: '0px 0px -70% 0px' });
    stories.forEach(s => io.observe(s.querySelector('h2')));
  }
  const last = stories.find(s => s.id === st.last);
  if (last && last !== stories[0] && !location.hash) {
    const box = document.getElementById('resume');
    const a = document.createElement('a');
    a.href = '#' + last.id; a.textContent = last.dataset.title;
    box.append('Tęsti skaitymą (продолжить чтение): ', a);
    box.hidden = false;
  }
  applyTr(); applySize(); applyDone();
})();
