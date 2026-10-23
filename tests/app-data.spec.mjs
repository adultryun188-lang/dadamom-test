// 내 기록 서버 보관(0024 user_app_data) → 실제 테스트 DB.
// node tests/app-data.spec.mjs [BASE_URL] — 기본 http://localhost:8000. 배포본은 dadamom-test만 허용.
// momA 계정 하나로 기기 두 대(브라우저 컨텍스트 둘)를 열어 기록이 따라오는지, 동시에 쓰면 합쳐지는지,
// 웹 찜이 앱으로 가는지, 다른 사람·비로그인은 못 읽는지 본다. 끝나면 momA 의 행을 지운다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const target = new URL(BASE);
assert(['localhost', '127.0.0.1'].includes(target.hostname) ||
  (target.origin === 'https://adultryun188-lang.github.io' && target.pathname === '/dadamom-test'), 'STOP: 테스트 앱 주소만 허용');
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const URL_ = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(URL_).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
const PW = 'dadamom-test-1234';
let failed = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(name, fn, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await fn()) return true; await sleep(250); }
  throw new Error('대기 시간 초과: ' + name);
}
async function req(path, method = 'GET', body, token) {
  const r = await fetch(URL_ + path, {
    method, signal: AbortSignal.timeout(15000),
    headers: { apikey: KEY, Authorization: 'Bearer ' + (token || KEY), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
async function login(email) {
  const r = await req('/auth/v1/token?grant_type=password', 'POST', { email, password: PW });
  assert(r.body.access_token, '테스트 로그인 실패 ' + email);
  return { uid: r.body.user.id, token: r.body.access_token };
}
const appState = p => p.evaluate(() => {
  const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('auth-token'));
  const uid = JSON.parse(localStorage.getItem(k)).user.id;
  return JSON.parse(localStorage.getItem('dadamom_v2::' + uid) || '{}');
});
const errors = [];
async function open(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname.endsWith('.supabase.co') && u.origin !== URL_) { await route.abort(); return; }
    await route.continue();
  });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/index.html#onboarding', { waitUntil: 'load' });
  assert.equal(await page.evaluate(() => window.DADAMOM_ENV?.SUPABASE_URL), URL_, 'STOP: 브라우저 환경이 테스트 DB가 아님');
  await page.fill('#auth-email', email);
  await page.fill('#auth-password', PW);
  await page.click('#auth-password-submit');
  await page.waitForURL('**/*#home');
  await until('로그인 프로필', async () => (await appState(page)).onboarded);
  return { ctx, page };
}
async function go(p, name) {
  await p.evaluate(h => { location.hash = '#' + h; }, name);
  await p.locator('#screen-' + name).waitFor({ state: 'visible' });
}
const dismissPopup = p => p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});

const B = await login('momA@dadamom.test');   // 육아 중 계정이라 돌봄기록 버튼이 보인다
const A = await login('momB@dadamom.test');
const row = async () => (await req('/rest/v1/user_app_data?select=data,updated_at&user_id=eq.' + B.uid, 'GET', undefined, B.token)).body[0];
const wipe = () => req('/rest/v1/user_app_data?user_id=eq.' + B.uid, 'DELETE', undefined, B.token);
let browser;
try {
  await wipe();
  browser = await chromium.launch();
  const d1 = await open(browser, 'momA@dadamom.test');
  await dismissPopup(d1.page);

  // 1) 기기 1에서 기록 → 서버에 올라감
  await go(d1.page, 'growth');
  await d1.page.click('[data-care-log="feed"]');
  const care1 = (await appState(d1.page)).careLog.at(-1);
  await go(d1.page, 'prep');
  const prepKey = await d1.page.getAttribute('[data-prep-check]', 'data-prep-check');
  await d1.page.click('[data-prep-check="' + prepKey + '"]');
  await until('서버에 돌봄기록·준비물', async () => { const r = await row(); return r && r.data.careLog?.some(e => e.id === care1.id) && r.data.prepChecked?.[prepKey]; });
  ok('기기 1 기록이 서버에 올라감', true);

  // 2) 새 기기에서 같은 계정 → 기록이 따라옴
  const d2 = await open(browser, 'momA@dadamom.test');
  await until('기기 2에 기록 도착', async () => { const s = await appState(d2.page); return s.careLog?.some(e => e.id === care1.id) && s.prepChecked?.[prepKey]; });
  ok('새 기기에서 돌봄기록·준비물 체크가 보임', true);

  // 3) 두 기기가 따로 쓰면 둘 다 남음
  await dismissPopup(d2.page);
  await go(d2.page, 'growth');
  await d2.page.click('[data-care-log="sleep"]');
  const care2 = (await appState(d2.page)).careLog.at(-1);
  await until('기기 2 기록 서버 반영', async () => (await row()).data.careLog?.some(e => e.id === care2.id));
  await go(d1.page, 'growth');
  await d1.page.click('[data-care-log="feed"]');
  const care3 = (await appState(d1.page)).careLog.at(-1);
  await until('기기 1 두 번째 기록 서버 반영', async () => (await row()).data.careLog?.some(e => e.id === care3.id));
  const merged = (await row()).data.careLog.map(e => e.id);
  ok('동시에 써도 세 기록 모두 서버에 남음', [care1.id, care2.id, care3.id].every(id => merged.includes(id)), merged.length + '개');
  await d2.page.reload({ waitUntil: 'load' });
  await until('기기 2가 기기 1 새 기록 받음', async () => (await appState(d2.page)).careLog?.some(e => e.id === care3.id));
  ok('다시 열면 다른 기기 기록을 받음', true);

  // 4) 웹 찜 → 서버 → 앱
  const d3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await d3.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
    [await d2.page.evaluate(() => Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('auth-token'))),
     await d2.page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('auth-token'))))]);
  const w = await d3.newPage();
  w.on('dialog', d => d.accept());
  w.on('pageerror', e => errors.push('web: ' + e.message));
  await w.goto(BASE + '/community.html#/brand', { waitUntil: 'load' });
  await dismissPopup(w);
  const wishBtn = w.locator('[data-wish][aria-pressed="false"]').first();
  await wishBtn.waitFor({ timeout: 20000 });
  const pid = await wishBtn.getAttribute('data-wish');
  await wishBtn.click();
  await until('웹 찜 서버 반영', async () => (await row()).data.wishProducts?.includes(pid));
  const r4 = (await row()).data;
  ok('웹 찜이 서버에 저장되고 다른 기록은 그대로', r4.careLog?.some(e => e.id === care1.id) && !!r4.prepChecked?.[prepKey]);
  await d1.page.reload({ waitUntil: 'load' });
  await until('앱이 웹 찜을 받음', async () => (await appState(d1.page)).wishProducts?.includes(pid));
  ok('웹에서 찜한 상품이 앱에도 보임', true);

  // 5) 다른 사람·비로그인은 못 읽고 못 씀
  const other = await req('/rest/v1/user_app_data?select=data&user_id=eq.' + B.uid, 'GET', undefined, A.token);
  ok('다른 계정은 내 기록 0행', other.status === 200 && other.body.length === 0, 'HTTP ' + other.status);
  const forged = await req('/rest/v1/user_app_data', 'POST', { user_id: B.uid, data: { careLog: [] } }, A.token);
  ok('다른 계정이 내 행 대신 쓰기 거절', forged.status >= 400, 'HTTP ' + forged.status);
  const anonR = await req('/rest/v1/user_app_data?select=data', 'GET');
  ok('비로그인 읽기 거절', anonR.status === 401 || (anonR.status === 200 && anonR.body.length === 0), 'HTTP ' + anonR.status);
  const after = (await row()).data.careLog.length;
  ok('위조 시도 뒤에도 기록 그대로', after >= 3);
  ok('페이지 오류 없음', errors.length === 0, errors.join(' | '));
} catch (e) {
  failed++; console.log('FAIL 실행 중단: ' + e.message);
} finally {
  await wipe();
  if (browser) await browser.close();
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
