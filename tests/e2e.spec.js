/* 다다맘 TEST — 화면·PWA 기본 검증
 *
 *   npm i -D playwright && npx playwright install chromium   (최초 1회)
 *   ./scripts/build.sh dev && ./scripts/serve.sh &           (로컬 서버)
 *   node tests/e2e.spec.js
 *
 * 확인 항목
 *   - 320 / 360 / 390 / 430px 에서 가로 넘침이 없는지
 *   - TEST 배너가 보이는지
 *   - manifest 와 아이콘이 실제로 받아지는지
 *   - 비로그인 접근 제한이 걸려 있는지
 *   - JS 오류가 없는지
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

/* 이 컨테이너는 바깥 네트워크가 막혀 있어 supabase-js CDN 을 받지 못한다.
 * 그 상태로는 앱이 오프라인 모드로 떨어져 접근 제한을 검증할 수 없다.
 * 로컬에서 돌릴 때만 스텁을 끼워 넣는다.
 * 실제 네트워크가 되는 환경(배포된 주소)에서는 STUB=0 으로 끄고 돌리면 된다.
 */
const USE_STUB = process.env.STUB !== '0';
const STUB_SRC = USE_STUB ? fs.readFileSync(path.join(__dirname, 'supabase-stub.js'), 'utf8') : null;

async function prep(page) {
  if (USE_STUB) {
    await page.route('**/supabase-js@2', r => r.fulfill({ contentType: 'application/javascript', body: STUB_SRC }));
    await page.route('**/css2**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  }
}

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const WIDTHS = [320, 360, 390, 430];
const NL = String.fromCharCode(10);

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
  if (!ok) failed++;
}

(async () => {
  const browser = await chromium.launch();
  console.log('대상: ' + BASE + (USE_STUB ? '   (Supabase 스텁 사용)' : '   (실제 Supabase)'));

  // ---------------------------------------------------- 폭별 레이아웃 --
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    await prep(page);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const r = await page.evaluate(() => ({
      banner: (() => { const b = document.getElementById('test-banner'); return !!b && !b.hidden; })(),
      bannerText: (document.getElementById('test-banner') || {}).innerText || '',
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      screen: Array.from(document.querySelectorAll('.screen')).filter(s => !s.hidden).map(s => s.id)[0],
      navOverflow: (() => {
        const nav = document.querySelector('.screen:not([hidden]) .navbar');
        if (!nav) return null;
        const nr = nav.getBoundingClientRect();
        return Array.from(nav.querySelectorAll('button')).some(b => b.getBoundingClientRect().right > nr.right + 1);
      })()
    }));

    console.log(NL + '[' + w + 'px]');
    check('TEST 배너 표시', r.banner, r.bannerText.replace(/\s+/g, ' '));
    check('가로 스크롤 없음', !r.hScroll);
    check('내비 넘침 없음', r.navOverflow !== true);
    check('JS 오류 없음', errs.length === 0, errs.join('; '));
    await page.close();
  }

  // ------------------------------------------------------- PWA 자원 --
  console.log(NL + '[PWA]');
  {
    const page = await browser.newPage();
    await prep(page);
    await page.goto(BASE, { waitUntil: 'load' });
    const man = await page.evaluate(async () => {
      const r = await fetch('./manifest.webmanifest');
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json();
      return { ok: true, name: j.name, display: j.display, icons: j.icons.length, start: j.start_url };
    });
    check('manifest 로드', man.ok, JSON.stringify(man));
    check('앱 이름이 TEST', man.ok && /TEST/.test(man.name || ''), man.name);
    check('standalone 설치형', man.ok && man.display === 'standalone');
    check('아이콘 3종', man.ok && man.icons >= 3);

    const icons = await page.evaluate(async () => {
      const paths = ['./icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
      const out = {};
      for (const p of paths) { const r = await fetch(p); out[p] = r.status; }
      return out;
    });
    check('아이콘 파일 4개 응답 200', Object.values(icons).every(s => s === 200), JSON.stringify(icons));

    const sw = await page.evaluate(async () => (await fetch('./sw.js')).status);
    check('sw.js 응답 200', sw === 200);
    const off = await page.evaluate(async () => (await fetch('./offline.html')).status);
    check('offline.html 응답 200', off === 200);
    await page.close();
  }

  // ----------------------------------------------------- 접근 제한 --
  console.log(NL + '[비로그인 접근 제한]');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await prep(page);
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const cur = () => page.evaluate(() => Array.from(document.querySelectorAll('.screen')).filter(s => !s.hidden).map(s => s.id)[0]);
    for (const h of ['home', 'challenge', 'benefit', 'outing', 'growth', 'my']) {
      await page.evaluate(x => { location.hash = '#' + x; }, h);
      await page.waitForTimeout(450);
      check('#' + h + ' 차단', (await cur()) === 'screen-onboarding');
    }
    await page.evaluate(() => { location.hash = '#community'; });
    await page.waitForTimeout(1800);
    check('#community 열람 허용', (await cur()) === 'screen-community');
    const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('dadamom') === 0));
    check('비로그인 저장 없음', keys.length === 0, JSON.stringify(keys));
    await page.close();
  }

  // ------------------------------------------------- 모바일 기기 --
  console.log(NL + '[기기 프로파일]');
  for (const name of ['Pixel 7', 'iPhone 13', 'iPhone SE']) {
    const d = devices[name];
    if (!d) { console.log('  SKIP  ' + name + ' (프로파일 없음)'); continue; }
    const ctx = await browser.newContext({ ...d });
    const page = await ctx.newPage();
    await prep(page);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      banner: (() => { const b = document.getElementById('test-banner'); return !!b && !b.hidden; })()
    }));
    check(name, !r.hScroll && r.banner && errs.length === 0,
      'hScroll=' + r.hScroll + ' banner=' + r.banner + ' errs=' + errs.length);
    await ctx.close();
  }

  await browser.close();
  console.log(NL + (failed ? ('실패 ' + failed + '건') : '전부 통과'));
  process.exit(failed ? 1 : 0);
})();
