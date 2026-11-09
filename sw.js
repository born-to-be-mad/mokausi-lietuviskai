// Service worker сайта «Mokausi lietuviškai» — работа без интернета. Собирает scripts/web.py (offline_files) из
// web/sw.tpl.js в web/landing/sw.js; на сайте лежит в корне (область — весь сайт: витрина и konstitucija/).
// Страницы, скрипты, стили, данные и шрифты сохраняются при первом посещении. Запросы — сначала в сеть (сайт всегда
// свежий), нет сети или она молчит дольше 4 секунд — из сохранённого. Озвучка — из своего кэша mokausi-garsas
// (пакеты по главам скачивает «Be interneto», look.js); чего нет — из сети, без сохранения. Книги (PDF) — только сеть.
// Новая версия сайта = новый VERSION (хеш файлов): браузер ставит новый worker, тот сразу включается и убирает старый кэш.
const VERSION = 'v2.0.1-0f447b48f6';
const CORE = 'mokausi-core-' + VERSION, AUDIO = 'mokausi-garsas';
const FILES = ["./", "manifest.webmanifest", "konstitucija/", "konstitucija/index.html", "konstitucija/egzaminas.html", "konstitucija/skaitymas.html", "konstitucija/tekstas.html", "konstitucija/atmintine.html", "konstitucija/naujienos.html", "konstitucija/apie-egzamina.html", "konstitucija/style.css", "konstitucija/shell.css", "konstitucija/look.css", "konstitucija/reader.css", "konstitucija/app.js", "konstitucija/exam.js", "konstitucija/look.js", "konstitucija/reader.js", "konstitucija/speak.js", "konstitucija/sync.js", "konstitucija/data/decks.js", "konstitucija/data/audio.js", "konstitucija/data/citatos.js", "konstitucija/data/garsas.js", "konstitucija/favicon.svg", "konstitucija/icons/icon-192.png", "konstitucija/icons/icon-512.png", "konstitucija/icons/maskable-512.png", "konstitucija/icons/apple-180.png", "konstitucija/fonts/Literata.woff", "konstitucija/fonts/Literata-Italic.woff", "konstitucija/fonts/Nunito.woff"];
const ROOT = new URL('./', self.location).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(FILES.map(f => new Request(ROOT + f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mokausi-core-') && k !== CORE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const fromCache = async req => (await caches.match(req, { ignoreSearch: true }))
  || (req.mode === 'navigate' ? caches.match(new URL('konstitucija/', ROOT).href) : undefined);
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || !url.href.startsWith(ROOT)) return;            // чужое (сервер синхронизации) — как есть
  if (url.pathname.endsWith('.pdf')) return;
  if (/\/audio\/.+\.mp3$/.test(url.pathname)) {                            // озвучка: скачанная — из кэша, остальное — сеть
    e.respondWith(caches.open(AUDIO).then(c => c.match(req)).then(hit => hit || fetch(req)));
    return;
  }
  e.respondWith((async () => {
    const net = fetch(req).then(async res => {
      if (res.ok && res.type === 'basic') (await caches.open(CORE)).put(req, res.clone());
      return res;
    });
    const slow = new Promise(r => setTimeout(r, 4000)).then(() => fromCache(req));
    try {
      const first = await Promise.race([net, slow]);
      return first || await net;
    } catch {
      return (await fromCache(req)) || Response.error();
    }
  })());
});
