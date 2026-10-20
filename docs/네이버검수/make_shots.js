// 네이버 로그인 검수용 캡처: 받는 정보(이메일·휴대전화)가 서비스 어디에 쓰이는지. 예시 값만 쓴다 (실제 개인정보 없음).
//   로컬 서버(8005)에서: node docs/네이버검수/make_shots.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.BASE_URL || 'http://localhost:8005';
const OUT = __dirname;
const EMAIL = 'dadamom.sample@naver.com', PHONE = '010-1234-5678';
let STUB = fs.readFileSync(path.join(ROOT, 'tests', 'supabase-stub.js'), 'utf8')
  .replace('session = { user: { id: id, email: email } };', "session = { user: { id: id, email: email, app_metadata: { provider: 'custom:naver' }, user_metadata: { email: email, phone: '" + PHONE + "' } } };");
const TRIAL = "var TRIALS = [{key:'sample', brand:'예시 브랜드', title:'유기농 아기 로션 체험단', deadline:'11/30', total:20, bg:'var(--chip-a)', eligibility:'both', topics:[]}];";

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route('**/supabase-js@2', (r) => r.fulfill({ contentType: 'application/javascript', body: STUB }));
  await ctx.route(/\/index\.html(\?.*)?$/, async (r) => {
    const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()).replace('var TRIALS = [];', TRIAL) });
  });
  const p = await ctx.newPage();
  const hideBanner = () => p.addStyleTag({ content: '#test-banner{display:none !important}' });
  await p.goto(BASE + '/index.html#onboarding', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await hideBanner();
  await p.screenshot({ path: path.join(OUT, '1_네이버로그인_버튼.png') });

  await p.evaluate((email) => {
    window.__SBSTUB.store.profiles.push({ id: 'u1', onboarded: true, nickname: '다다맘', kid_type: 'parenting', birth_month: '2025-07', region: '인천' });
    window.__SBSTUB.signIn('u1', email);
  }, EMAIL);
  await p.waitForTimeout(1200);
  await p.evaluate(() => { location.hash = '#my'; });
  await p.waitForTimeout(1500);
  await hideBanner();
  await p.evaluate(() => { const el = document.getElementById('account-status'); if (el) el.scrollIntoView({ block: 'center' }); el.style.outline = '3px solid #03A94D'; el.style.outlineOffset = '4px'; });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, '2_이메일_MY화면.png') });

  await p.evaluate(() => { location.hash = '#benefit'; });
  await p.waitForTimeout(1500);
  await p.click('[data-open-apply="sample"]');
  await p.waitForTimeout(600);
  await hideBanner();
  await p.evaluate(() => { const el = document.getElementById('apply-contact'); el.style.outline = '3px solid #03A94D'; el.style.outlineOffset = '2px'; });
  await p.screenshot({ path: path.join(OUT, '3_휴대전화_체험단신청.png') });
  await b.close();
  console.log('완료');
})();
