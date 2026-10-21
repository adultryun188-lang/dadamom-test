// 네이버 로그인 검수용 캡처. 예시 값만 쓴다 (실제 개인정보 없음).  로컬 서버(8005)에서: node docs/네이버검수/make_shots.js
//  가입 절차: 1 로그인 화면 → (2 네이버 동의 화면은 사장님이 직접 캡처) → 3 아이 정보 입력 → 4 가입 완료(홈)
//  정보 활용처: 5 이메일(MY) · 6 이름·휴대전화(체험단 신청 배송정보)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.BASE_URL || 'http://localhost:8005';
const OUT = __dirname;
const EMAIL = 'dadamom.sample@naver.com', PHONE = '010-1234-5678', NAME = '홍길동';
const STUB = fs.readFileSync(path.join(ROOT, 'tests', 'supabase-stub.js'), 'utf8')
  .replace('session = { user: { id: id, email: email } };',
    "session = { user: { id: id, email: email, app_metadata: { provider: 'custom:naver' }, user_metadata: { email: email, name: '" + NAME + "', phone: '" + PHONE + "' } } };");
const TRIAL = "var TRIALS = [{key:'sample', brand:'예시 브랜드', title:'유기농 아기 로션 체험단', deadline:'11/30', total:20, bg:'var(--chip-a)', eligibility:'both', topics:[]}];";

(async () => {
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route('**/supabase-js@2', (r) => r.fulfill({ contentType: 'application/javascript', body: STUB }));
  await ctx.route(/\/index\.html(\?.*)?$/, async (r) => {
    const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()).replace('var TRIALS = [];', TRIAL) });
  });
  const p = await ctx.newPage();
  const shot = async (name, mark) => {
    await p.addStyleTag({ content: '#test-banner,#toast{display:none !important}' });
    if (mark) await p.evaluate((sel) => { const el = document.querySelector(sel); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '3px solid #03A94D'; el.style.outlineOffset = '3px'; } }, mark);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, name) });
  };
  await p.goto(BASE + '/index.html#onboarding', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await shot('1_로그인화면_네이버버튼.png', '#naver-signin-btn');

  // 네이버 로그인 뒤 돌아온 신규 회원 → 아이 정보 입력 (비밀번호를 따로 묻지 않음)
  await p.evaluate((email) => window.__SBSTUB.signIn('u1', email), EMAIL);
  await p.waitForTimeout(1500);
  await shot('3_가입_아이정보입력.png');

  await p.evaluate(() => {
    window.__SBSTUB.store.profiles.push({ id: 'u1', onboarded: true, nickname: '다다맘', kid_type: 'parenting', birth_month: '2025-07', region: '인천' });
    window.__SBSTUB.signOut();
  });
  await p.waitForTimeout(500);
  await p.evaluate((email) => window.__SBSTUB.signIn('u1', email), EMAIL);
  await p.waitForTimeout(1200);
  await p.evaluate(() => { location.hash = '#home'; });
  await p.waitForTimeout(1500);
  await shot('4_가입완료_홈.png');

  await p.evaluate(() => { location.hash = '#my'; });
  await p.waitForTimeout(1500);
  await shot('5_이메일_MY화면.png', '#account-status');

  await p.evaluate(() => { location.hash = '#benefit'; });
  await p.waitForTimeout(1500);
  await p.click('[data-open-apply="sample"]');
  await p.waitForTimeout(600);
  await p.addStyleTag({ content: '#apply-name,#apply-contact{outline:3px solid #03A94D;outline-offset:2px}' });
  await shot('6_이름_휴대전화_체험단배송정보.png');
  await b.close();
  console.log('완료');
})();
