/* 꾸미 사진첩 — 화면을 기기에 저장해 두는 도우미(서비스 워커)
 *
 * 하는 일: 사진첩 화면(index.html)과 홈 화면 그림을 기기에 저장해 두었다가,
 *          인터넷이 없거나 느릴 때 저장해 둔 화면으로 엽니다.
 * 안 하는 일: 사진·영상·로그인 정보·서버와 주고받는 내용은 건드리지 않습니다.
 *             (사진은 화면이 따로 기기 안 보관함에 넣어 둡니다.)
 * 새 화면이 올라오면: 열 때마다 새 화면을 먼저 받아 보고(3초까지 기다림), 받았으면 그것으로 엽니다.
 */
const VERSION = 1;
const SCOPE = new URL(self.registration.scope);             // 예: https://…/kkumi/  또는  https://…/kkumi/next/
const SHELL = SCOPE.href;
const EXTRA = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].map(n => new URL(n, SCOPE).href);
const CACHE = 'kkumi-shell-' + VERSION + '|' + SCOPE.pathname;
const WAIT = 3000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([SHELL, ...EXTRA].map(u => fetch(u, { cache: 'no-store' }).then(r => (r.ok ? cache.put(u, r) : null)).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('kkumi-shell-') && k.endsWith('|' + SCOPE.pathname) && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

/** 화면: 새것을 먼저 받아 보고, 늦거나 못 받으면 저장해 둔 것으로. */
function shell(e) {
  const opened = caches.open(CACHE);
  const saved = opened.then(c => c.match(SHELL));
  const fresh = fetch(SHELL, { cache: 'no-store' }).then(async r => {
    if (r.ok && r.type === 'basic' && !r.redirected) { (await opened).put(SHELL, r.clone()); return r; }
    return (await saved) || r;
  });
  e.waitUntil(fresh.catch(() => {}));                       // 늦게 도착해도 다음을 위해 저장해 둡니다
  return saved.then(old => {
    if (!old) return fresh;                                 // 저장해 둔 것이 없으면(처음) 그냥 받아 옵니다
    let timer;
    const late = new Promise(res => { timer = setTimeout(() => res(old.clone()), WAIT); });
    return Promise.race([fresh.catch(() => old.clone()), late]).finally(() => clearTimeout(timer));
  });
}

/** 홈 화면 그림·설치 정보: 저장해 둔 것을 먼저 쓰고, 뒤에서 새것으로 바꿔 둡니다. */
function extra(e, url) {
  const opened = caches.open(CACHE);
  const fresh = fetch(url).then(async r => { if (r.ok) (await opened).put(url, r.clone()); return r; });
  e.waitUntil(fresh.catch(() => {}));
  return opened.then(c => c.match(url)).then(old => old || fresh);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const bare = u.origin + u.pathname;
  if (bare === SHELL || bare === SHELL + 'index.html') e.respondWith(shell(e));
  else if (EXTRA.includes(bare)) e.respondWith(extra(e, bare));
  // 그 밖의 요청(시험 주소, 미리 보기 그림 등)은 건드리지 않습니다.
});
