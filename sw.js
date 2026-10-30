/* 다다맘 TEST 서비스워커
 *
 * 캐시 전략
 *  - index.html 과 env.js: network-first. 배포한 변경이 바로 보이도록.
 *  - 아이콘·manifest 같은 정적 자산: cache-first.
 *  - Supabase API(/rest/v1, /auth/v1, /storage/v1): 절대 캐시하지 않는다.
 *    개인정보와 서명 URL 이 디스크에 남으면 안 되기 때문이다.
 */
// 빌드 값은 등록 URL(./sw.js?v=...)에서 읽는다.
// 파일에 박아두면 빌드할 때마다 원본이 덮여 재현이 어려워진다.
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'dadamom-test-' + BUILD;

const PRECACHE = [
  './',
  './index.html',
  './community-flow.js',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dadamom-test-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return /\/(rest|auth|storage|realtime|functions)\/v1\//.test(url.pathname)
      || url.hostname.endsWith('.supabase.co');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase 응답은 캐시하지 않는다
  if (isApi(url)) return;

  // 다른 출처(폰트 CDN 등)는 브라우저 기본 동작에 맡긴다
  if (url.origin !== self.location.origin) return;

  // 영상(챌린지 예시 영상 등)은 브라우저에 맡긴다. 아이폰 사파리는 Range 요청으로 받는데,
  // 캐시에서 통째로 돌려주면 재생이 안 된다.
  if (req.headers.has('range') || /\.(mp4|mov|webm)$/i.test(url.pathname)) return;

  const isDoc = req.mode === 'navigate'
             || url.pathname.endsWith('/')
             || url.pathname.endsWith('index.html')
             // 앱 코드(js)도 새로 받는다. cache-first 면 SW 버전(v)이 고정이라 index.html 만 새것이 되고 js 는 옛것으로 남는다.
             || url.pathname.endsWith('.js')
             || url.pathname.endsWith('env.js');

  if (isDoc) {
    // network-first. no-cache: GitHub Pages 의 10분 HTTP 캐시를 건너뛰고 서버에 바뀌었는지 묻는다(안 바뀌면 304 라 가볍다).
    // 이게 없으면 배포 직후 앱을 다시 켜도 10분 동안 옛 화면이 나온다.
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./offline.html')))
    );
    return;
  }

  // cache-first
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});

// 푸시 알림 (0047 send-push). 서버는 웹에 data 만 보내므로 여기서 직접 띄운다.
self.addEventListener('push', (e) => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = j.data || j; } catch (_) {}
  if (!d.title) return;
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.kind || 'dadamom',
    data: { link: d.link || '#home' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL('./' + ((e.notification.data && e.notification.data.link) || '#home'), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
