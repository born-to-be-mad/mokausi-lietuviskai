// Чтение «Arbatos vakarai su Konstitucija»: слева оглавление, справа одна страница (#apie — «как читать», #sN — рассказ;
// стрелки ← → листают, на узком экране оглавление — по кнопке «☰ Turinys»). Перевод вкл./выкл. (клавиша T; выключен —
// перевод предложения по нажатию на него), при включённом — рядом или под строкой; размер шрифта, отметки «прочитано»
// и место, где остановился. Всё — в localStorage этого браузера; без JS страница читается как есть (все рассказы подряд).
(() => {
  'use strict';
  const KEY = document.body.dataset.store || 'konst.reader.v1';    // своё хранилище у каждой страницы чтения
  const LISTEN = ' Klausyti viską (' + (document.body.dataset.listen || 'слушать весь рассказ') + ')';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const st = Object.assign({ on: true, layout: 'side', size: 0, done: {}, last: '' }, load());
  if (st.tr) { st.on = st.tr !== 'tap'; if (st.tr !== 'tap') st.layout = st.tr; delete st.tr; }   // прежний формат
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* приватный режим */ } };
  const $$ = sel => [...document.querySelectorAll(sel)];
  const pages = $$('section.page'), stories = $$('section.story');
  const pane = document.querySelector('.pane'), toc = document.getElementById('turinys'), navbtn = document.getElementById('navbtn');
  const TITLE = document.title;

  function applyTr() {
    const b = document.body.classList;
    b.toggle('tr-on', st.on); b.toggle('tr-off', !st.on);
    b.toggle('tr-side', st.layout === 'side'); b.toggle('tr-under', st.layout === 'under');
    document.getElementById('tr').checked = st.on;                // флажок-переключатель (role="switch")
    $$('[data-layout]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.layout === st.layout)));
    $$('.row').forEach(r => {
      r.classList.remove('show');
      if (!st.on) { r.tabIndex = 0; r.setAttribute('role', 'button'); r.title = 'Rodyti vertimą (показать перевод)'; }
      else { r.removeAttribute('tabindex'); r.removeAttribute('role'); r.removeAttribute('title'); }
    });
  }
  const toggleTr = () => { st.on = !st.on; save(); applyTr(); };
  st.size = Math.max(-2, Math.min(3, st.size));     // прежде шкала была -1..4 от 17px, теперь -2..3 от 19px
  const applySize = () => document.documentElement.style.setProperty('--fs', (19 + 2 * st.size) + 'px');
  function applyDone() {
    $$('a[data-story]').forEach(a => a.classList.toggle('isdone', !!st.done[a.dataset.story]));
    $$('.done input[data-story]').forEach(c => {                 // флажок «Perskaičiau»
      c.checked = !!st.done[c.dataset.story];
      c.closest('.done').classList.toggle('isdone', c.checked);
    });
    const n = stories.filter(s => st.done[s.id]).length;
    document.getElementById('count').textContent = `perskaityta (прочитано): ${n} / ${stories.length}`;
    // у каждого сборника в оглавлении — сколько прочитано: полоска и «n / m»
    $$('.toc li.col[data-col]').forEach(li => {
      const own = stories.filter(s => s.dataset.col === li.dataset.col), k = own.filter(s => st.done[s.id]).length;
      let p = li.querySelector('.cprog');
      if (!p) {
        p = document.createElement('span'); p.className = 'cprog';
        const bar = document.createElement('span'); bar.className = 'cbar'; bar.append(document.createElement('span'));
        const num = document.createElement('span'); num.className = 'cnum';
        p.append(bar, num); li.append(p);
      }
      p.title = `Perskaityta (прочитано): ${k} / ${own.length}`;
      p.querySelector('.cbar > span').style.width = (own.length ? 100 * k / own.length : 0) + '%';
      p.querySelector('.cnum').textContent = `${k} / ${own.length}`;
    });
  }

  document.getElementById('tr').addEventListener('change', e => { st.on = e.target.checked; save(); applyTr(); });
  $$('[data-layout]').forEach(b => b.addEventListener('click', () => { st.layout = b.dataset.layout; save(); applyTr(); }));
  $$('[data-size]').forEach(b => b.addEventListener('click', () => {
    st.size = Math.max(-2, Math.min(3, st.size + Number(b.dataset.size))); save(); applySize();
  }));
  $$('.done input[data-story]').forEach(c => c.addEventListener('change', () => {
    st.done[c.dataset.story] = c.checked; save(); applyDone();
  }));
  // перевод выключен: щелчок / Enter по предложению показывает (и снова прячет) его перевод
  document.addEventListener('click', e => {
    if (st.on) return;
    const r = e.target.closest('.row');
    if (r) r.classList.toggle('show');
  });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') return setNav(false);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 't' || e.key === 'T') { toggleTr(); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && cur && !e.shiftKey) {   // листать рассказы
      const to = pages[pages.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : -1)];
      if (to) { e.preventDefault(); location.hash = to.id; }
      return;
    }
    if (!st.on && (e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('row')) {
      e.preventDefault(); e.target.classList.toggle('show');
    }
  });

  // ---------- одна страница справа: #apie / #sN; без адреса — где остановились (st.last), иначе вступление ----------
  let cur = null;
  function setNav(open) {                              // узкий экран: оглавление поверх текста
    document.body.classList.toggle('nav-open', open);
    navbtn.setAttribute('aria-expanded', String(open));
    if (open) { const a = toc.querySelector('[aria-current]'); if (a) a.scrollIntoView({ block: 'center' }); }
  }
  function show(id) {
    const page = pages.find(x => x.id === id) || pages[0];
    if (page !== cur) {
      stopPlay();
      pages.forEach(x => x.classList.toggle('current', x === page));
      $$('a[data-story]').forEach(a => a.dataset.story === page.id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
      cur = page; st.last = page.id; save();
      pane.scrollTo({ top: 0, behavior: 'instant' });
      document.title = page.dataset.title + ' – ' + TITLE;
    }
    setNav(false);
    const a = toc.querySelector('[aria-current]');
    if (a) a.scrollIntoView({ block: 'nearest' });
  }
  function route() {
    const id = location.hash.slice(1);
    if (id === 'turinys') {                            // «Turinys» внизу рассказа: открыть оглавление, адрес — прежний
      if (!cur) show(st.last);
      history.replaceState(null, '', '#' + cur.id);
      return setNav(true);
    }
    const inner = id && !pages.some(x => x.id === id) && document.getElementById(id);   // #str12: статья внутри главы
    const host = inner && inner.closest('section.page');
    if (host) {
      show(host.id);
      const to = () => inner.scrollIntoView({ block: 'start', behavior: 'instant' });   // плавную прокрутку прерывают — прыжок
      to();                                                      // шрифты догружаются (Nunito — позже) — текст сдвигается:
      if (document.fonts) { document.fonts.ready.then(to); document.fonts.addEventListener('loadingdone', to, { once: true }); }
      if (document.readyState !== 'complete') addEventListener('load', to, { once: true });
      return;
    }
    show(pages.some(x => x.id === id) ? id : (pages.some(x => x.id === st.last) ? st.last : 'apie'));
  }
  addEventListener('hashchange', route);
  navbtn.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
  document.getElementById('navclose').addEventListener('click', () => setNav(false));
  toc.addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });   // и тот же рассказ — закрыть
  // ---------- произношение (speak.js): кнопка у каждого предложения, «слушать весь рассказ» ----------
  const S = window.Speak;
  let playing = null;                                  // {story, rows, i, btn}
  function stopPlay() {
    if (!playing) return;
    playing.rows.forEach(r => r.classList.remove('speaking'));
    playing.btn.classList.remove('on'); playing.btn.lastChild.textContent = LISTEN;
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
    const bar = document.querySelector('.toolbar').getBoundingClientRect(), view = pane.getBoundingClientRect();
    if (r.top < bar.bottom || r.bottom > view.bottom) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    S.say(row.querySelector('.lt').textContent, { onend: () => { if (playing === p) playNext(); } });
  }
  if (S) S.onReady(ok => {
    document.getElementById(ok ? 'slow' : 'novoice').hidden = false;
    if (!ok) return;
    const slow = document.getElementById('slow');
    slow.setAttribute('aria-pressed', String(S.rate === 0.7));
    slow.addEventListener('click', () => { S.rate = S.rate === 0.7 ? 0.9 : 0.7; slow.setAttribute('aria-pressed', String(S.rate === 0.7)); });
    const pick = S.voiceSelect({ short: true });                    // голос: Ona / Leonas (если записаны оба)
    if (pick) { const c = document.getElementById('voicePick'); c.append(pick); c.hidden = false; }
    $$('.row').forEach(row => {
      const lt = row.querySelector('.lt');
      lt.prepend(S.button(() => { stopPlay(); return lt.textContent; }));
    });
    stories.forEach(st => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'listen';
      btn.append(S.icon(), document.createTextNode(LISTEN));
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

  applyTr(); applySize(); applyDone(); route();
})();
