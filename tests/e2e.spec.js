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

  // ------------------------------------------------- 홍보 측정 --
  // 가입 경로(?from=)와 마지막 접속일(last_seen). 로그인을 흉내내야 해서 스텁에서만 돈다.
  console.log(NL + '[홍보 측정]');
  if (!USE_STUB) console.log('  SKIP  스텁 없이는 로그인을 흉내낼 수 없음 (배포본은 손으로 확인)');
  else {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await prep(page);
    const errs = [], warns = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'warning' && /다다맘/.test(m.text())) warns.push(m.text()); });
    const from = () => page.evaluate(() => localStorage.getItem('dadamom.from'));

    await page.goto(BASE + '?from=bad_value!', { waitUntil: 'load' });
    check('허용 안 되는 from 은 버림', (await from()) === null);
    await page.goto(BASE + '?from=qr-cafe1', { waitUntil: 'load' });
    check('from 저장', (await from()) === 'qr-cafe1');
    await page.goto(BASE + '?from=qr-other', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    check('먼저 온 from 을 덮어쓰지 않음', (await from()) === 'qr-cafe1');

    // 게스트로 아이 정보를 입력해둔 채 가입·로그인 → 프로필이 처음 만들어지며 from 이 실린다
    await page.evaluate(() => {
      localStorage.setItem('dadamom_v2::guest', JSON.stringify({ onboarded: true, nickname: '측정', kidType: 'baby', region: '서울' }));
      window.__SBSTUB.signIn('u-from', 'from@dadamom.test');
    });
    await page.waitForTimeout(1500);
    const prof = await page.evaluate(() => window.__SBSTUB.store.profiles.find(r => r.id === 'u-from') || null);
    check('가입 시 프로필에 signup_from', !!prof && prof.signup_from === 'qr-cafe1', JSON.stringify(prof && prof.signup_from));

    // 마지막 접속일: 로그인하면 오늘로, 같은 날 다시 열면 쓰지 않는다
    const seen = await page.evaluate(async () => {
      const S = window.__SBSTUB, wait = ms => new Promise(r => setTimeout(r, ms));
      const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      S.signOut(); await wait(300);
      S.store.profiles.push({ id: 'u-seen', onboarded: true, nickname: '접속', last_seen: '2000-01-01' });
      const row = () => S.store.profiles.find(r => r.id === 'u-seen');
      S.signIn('u-seen', 'seen@dadamom.test'); await wait(1200);
      const first = row().last_seen;
      row().last_seen = '2000-01-01';
      S.signOut(); await wait(300);
      S.signIn('u-seen', 'seen@dadamom.test'); await wait(1200);
      document.dispatchEvent(new Event('visibilitychange')); await wait(300);
      return { today, first, second: row().last_seen };
    });
    check('로그인하면 last_seen 이 오늘', seen.first === seen.today, JSON.stringify(seen));
    check('같은 날 다시 열면 갱신 안 함', seen.second === '2000-01-01', seen.second);
    check('JS 오류·저장 실패 경고 없음', errs.length === 0 && warns.length === 0, errs.concat(warns).join('; '));
    await page.close();
  }

  // ------------------------------------------------- 스크랩·알림 --
  // 스크랩 버튼은 홈 피드와 커뮤니티 양쪽에 있다. 한쪽만 다시 그리면 눌러도 안 바뀐 것처럼 보인다 (CLAUDE.md 8절).
  console.log(NL + '[스크랩·알림]');
  if (!USE_STUB) console.log('  SKIP  스텁에서만 데이터를 미리 넣을 수 있음 (배포본은 손으로 확인)');
  else {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await prep(page);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '#onboarding', { waitUntil: 'load' });
    await page.evaluate(() => {
      const S = window.__SBSTUB.store, now = new Date().toISOString();
      S.profiles.push({ id: 'u-sv', onboarded: true, nickname: '스크랩', kid_type: 'parenting', birth_month: '2026-01', region: '서울' });
      S.community_posts.push(
        { id: 'p-mine', owner_id: 'u-sv', author: '스크랩', text: '내 글 제목', status: 'approved', likes: 0, comments: 1, created_at: now },
        { id: 'p-other', owner_id: 'u-ot', author: '남', text: '[질문] 남의 글 제목\n본문', status: 'approved', likes: 0, comments: 0, created_at: now });
      S.post_comments.push({ id: 'c1', post_id: 'p-mine', owner_id: 'u-ot', author: '남', content: '댓글 알림 확인', created_at: now });
      localStorage.setItem('dadamom_noti_seen::u-sv', '1');   // 예전에 한 번 봤다 → 위 댓글은 새 알림
      window.__SBSTUB.signIn('u-sv', 'sv@dadamom.test');
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForTimeout(1500);
    const st = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.getAttribute('aria-pressed') : null; }, sel);
    const marks = () => page.evaluate(() => window.__SBSTUB.store.post_bookmarks.filter(r => r.post_id === 'p-other' && r.user_id === 'u-sv').length);

    const bell = await page.evaluate(() => ({ hidden: document.getElementById('home-bell').hidden, n: document.getElementById('home-bell-n').hidden ? '' : document.getElementById('home-bell-n').textContent }));
    check('로그인하면 홈에 알림 종', !bell.hidden);
    check('새 댓글 1개 표시', bell.n === '1', JSON.stringify(bell));
    check('마감된 챌린지는 홈에 없음 (비면 칸째 숨김)', await page.evaluate(() => {
      const m = document.getElementById('home-missions');
      return !m.innerText.includes('마감됐어요') && (m.innerHTML !== '' || m.parentElement.hidden);
    }));
    check('홈 화면에 추가 안내가 뜸 (브라우저·휴대폰 폭)', await page.evaluate(() => !!document.querySelector('#home-install [data-install-dismiss]')));
    await page.click('#home-install [data-install-dismiss]');
    await page.evaluate(() => { location.hash = '#community'; });
    await page.waitForTimeout(300);
    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForTimeout(600);
    check('닫으면 다시 안 뜸', await page.evaluate(() => document.getElementById('home-install').innerHTML === '' && localStorage.getItem('dadamom.installHint') === 'off'));
    check('남의 글에만 스크랩 버튼', await page.evaluate(() =>
      !!document.querySelector('#home-feed [data-save-post="p-other"]') && !document.querySelector('[data-save-post="p-mine"]')));

    await page.click('#home-feed [data-save-post="p-other"]');
    await page.waitForTimeout(400);
    check('홈에서 스크랩 → 서버 저장', (await marks()) === 1);
    check('홈에서 스크랩 → 홈 버튼이 눌림으로', (await st('#home-feed [data-save-post="p-other"]')) === 'true');

    await page.evaluate(() => { location.hash = '#community'; });
    await page.waitForTimeout(1200);
    check('커뮤니티에서도 눌림으로 보임', (await st('#screen-community [data-save-post="p-other"]')) === 'true');
    await page.click('#screen-community [data-save-post="p-other"]');
    await page.waitForTimeout(400);
    check('커뮤니티에서 취소 → 서버에서 지움', (await marks()) === 0);
    check('커뮤니티에서 취소 → 버튼이 풀림', (await st('#screen-community [data-save-post="p-other"]')) === 'false');

    await page.click('#screen-community [data-save-post="p-other"]');
    await page.waitForTimeout(400);
    await page.evaluate(() => { location.hash = '#my'; });
    await page.waitForTimeout(800);
    await page.click('[data-open-saved]');
    await page.waitForTimeout(600);
    const saved = await page.evaluate(() => document.getElementById('modal-card').innerText);
    check('MY 스크랩한 글에 제목(머리말 뺀 첫 줄)', saved.includes('남의 글 제목') && !saved.includes('[질문]'), saved.replace(/\s+/g, ' ').slice(0, 80));
    await page.click('[data-close-modal]');

    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForTimeout(800);
    await page.click('#home-bell');
    await page.waitForTimeout(300);
    const noti = await page.evaluate(() => ({ text: document.getElementById('modal-card').innerText, badge: document.getElementById('home-bell-n').hidden,
      seen: Number(JSON.parse(localStorage.getItem('dadamom_noti_seen::u-sv'))) }));
    check('알림에 댓글 내용', noti.text.includes('댓글 알림 확인'));
    check('열면 읽음 (숫자 사라지고 사이트와 같은 키에 기록)', noti.badge && noti.seen > 1000, JSON.stringify({ badge: noti.badge, seen: noti.seen }));
    await page.click('[data-close-modal]');

    await page.evaluate(() => window.__SBSTUB.signOut());
    await page.waitForTimeout(800);
    check('로그아웃하면 종 숨김', await page.evaluate(() => document.getElementById('home-bell').hidden));
    check('JS 오류 없음', errs.length === 0, errs.join('; '));
    await page.close();
  }

  // ------------------------------------------------- 관리자: 가입 경로 --
  console.log(NL + '[관리자 — 가입 경로]');
  if (!USE_STUB) console.log('  SKIP  스텁에서만 관리자·프로필을 흉내낼 수 있음');
  else {
    const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
    await prep(page);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '#onboarding', { waitUntil: 'load' });
    await page.evaluate(() => {
      const S = window.__SBSTUB, day = 864e5, iso = (ms) => new Date(ms).toISOString(), kst = (ms) => new Date(ms + 9 * 36e5).toISOString().slice(0, 10);
      const now = Date.now();
      S.admin = true;
      S.store.profiles.push(
        { id: 'u-ad', onboarded: true, nickname: '운영', kid_type: 'parenting', created_at: iso(now - 90 * day) },     // 30일 밖 → 안 셈
        { id: 'u-q1', signup_from: 'qr-cafe1', created_at: iso(now - 3 * day), last_seen: kst(now) },              // 다시 옴 + 7일 내
        { id: 'u-q2', signup_from: 'qr-cafe1', created_at: iso(now - 2 * day), last_seen: kst(now - 2 * day) },    // 가입한 날만
        { id: 'u-n1', created_at: iso(now - 20 * day), last_seen: kst(now - 15 * day) });                          // 경로 없음, 다시 왔지만 7일 밖
      S.signIn('u-ad', 'admin@dadamom.test');
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { location.hash = '#admin'; });
    await page.waitForTimeout(2500);
    const rows = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('#admin-body h2')).find(x => x.textContent.indexOf('가입 경로') === 0);
      const t = h && h.nextElementSibling && h.nextElementSibling.querySelector('table');
      return t ? Array.from(t.querySelectorAll('tr')).slice(1).map(tr => Array.from(tr.children).map(td => td.textContent).join('|')) : null;
    });
    check('경로별 가입·다시 옴·7일 내 접속', JSON.stringify(rows) === JSON.stringify(['qr-cafe1|2|1|2', '(경로 없음)|1|1|0']), JSON.stringify(rows));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    check('360px 에서 넘침 없음', !wide);
    check('JS 오류 없음', errs.length === 0, errs.join('; '));
    await page.close();
  }

  // ------------------------------------------------- 이미 가입된 이메일 --
  // Supabase 는 이미 있는 이메일이면 성공처럼 답하고(identities 빈 배열) 메일을 안 보낸다.
  console.log(NL + '[가입 — 이미 가입된 이메일]');
  if (!USE_STUB) console.log('  SKIP  스텁에서만 응답을 바꿀 수 있음 (배포본은 손으로 확인)');
  else {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await prep(page);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const signup = async (result) => {
      await page.goto(BASE + '#onboarding', { waitUntil: 'load' });
      await page.evaluate((r) => { window.__SBSTUB.signUpResult = r; }, result);
      await page.click('[data-auth-mode="signup"]');
      await page.fill('#auth-email', 'exists@dadamom.test');
      await page.fill('#auth-password', 'abcd1234');
      await page.fill('#auth-password2', 'abcd1234');
      await page.click('#signup-next');
      for (const id of ['terms', 'privacy', 'age14']) await page.check('#consent-' + id);
      await page.click('#signup-submit');
      await page.waitForTimeout(800);
      return page.evaluate(() => ({
        hint: (document.getElementById('auth-hint') || {}).textContent || '',
        body: document.body.innerText,
        pending: localStorage.getItem('dadamom.pendingConsents')
      }));
    };

    let r = await signup({ data: { user: { id: 'u-old', identities: [] }, session: null }, error: null });
    check('이미 가입된 이메일 안내', r.hint === '이미 가입된 이메일이에요. 로그인하거나 카카오·구글로 들어와 주세요.', r.hint);
    check('"인증 메일을 보냈어요" 를 띄우지 않음', !r.body.includes('인증 메일을 보냈어요'));
    check('가입 동의를 기기에 남기지 않음', r.pending === null, r.pending);

    r = await signup({ data: null, error: { code: 'user_already_exists', message: 'User already registered' } });
    check('인증 끈 프로젝트의 오류도 같은 안내', r.hint.startsWith('이미 가입된 이메일이에요'), r.hint);

    r = await signup(null);   // 스텁 기본값 = 새 가입
    check('새 이메일은 그대로 "인증 메일을 보냈어요"', r.body.includes('인증 메일을 보냈어요'));
    check('JS 오류 없음', errs.length === 0, errs.join('; '));
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
