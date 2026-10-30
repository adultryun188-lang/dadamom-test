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
    await page.route('**/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: STUB_SRC }));
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
    for (const h of ['home', 'outing', 'growth', 'my']) {
      await page.evaluate(x => { location.hash = '#' + x; }, h);
      await page.waitForTimeout(450);
      check('#' + h + ' 차단', (await cur()) === 'screen-onboarding');
    }
    // 광고가 데려오는 곳이라 비로그인도 본다 (참가·신청·응원은 로그인 필요)
    for (const h of ['challenge', 'benefit']) {
      await page.evaluate(x => { location.hash = '#' + x; }, h);
      await page.waitForTimeout(600);
      check('#' + h + ' 비로그인 열람 허용', (await cur()) === 'screen-' + h);
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

    // 검수 대기 알림: 관리자에게만, 처리할 때까지
    await page.evaluate(() => {
      window.__SBSTUB.store.community_posts.push({ id: 'p-pend', owner_id: 'u-q1', author: '대기', text: '검수 기다리는 글', status: 'pending', created_at: new Date().toISOString() });
      location.hash = '#home';
    });
    await page.waitForTimeout(2000);
    const rv = await page.evaluate(() => ({ n: document.getElementById('home-bell-n').hidden ? '' : document.getElementById('home-bell-n').textContent,
      link: document.getElementById('admin-link').textContent }));
    check('관리자 종에 검수 대기 표시', rv.n !== '', JSON.stringify(rv));
    check('MY 관리자 링크에 대기 수', rv.link.indexOf('검수 대기 1건') > -1, rv.link);
    await page.click('#home-bell');
    await page.waitForTimeout(300);
    check('알림 창에 검수 대기 줄 → 관리자 화면', await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('#modal-card a')).find(x => x.textContent.indexOf('검수 대기 1건') > -1);
      return !!a && a.getAttribute('href') === '#admin';
    }));
    await page.click('#modal-card a[href="#admin"]');
    await page.waitForTimeout(800);
    check('누르면 창이 닫히고 관리자 화면', await page.evaluate(() => document.getElementById('modal-backdrop').hidden && location.hash === '#admin'));
    check('JS 오류 없음', errs.length === 0, errs.join('; '));
    await page.close();
  }

  // ------------------------------------------------- 광고 착지: 챌린지 --
  // 광고 → 비로그인으로 챌린지를 봄 → 참가를 누르면 로그인 안내 + 주소에 returnTo → 로그인 뒤 챌린지로 돌아옴
  console.log(NL + '[광고 착지 — 챌린지·혜택]');
  if (!USE_STUB) console.log('  SKIP  스텁에서만 로그인을 흉내낼 수 있음 (배포본은 손으로 확인)');
  else {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await prep(page);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const cur = () => page.evaluate(() => Array.from(document.querySelectorAll('.screen')).filter(s => !s.hidden).map(s => s.id)[0]);

    await page.goto(BASE + '?from=meta-test#challenge', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    check('광고 주소로 챌린지가 바로 열림', (await cur()) === 'screen-challenge', await cur());
    const prize = await page.evaluate(() => (document.getElementById('challenge-prize') || {}).textContent || '');
    check('경품 안내가 보임 (챌린지마다 매달 1명, 0037)', prize.includes('1명') && prize.includes('매달'), prize);

    await page.click('[data-open-challenge-modal]');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ modal: document.body.innerText.includes('로그인이 필요해요'), url: location.href }));
    check('참가를 누르면 로그인 안내', after.modal);
    check('주소에 돌아올 화면과 경로가 남음', /returnTo=%23challenge/.test(after.url) && /from=meta-test/.test(after.url), after.url);

    // 이미 아이 정보까지 마친 계정으로 로그인하면 챌린지로 돌아온다
    await page.evaluate(() => {
      window.__SBSTUB.store.profiles.push({ id: 'u-ad', onboarded: true, nickname: '광고', kid_type: 'parenting', birth_month: '2025-06', region: '인천' });
      window.__SBSTUB.signIn('u-ad', 'ad@dadamom.test');
    });
    await page.waitForTimeout(3000);
    const back = await page.evaluate(() => ({ hash: location.hash, search: location.search }));
    check('로그인 뒤 챌린지로 복귀', back.hash === '#challenge' && !/returnTo/.test(back.search) && /from=meta-test/.test(back.search), JSON.stringify(back));

    await page.goto(BASE + '?from=meta-test#benefit', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    check('광고 주소로 혜택(체험단)이 바로 열림', (await cur()) === 'screen-benefit', await cur());
    check('JS 오류 없음', errs.length === 0, errs.join('; '));
    await page.close();
  }

  // ------------------------------------------------- 이메일 인증번호로 시작하기 --
  // 이메일 → 6자리 번호 → 로그인(처음이면 가입). 비밀번호·링크 메일 없음 (2026-10-28)
  console.log(NL + '[이메일 인증번호]');
  if (!USE_STUB) console.log('  SKIP  스텁에서만 (배포본은 실제 메일로 손으로 확인)');
  else {
    let page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await prep(page);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '#onboarding', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    check('첫 화면은 비밀번호 로그인', await page.isVisible('#auth-password-submit'));
    check('첫 화면에 회원가입·인증번호 로그인 링크', !!(await page.$('[data-auth-view="signup"]')) && !!(await page.$('[data-auth-view="code"]')));
    await page.click('[data-auth-view="code"]');
    check('인증번호 로그인으로 바꾸면 받기 버튼', await page.isVisible('#otp-send'));
    await page.fill('#auth-email', 'new@dadamom.test');
    check('동의 전에는 못 보냄', await page.isDisabled('#otp-send'));
    await page.check('#consent-quick');
    check('동의하면 보낼 수 있음', !(await page.isDisabled('#otp-send')));
    await page.click('#otp-send');
    await page.waitForTimeout(500);
    const sent = await page.evaluate(() => ({ to: window.__SBSTUB.otpSentTo, pending: localStorage.getItem('dadamom.pendingConsents'), code: !!document.getElementById('auth-code') }));
    check('입력한 주소로 보냄', sent.to === 'new@dadamom.test', sent.to);
    check('번호 넣는 칸이 나옴', sent.code);
    check('필수 동의 3개를 기기에 잠시 둠 (마케팅은 건드리지 않음)', !!sent.pending && JSON.parse(sent.pending).length === 3 && !sent.pending.includes('marketing'), sent.pending);
    await page.fill('#auth-code', '000000');
    await page.waitForTimeout(500);
    const bad = await page.evaluate(() => (document.getElementById('auth-hint') || {}).textContent || '');
    check('틀린 번호는 한국어 안내', bad.includes('인증번호가 맞지 않거나'), bad);
    await page.fill('#auth-code', '123456');
    await page.waitForTimeout(1500);
    const ok = await page.evaluate(() => ({ uid: window.__SBSTUB.curId, pending: localStorage.getItem('dadamom.pendingConsents') }));
    check('맞는 번호면 로그인됨', ok.uid === 'u-otp', ok.uid);
    check('로그인되면 동의를 올리고 기기에서 지움', ok.pending === null, ok.pending);

    await page.close();
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await prep(page);
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '#onboarding', { waitUntil: 'load' });
    await page.click('[data-auth-view="code"]');
    await page.evaluate(() => { window.__SBSTUB.otpSendResult = { data: {}, error: { message: 'For security purposes, you can only request this after 42 seconds.' } }; });
    await page.waitForTimeout(500);
    await page.fill('#auth-email', 'x@dadamom.test');
    await page.check('#consent-quick');
    await page.click('#otp-send');
    await page.waitForTimeout(500);
    const rl = await page.evaluate(() => (document.getElementById('auth-hint') || {}).textContent || '');
    check('너무 자주 보내면 한국어 안내', rl.includes('1분에 한 번'), rl);
    await page.close();

    // 회원가입: 이메일·비밀번호 → 6자리 번호(type signup) → 로그인 (2026-10-30)
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await prep(page);
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '#onboarding', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.click('[data-auth-view="signup"]');
    await page.fill('#auth-email', 'join@dadamom.test');
    await page.fill('#auth-password', 'abc12345');
    await page.fill('#auth-password2', 'abc12345');
    check('가입: 동의 전에는 못 누름', await page.isDisabled('#join-send'));
    await page.check('#consent-quick');
    check('가입: 동의하면 누를 수 있음', !(await page.isDisabled('#join-send')));
    await page.click('#join-send');
    await page.waitForTimeout(500);
    check('가입: 번호 넣는 칸이 나옴', await page.isVisible('#auth-code'));
    await page.fill('#auth-code', '123456');
    await page.waitForTimeout(1500);
    const jn = await page.evaluate(() => ({ uid: window.__SBSTUB.curId, type: window.__SBSTUB.otpType }));
    check('가입: 맞는 번호면 로그인 (signup 확인)', jn.uid === 'u-otp' && jn.type === 'signup', JSON.stringify(jn));
    check('JS 오류 없음', errs.length === 0, errs.join('; '));
    await page.close();
  }

  // ------------------------------------------------- 앱 안 구글 로그인 (1.1.3) --
  // 앱 껍데기(UA)에 Capacitor Browser·App 플러그인이 있으면 구글 버튼이 보이고, 크롬 탭으로 열었다가
  // kr.dadaran.dadamom://auth#access_token=… 으로 돌아오면 로그인된다.
  console.log(NL + '[앱 안 구글 로그인]');
  if (USE_STUB) {
    for (const withPlugin of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile DadamomAndroid' });
      const page = await ctx.newPage();
      await prep(page);
      // 개발 env 는 소셜 버튼을 숨기므로(SOCIAL_LOGIN:false) 이 시험에서만 켠다
      await page.route('**/env.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('SOCIAL_LOGIN: false', 'SOCIAL_LOGIN: true') }); });
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      if (withPlugin) await page.addInitScript(() => {
        window.__appUrl = null; window.__opened = null; window.__closed = 0;
        window.Capacitor = { isNativePlatform: () => true, Plugins: {
          Browser: { open: async (o) => { window.__opened = o.url; }, close: async () => { window.__closed++; } },
          App: { addListener: (n, f) => { if (n === 'appUrlOpen') window.__appUrl = f; } } } };
      });
      await page.goto(BASE + '#onboarding', { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const vis = await page.isVisible('#google-signin-btn');
      if (!withPlugin) { check('옛 앱(플러그인 없음)은 구글 버튼 숨김', !vis); await ctx.close(); continue; }
      check('새 앱은 구글 버튼 보임', vis);
      await page.click('#google-signin-btn');
      await page.waitForTimeout(300);
      const o = await page.evaluate(() => ({ opened: window.__opened, args: window.__SBSTUB.oauthArgs }));
      check('크롬 탭으로 구글 로그인 주소를 엶', !!o.opened && o.args.options.redirectTo === 'kr.dadaran.dadamom://auth' && o.args.options.skipBrowserRedirect === true, JSON.stringify(o.args && o.args.options));
      await page.evaluate(() => window.__appUrl({ url: 'kr.dadaran.dadamom://auth#access_token=AT&refresh_token=RT&token_type=bearer' }));
      await page.waitForTimeout(800);
      const done = await page.evaluate(() => ({ uid: window.__SBSTUB.curId, set: window.__SBSTUB.setSessionArgs, closed: window.__closed }));
      check('돌아오면 토큰으로 로그인·크롬 탭 닫음', done.uid === 'u-app' && done.set.access_token === 'AT' && done.set.refresh_token === 'RT' && done.closed === 1, JSON.stringify(done));
      check('JS 오류 없음', errs.length === 0, errs.join('; '));
      await ctx.close();
    }
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
