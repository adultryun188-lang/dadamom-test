// 응원·투표 부탁 링크 → 로컬 앱 + 실제 테스트 DB. node tests/ask-vote.spec.mjs [base]
// momA 의 승인된 참가작에 '부탁하기' 버튼, 링크를 momB 가 열면 그 참가작 창 + 응원/투표 버튼, 비로그인은 로그인 안내.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://localhost:8000/';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test');
const ref = new URL(U).hostname.split('.')[0];
const mine = await (await fetch(U + '/rest/v1/challenge_entries?select=id,name&status=eq.approved&owner_id=eq.' + A.user.id + '&limit=1', { headers: { apikey: K, Authorization: 'Bearer ' + A.access_token } })).json();
let failed = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
if (!mine[0]) { console.log('SKIP momA 의 승인된 참가작이 없음'); process.exit(0); }
const id = mine[0].id;
const b = await chromium.launch();
async function page(sess) {
  const c = await b.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([s, r]) => { if (s) localStorage.setItem('sb-' + r + '-auth-token', JSON.stringify(s)); }, [sess, ref]);
  return { c, p, errs };
}
// momA: 내 참가작에 부탁 버튼, 누르면 링크 복사(공유 창 없는 환경)
{
  const { c, p, errs } = await page(A);
  await p.addInitScript(() => { try { delete Navigator.prototype.share; } catch (e) {} navigator.share = undefined; });
  await p.goto(base + 'index.html#challenge'); await p.waitForTimeout(3500);
  await p.evaluate(k => { const b = document.querySelector('[data-challenge-open="' + k + '"]'); if (b) b.click(); }, (await (await fetch(U + '/rest/v1/challenge_entries?select=challenge_key&id=eq.' + id, { headers: { apikey: K, Authorization: 'Bearer ' + A.access_token } })).json())[0].challenge_key);
  await p.waitForTimeout(1500);
  const btn = p.locator('[data-ask-vote="' + id + '"]');
  ok('내 참가작에 응원·투표 부탁하기 버튼', await btn.count() === 1);
  if (await btn.count()) { await btn.click(); await p.waitForTimeout(800); }
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok('링크가 복사됨 (?entry=…#challenge)', clip.includes('?entry=' + id) && clip.includes('#challenge'), clip.slice(0, 120));
  ok('A JS 오류 없음', errs.length === 0, errs.join(' / '));
  await c.close();
}
// momB: 링크 열면 그 참가작 창
{
  const { c, p, errs } = await page(B);
  await p.goto(base + 'index.html?entry=' + id + '#challenge'); await p.waitForTimeout(5000);
  const txt = await p.evaluate(() => (document.getElementById('modal-card') || {}).innerText || '');
  ok('받은 사람에게 그 참가작 창이 뜸', txt.includes(mine[0].name) && txt.includes('응원 부탁을 받았어요'), txt.slice(0, 80).replace(/\n/g, ' '));
  ok('창에 응원·투표 버튼', await p.locator('#modal-card [data-vote="' + id + '"]').count() === 1 && await p.locator('#modal-card [data-ballot="' + id + '"]').count() === 1);
  ok('주소에서 entry 를 지움', !p.url().includes('entry='), p.url());
  ok('B JS 오류 없음', errs.length === 0, errs.join(' / '));
  await c.close();
}
// 비로그인: 로그인 안내, 기기에 기억
{
  const { c, p, errs } = await page(null);
  await p.goto(base + 'index.html?entry=' + id + '#challenge'); await p.waitForTimeout(4500);
  const txt = await p.evaluate(() => (document.getElementById('modal-card') || {}).innerText || '');
  ok('비로그인은 로그인 안내 창', txt.includes('응원 부탁을 받았어요') && txt.includes('로그인'), txt.slice(0, 60).replace(/\n/g, ' '));
  ok('로그인 뒤 열도록 기기에 기억', (await p.evaluate(() => localStorage.getItem('dadamom.askEntry'))) === id);
  ok('비로그인 JS 오류 없음', errs.length === 0, errs.join(' / '));
  await c.close();
}
await b.close();
console.log(failed ? `\n${failed}개 실패` : '\n응원·투표 부탁 링크 통과');
process.exit(failed ? 1 : 0);
