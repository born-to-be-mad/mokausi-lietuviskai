// Синхронизация прогресса между устройствами по коду — без регистрации.
// Код (XXXX-XXXX-XXXX, 60 бит, алфавит Crockford без O/I/L/U) знает только пользователь: из него в браузере получаются
// адрес записи (SHA-256) и ключ шифрования (PBKDF2 → AES-GCM); сервер (sync/worker.js: Cloudflare Worker + D1) хранит
// только шифротекст и номер версии. Синхронизируется учёба: карточки (konst.terms.v1), попытки экзамена (konst.exam.v1),
// отметки «прочитано» (konst.reader.v1, konst.tekstas.v1); вид, голос, размер текста — у каждого устройства свои.
// Слияние: у карточки и отметки побеждает более свежая (t / dt), попытки экзамена объединяются, сброс (_reset) стирает
// всё, что старше него. Когда: при открытии страницы (пришло новое — страница один раз перезагружается), раз в минуту,
// если что-то изменилось, и при уходе со страницы. Блок управления — в «Pažanga» (главная, тренажёр).
// Ссылка …/mokausi-lietuviskai/#sinchronizuoti=КОД включает синхронизацию на другом устройстве.
(() => {
  'use strict';
  const API = (() => { try { return localStorage.getItem('mokausi.sync.api'); } catch { return null; } })()   // проверка
    || 'https://mokausi-sync.d-marudau.workers.dev';               // адрес Worker'а (scripts/deploy_sync.sh)
  const CFG = 'konst.sync', SITE = 'https://born-to-be-mad.github.io/mokausi-lietuviskai/';
  const READERS = ['konst.reader.v1', 'konst.tekstas.v1'];
  const ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
  const cfg = () => read(CFG) || {};

  // ---------- код ----------
  const norm = c => String(c || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
  const valid = c => norm(c).length === 12 && [...norm(c)].every(ch => ABC.includes(ch));
  const pretty = c => norm(c).match(/.{4}/g).join('-');
  const newCode = () => pretty([...crypto.getRandomValues(new Uint8Array(12))].map(b => ABC[b & 31]).join(''));

  // ---------- шифрование ----------
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  async function keys(code) {
    const c = norm(code);
    const id = hex(await crypto.subtle.digest('SHA-256', enc.encode('mokausi-lietuviskai/id/' + c)));
    const base = await crypto.subtle.importKey('raw', enc.encode(c), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('mokausi-lietuviskai/key/v1'), iterations: 200000,
      hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { id, key };
  }
  async function seal(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return { iv: b64(iv), data: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))) };
  }
  const open = async (key, rec) => dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.data)));

  // ---------- документ прогресса и слияние ----------
  function localDoc() {
    const d = { v: 1, terms: read('konst.terms.v1') || {}, exam: read('konst.exam.v1') || [], examq: read('konst.examq.v1') || {},
                marks: {} };
    for (const k of READERS) { const s = read(k) || {}; d.marks[k] = { done: s.done || {}, dt: s.dt || {} }; }
    return d;
  }
  function applyDoc(d) {
    write('konst.terms.v1', d.terms);
    write('konst.exam.v1', d.exam);
    write('konst.examq.v1', d.examq || {});
    for (const k of READERS) {                                     // в чтении — только отметки, остальное (перевод, место) своё
      const s = read(k) || {}, m = d.marks[k] || { done: {}, dt: {} };
      s.done = m.done; s.dt = m.dt; write(k, s);
    }
  }
  function mergeTerms(a = {}, b = {}) {                            // и журнал экзамена по вопросам — те же записи с t
    const reset = Math.max(a._reset || 0, b._reset || 0), out = reset ? { _reset: reset } : {};
    const score = r => r ? [r.t || 0, (r.right || 0) + (r.wrong || 0)] : [-1, -1];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (k === '_reset') continue;
      const [sa, sb] = [score(a[k]), score(b[k])];
      const win = sa[0] > sb[0] || (sa[0] === sb[0] && sa[1] >= sb[1]) ? a[k] : b[k];
      if (win && (!reset || (win.t || 0) > reset)) out[k] = win;   // сброшенное на любом устройстве — не возвращаем
    }
    return out;
  }
  function mergeExam(a = [], b = []) {
    const seen = new Map();
    for (const e of [...a, ...b]) seen.set(`${e.d}|${e.mode}|${e.right}|${e.secs}`, e);
    return [...seen.values()].sort((x, y) => (x.d < y.d ? 1 : x.d > y.d ? -1 : 0)).slice(0, 20);
  }
  function mergeMarks(a = {}, b = {}) {
    const done = {}, dt = {}, ad = a.done || {}, bd = b.done || {}, at = a.dt || {}, bt = b.dt || {};
    for (const id of new Set([...Object.keys(ad), ...Object.keys(bd), ...Object.keys(at), ...Object.keys(bt)])) {
      const ta = at[id] || 0, tb = bt[id] || 0;
      const v = ta === tb ? !!(ad[id] || bd[id]) : ta > tb ? !!ad[id] : !!bd[id];
      if (v) done[id] = true;
      if (Math.max(ta, tb)) dt[id] = Math.max(ta, tb);
    }
    return { done, dt };
  }
  function merge(a, b) {
    const marks = {};
    for (const k of READERS) marks[k] = mergeMarks((a.marks || {})[k], (b.marks || {})[k]);
    return { v: 1, terms: mergeTerms(a.terms, b.terms), exam: mergeExam(a.exam, b.exam), examq: mergeTerms(a.examq, b.examq), marks };
  }
  const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'      // JSON с ключами по алфавиту — для сравнения
    : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
    : JSON.stringify(v);
  const digest = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

  // ---------- синхронизация ----------
  let busy = false, notice = '';                                  // notice — сообщение после отключения
  async function sync({ reload = false } = {}) {
    const c = cfg();
    if (!c.code || busy) return;
    busy = true;
    try {
      const { id, key } = await keys(c.code), url = `${API}/v1/sync/${id}`;
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.status !== 200 && r.status !== 404) throw new Error('HTTP ' + r.status);
        const rec = r.status === 200 ? await r.json() : null;
        const remote = rec ? JSON.parse(await open(key, rec)) : null;
        if (remote && remote.retired) {                              // на другом устройстве нажали «удалить с сервера»
          notice = 'Sinchronizavimas išjungtas kitame įrenginyje <span class="ru">— синхронизацию отключили на другом устройстве; прогресс здесь остался</span>';
          disable(); return;
        }
        const local = localDoc(), merged = remote ? merge(local, remote) : local;
        const lj = canon(local), mj = canon(merged), changed = mj !== lj;
        if (changed) applyDoc(merged);                             // пришло новое с другого устройства
        let v = rec ? rec.v : 0;
        if (!remote || mj !== canon(remote)) {                     // на сервере не то, что у нас, — записать
          const p = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prev: v, ...(await seal(key, mj)) }) });
          if (p.status === 409) continue;                          // другое устройство успело раньше — забрать и снова
          if (!p.ok) throw new Error('HTTP ' + p.status);
          v = (await p.json()).v;
        }
        write(CFG, Object.assign(cfg(), { v, at: Date.now(), h: await digest(mj), err: '' }));
        render();
        if (changed && reload) location.reload();                  // показать пришедший прогресс (один раз: дальше совпадает)
        return;
      }
      throw new Error('conflict');
    } catch (e) {
      write(CFG, Object.assign(cfg(), { err: String(e && e.message || e) }));
      render();
    } finally { busy = false; }
  }
  async function changedSince() {                                  // изменилось ли что-то с последней синхронизации
    const c = cfg();
    return c.code && c.h !== await digest(canon(localDoc()));
  }
  async function enable(code) {
    notice = '';
    write(CFG, { code: pretty(code) });
    await sync({ reload: true });
    render();
  }
  function disable() { try { localStorage.removeItem(CFG); } catch { /* приватный режим */ } render(); }
  async function forget() {                                        // вместо прогресса — пометка «отключено» для других устройств
    const c = cfg();
    if (!c.code) return;
    const { id, key } = await keys(c.code), url = `${API}/v1/sync/${id}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.status !== 200 && r.status !== 404) throw new Error('HTTP ' + r.status);
      const v = r.status === 200 ? (await r.json()).v : 0;
      const p = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prev: v, ...(await seal(key, canon({ v: 1, retired: true }))) }) });
      if (p.status === 409) continue;
      if (!p.ok) throw new Error('HTTP ' + p.status);
      notice = 'Pažanga ištrinta iš serverio <span class="ru">— прогресс удалён с сервера, синхронизация отключена на всех устройствах</span>';
      return disable();
    }
    throw new Error('conflict');
  }

  // ---------- блок в «Pažanga» ----------
  const T = (lt, ru) => `${lt} <span class="ru">${ru}</span>`;
  const link = code => `${SITE}#sinchronizuoti=${pretty(code)}`;
  function html() {
    const c = cfg();
    if (!c.code) return (notice ? `<p class="syncstate">${notice}</p>` : '') + `<p class="synchead">${T('Sinchronizavimas', '— синхронизация между устройствами')}</p>
      <p class="ru">Один код — и прогресс (карточки, экзамены, отметки «прочитано») общий на телефоне и компьютере, без
        регистрации. На сервере он хранится зашифрованным: прочитать его можно только с этим кодом.</p>
      <div class="backup-btns"><button type="button" data-sync="new">${T('Įjungti', 'включить — получить код')}</button>
        <button type="button" data-sync="enter">${T('Turiu kodą', 'у меня уже есть код')}</button></div>
      <form class="syncform" hidden><label>${T('Kodas', 'код')} <input name="code" autocomplete="off" autocapitalize="characters"
        spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="16"></label>
        <button type="submit">${T('Prisijungti', 'подключить')}</button></form>`;
    const when = c.at ? new Date(c.at).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    return `<p class="synchead">${T('Sinchronizavimas įjungtas', '— синхронизация включена')}</p>
      <p>${T('Kodas', 'код')}: <code class="synccode">${c.code}</code></p>
      <p class="ru">Запишите код или отправьте себе ссылку: откройте её на другом устройстве — и прогресс станет общим.</p>
      <p class="syncstate">${c.err ? T('Nepavyko', `не удалось (${c.err}) — попробуем позже`) : T('Sinchronizuota', 'синхронизировано') + ' ' + when}</p>
      <div class="backup-btns"><button type="button" data-sync="copy">${T('Kopijuoti nuorodą', 'скопировать ссылку')}</button>
        <button type="button" data-sync="now">${T('Sinchronizuoti dabar', 'синхронизировать сейчас')}</button>
        <button type="button" data-sync="off">${T('Išjungti šiame įrenginyje', 'отключить на этом устройстве')}</button>
        <button type="button" data-sync="forget">${T('Ištrinti iš serverio', 'удалить с сервера')}</button></div>`;
  }
  function render() { document.querySelectorAll('.syncbox').forEach(b => { b.innerHTML = html(); }); }
  function mount(host) {                                           // добавить блок в «Pažanga»
    if (!host || host.querySelector('.syncbox')) return;
    const box = document.createElement('div');
    box.className = 'syncbox';
    host.append(box);
    box.innerHTML = html();
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-sync]');
    if (!b) return;
    const box = b.closest('.syncbox'), act = b.dataset.sync;
    if (act === 'new') return enable(newCode());
    if (act === 'enter') { const f = box.querySelector('.syncform'); f.hidden = false; f.code.focus(); return; }
    if (act === 'now') return sync({ reload: true });
    if (act === 'copy') {
      const l = link(cfg().code);
      try { await navigator.clipboard.writeText(l); b.firstChild.textContent = 'Nukopijuota '; }
      catch { prompt('Nuoroda (ссылка):', l); }
      return;
    }
    if (act === 'off' && confirm('Išjungti sinchronizavimą šiame įrenginyje? Pažanga čia liks.\n(Отключить синхронизацию на этом устройстве? Прогресс здесь останется.)')) return disable();
    if (act === 'forget' && confirm('Ištrinti pažangą iš serverio ir išjungti sinchronizavimą visuose įrenginiuose? Pačiuose įrenginiuose pažanga liks.\n'
      + '(Удалить прогресс с сервера и отключить синхронизацию на всех устройствах? На самих устройствах прогресс останется.)')) {
      try { await forget(); } catch (err) { alert('Nepavyko (не удалось): ' + err.message); }
    }
  });
  document.addEventListener('submit', e => {
    if (!e.target.classList.contains('syncform')) return;
    e.preventDefault();
    const code = e.target.code.value;
    if (!valid(code)) { alert('Neteisingas kodas: 12 raidžių ir skaičių, pvz. KX7Q-M2PF-9TRA.\n(Неверный код: 12 букв и цифр.)'); return; }
    enable(code);
  });

  // ---------- когда синхронизировать ----------
  function fromLink() {                                            // …#sinchronizuoti=КОД (витрина)
    const m = location.hash.match(/^#sinchronizuoti=([0-9A-Za-z-]+)$/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search);
    if (!valid(m[1])) { alert('Neteisingas sinchronizavimo kodas (неверный код синхронизации).'); return false; }
    if (cfg().code && norm(cfg().code) === norm(m[1])) return false;
    if (confirm(`Įjungti sinchronizavimą šiame įrenginyje su kodu ${pretty(m[1])}?\n(Включить синхронизацию на этом устройстве? `
      + 'Прогресс отсюда и с других устройств с этим кодом объединится.)')) { enable(m[1]); return true; }
    return false;
  }
  function start() {
    document.querySelectorAll('.backup').forEach(mount);
    if (!fromLink() && cfg().code) sync({ reload: true });
    setInterval(async () => { if (document.visibilityState === 'visible' && await changedSince()) sync(); }, 60000);
    document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'hidden' && await changedSince()) sync(); });
  }
  window.Sync = { mount, merge, newCode, valid, sync };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
