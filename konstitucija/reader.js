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
  // ---------- произношение (speak.js): кнопка у каждого предложения, «слушать весь рассказ» ----------
  const S = window.Speak;
  let playing = null;                                  // {story, rows, i, btn}
  function stopPlay() {
    if (!playing) return;
    playing.rows.forEach(r => r.classList.remove('speaking'));
    playing.btn.classList.remove('on'); playing.btn.lastChild.textContent = ' Klausyti viską (слушать весь рассказ)';
    playing = null; S.stop();
  }
  function playNext() {
    if (!playing) return;
    const p = playing;
    p.rows.forEach(r => r.classList.remove('speaking'));
    if (p.i >= p.rows.length) return stopPlay();
    const row = p.rows[p.i++];
    row.classList.add('speaking');
    const r = row.getBoundingClientRect();
    const bar = document.querySelector('.toolbar').getBoundingClientRect(), view = row.closest('.shell-main').getBoundingClientRect();
    if (r.top < bar.bottom || r.bottom > view.bottom) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    S.say(row.querySelector('.lt').textContent, { onend: () => { if (playing === p) playNext(); } });
  }
  if (S) S.onReady(ok => {
    document.getElementById(ok ? 'slow' : 'novoice').hidden = false;
    if (!ok) return;
    const slow = document.getElementById('slow');
    slow.setAttribute('aria-pressed', String(S.rate === 0.7));
    slow.addEventListener('click', () => { S.rate = S.rate === 0.7 ? 0.9 : 0.7; slow.setAttribute('aria-pressed', String(S.rate === 0.7)); });
    $$('.row').forEach(row => {
      const lt = row.querySelector('.lt');
      lt.prepend(S.button(() => { stopPlay(); return lt.textContent; }));
    });
    stories.forEach(st => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'listen';
      btn.append(S.icon(), document.createTextNode(' Klausyti viską (слушать весь рассказ)'));
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (playing && playing.story === st) return stopPlay();
        stopPlay();
        playing = { story: st, rows: [...st.querySelectorAll('.row')], i: 0, btn };
        btn.classList.add('on'); btn.lastChild.textContent = ' Sustabdyti (остановить)';
        playNext();
      });
      st.querySelector('h2').after(btn);
    });
  });

  applyTr(); applySize(); applyDone();
})();
