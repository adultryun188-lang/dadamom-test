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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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

  const isDoc = req.mode === 'navigate'
             || url.pathname.endsWith('/')
             || url.pathname.endsWith('index.html')
             || url.pathname.endsWith('env.js');

  if (isDoc) {
    // network-first
    e.respondWith(
      fetch(req)
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
