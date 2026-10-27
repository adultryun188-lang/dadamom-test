// '제품 제공받음' 표시(0038) + 규칙 전체 보기 + 첫 화면 안전 안내 → 실제 테스트 DB. node tests/sponsored.spec.mjs (localhost:8000)
// momA 가 앱 글쓰기에서 '체험단·협찬' 을 체크해 올리면 DB sponsored=true, 앱 커뮤니티·웹 목록에 표시가 붙는다. 만든 글은 지운다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const A = await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, { 'Content-Type': 'application/json' }), body: JSON.stringify({ email: 'momA@dadamom.test', password: 'dadamom-test-1234' }) })).json();
const TXT = '협찬 표시 시험 ' + Date.now().toString(36);
const b = await chromium.launch(); const errs = []; let rows = [];
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('**/env.js*', r => r.fulfill({ contentType: 'text/javascript', body: env }));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8000/index.html'); await p.waitForTimeout(2000);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.fill('#auth-email', 'momA@dadamom.test'); await p.fill('#auth-password', 'dadamom-test-1234');
  await p.click('#auth-password-submit'); await p.waitForTimeout(4500);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.evaluate(() => { location.hash = '#home'; }); await p.waitForTimeout(1200);
  ok('앱 첫 화면: 아이 사진이 안전한 곳', (await p.textContent('#screen-home').catch(() => '') || await p.textContent('body')).includes('아이 사진이 안전한 곳'));
  await p.evaluate(() => { location.hash = '#challenge'; }); await p.waitForTimeout(2000);
  await p.click('[data-challenge-open="firststep"]'); await p.waitForTimeout(800);
  ok('앱 챌린지: 규칙 전체 보기(원본 확인·경품 세금)', /원본 확인/.test(await p.textContent('#challenge-example')) && /세금/.test(await p.textContent('#challenge-example')));
  await p.evaluate(() => { location.hash = '#community'; }); await p.waitForTimeout(1500);
  await p.locator('[data-open-compose]:visible').first().click({ timeout: 3000 }).catch(e => console.log('  (글쓰기 버튼: ' + e.message.split('\n')[0] + ')'));
  await p.waitForTimeout(800);
  const hasForm = await p.locator('#post-sponsored').count();
  ok('앱 글쓰기에 체험단·협찬 체크', hasForm === 1);
  ok('앱 글쓰기에 이름 숨기기·민감한 사진 체크 (13번)', await p.locator('#post-anon').count() === 1 && await p.locator('#post-sensitive').count() === 1);
  if (hasForm) {
    await p.locator('#post-topic-group [data-post-topic]').first().click();
    await p.fill('#post-text', TXT); await p.check('#post-sponsored'); await p.check('#post-anon'); await p.check('#post-sensitive'); await p.check('#post-consent');
    await p.click('#post-submit'); await p.waitForTimeout(5000);
  }
  rows = await (await fetch(U + '/rest/v1/community_posts?select=id,sponsored,status,author,sensitive&text=like.*' + encodeURIComponent(TXT), { headers: h(A.access_token) })).json();
  ok('DB: sponsored·sensitive = true, 이름은 익명', rows.length === 1 && rows[0].sponsored === true && rows[0].sensitive === true && /^익명/.test(rows[0].author), JSON.stringify(rows));
  await p.evaluate(() => { location.hash = '#home'; }); await p.waitForTimeout(300); await p.evaluate(() => { location.hash = '#community'; }); await p.waitForTimeout(2500);
  ok('앱 커뮤니티에 제품 제공받음 표시', await p.locator('span.pill', { hasText: /^제품 제공받음$/ }).count() >= 1);
  const w = await ctx.newPage(); w.on('pageerror', e => errs.push(e.message));
  await w.goto('http://localhost:8000/community.html#/b/all'); await w.waitForTimeout(3500);
  ok('웹 목록에 제품 제공받음 표시', await w.locator('span', { hasText: /^제품 제공받음$/ }).count() >= 1);
  ok('웹 첫 화면 안전 안내', await (async () => { await w.goto('http://localhost:8000/community.html#/'); await w.waitForTimeout(2500); return (await w.textContent('body')).includes('아이 사진이 안전한 곳'); })());
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  for (const r of rows) await fetch(U + '/rest/v1/community_posts?id=eq.' + r.id, { method: 'DELETE', headers: h(A.access_token) });
  await b.close();
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
