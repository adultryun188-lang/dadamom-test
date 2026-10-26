// 챌린지 여러 개(0025) → 실제 테스트 DB. node tests/challenges.spec.mjs [BASE_URL] (기본 http://localhost:8000)
// momA(육아 15개월 안팎)로: 목록·추천 순서, 고르기, 할로윈 참가 → DB challenge_key, 없는/닫힌 챌린지는 서버가 거절,
// 표가 없는 환경(운영 SQL 전)에서도 첫걸음 하나로 동작. 끝나면 만든 참가작을 지운다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const target = new URL(BASE);
assert(['localhost', '127.0.0.1'].includes(target.hostname) ||
  (target.origin === 'https://adultryun188-lang.github.io' && target.pathname === '/dadamom-test'), 'STOP: 테스트 앱 주소만 허용');
const envSrc = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const URL_ = envSrc.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = envSrc.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(URL_).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
const PW = 'dadamom-test-1234';
let failed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
async function req(path, method = 'GET', body, token) {
  const r = await fetch(URL_ + path, { method, signal: AbortSignal.timeout(15000),
    headers: { apikey: KEY, Authorization: 'Bearer ' + (token || KEY), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null };
}
const login = async email => { const r = await req('/auth/v1/token?grant_type=password', 'POST', { email, password: PW }); return { uid: r.body.user.id, token: r.body.access_token }; };
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pngPath = new URL('../test-results/_tiny.png', import.meta.url);
fs.mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true });
fs.writeFileSync(pngPath, PNG);

const A = await login('momA@dadamom.test');
const errors = [];
let browser, madeIds = [];
async function open(fallback) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('**/env.js*', r => r.fulfill({ contentType: 'text/javascript', body: envSrc }));
  if (fallback) await ctx.route('**/rest/v1/challenges*', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"42P01","message":"relation does not exist"}' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(2000);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.fill('#auth-email', 'momA@dadamom.test'); await p.fill('#auth-password', PW);
  await p.click('#auth-password-submit'); await p.waitForTimeout(4500);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('dadamom_v2::')); const st = JSON.parse(localStorage.getItem(k)); delete st.challengeKey; localStorage.setItem(k, JSON.stringify(st)); });
  return { ctx, p };
}
try {
  browser = await chromium.launch();
  const { p } = await open(false);
  await p.evaluate(() => { location.hash = '#home'; }); await p.waitForTimeout(1500);
  const homeMissions = await p.locator('#screen-home [data-challenge-go]').allTextContents();
  ok('홈에 챌린지 둘까지 (아이 개월 수에 맞는 것 먼저)', homeMissions.length === 2 && /첫걸음/.test(homeMissions[0]), homeMissions.map(t => t.replace(/\s+/g, ' ').trim().slice(0, 20)).join(' | '));
  await p.evaluate(() => { location.hash = '#challenge'; }); await p.waitForTimeout(1500);
  const chips = await p.locator('#challenge-picker [data-challenge-pick]').allTextContents();
  ok('챌린지 고르기 칩 5개', chips.length === 5, chips.join(' / '));
  ok('처음엔 개월 수 맞는 첫걸음', (await p.textContent('#challenge-title')).includes('첫걸음'));
  await p.click('[data-challenge-pick="halloween"]'); await p.waitForTimeout(600);
  ok('할로윈 고르면 머리 바뀜', (await p.textContent('#challenge-title')).includes('할로윈') && (await p.textContent('#challenge-art')) === '🎃');
  ok('경품 문구: 한 달에 한 명', (await p.textContent('#challenge-prize')).includes('1명'));
  ok('할로윈 참가작은 0개 (첫걸음 것과 섞이지 않음)', (await p.textContent('#entry-count')) === '0');
  await p.screenshot({ path: 'test-results/챌린지_할로윈.png' });
  await p.click('[data-open-challenge-modal]'); await p.waitForTimeout(800);
  ok('참여 창에 할로윈 안내', (await p.textContent('#modal-card')).includes('코스튬'));
  await p.setInputFiles('#entry-file', fileURLToPath(pngPath));
  await p.fill('#entry-note', '시험 참가 — 호박 모자');
  await p.check('#entry-consent');
  await p.waitForTimeout(500);
  await p.click('#entry-submit'); await p.waitForTimeout(4000);
  const mine = (await req('/rest/v1/challenge_entries?select=id,challenge_key,note,status&owner_id=eq.' + A.uid + '&note=eq.' + encodeURIComponent('시험 참가 — 호박 모자'), 'GET', undefined, A.token)).body;
  madeIds = mine.map(r => r.id);
  ok('DB 에 할로윈으로 저장', mine.length === 1 && mine[0].challenge_key === 'halloween' && mine[0].status === 'pending', JSON.stringify(mine));
  await p.click('[data-challenge-pick="firststep"]'); await p.waitForTimeout(600);
  ok('첫걸음 목록엔 방금 글 없음', !(await p.textContent('#entries')).includes('호박 모자'));

  const bad = await req('/rest/v1/challenge_entries', 'POST', { name: 'x', note: 'x', challenge_key: 'nope' }, A.token);
  ok('없는 챌린지에 참가 거절', bad.status >= 400, 'HTTP ' + bad.status);
  const anonList = await req('/rest/v1/challenges?select=id');
  ok('비로그인도 챌린지 목록은 읽음', anonList.status === 200 && anonList.body.length === 5);
  const anonWrite = await req('/rest/v1/challenges', 'POST', { id: 'hack', title: 'x' });
  ok('비로그인 챌린지 만들기 거절', anonWrite.status >= 400, 'HTTP ' + anonWrite.status);
  const userWrite = await req('/rest/v1/challenges', 'POST', { id: 'hack', title: 'x' }, A.token);
  ok('일반 회원 챌린지 만들기 거절', userWrite.status >= 400, 'HTTP ' + userWrite.status);

  // 표가 없는 환경
  const fb = await open(true);
  await fb.p.evaluate(() => { location.hash = '#challenge'; }); await fb.p.waitForTimeout(1500);
  ok('표가 없으면 첫걸음 하나 (칩 숨김)', (await fb.p.textContent('#challenge-title')).includes('첫걸음') && await fb.p.locator('#challenge-picker').isHidden());
  ok('표가 없어도 첫걸음 참가작은 보임', Number(await fb.p.textContent('#entry-count')) >= 1);
  ok('페이지 오류 없음', errors.length === 0, errors.join(' | '));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  for (const id of madeIds) await req('/rest/v1/challenge_entries?id=eq.' + id, 'DELETE', undefined, A.token);
  if (browser) await browser.close();
  fs.rmSync(pngPath, { force: true });
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
