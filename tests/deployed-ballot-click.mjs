// node tests/deployed-ballot-click.mjs — 배포본(테스트)에서 투표 버튼을 실제로 눌러 화면·DB 대조, 다시 눌러 되돌림. 규칙 문구도 확인.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'https://adultryun188-lang.github.io/dadamom-test/';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
if (!U.includes('srxdtddrtnhtlbbviyvs')) throw new Error('STOP');
const sess = await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'momB@dadamom.test', password: 'dadamom-test-1234' }) })).json();
const ref = new URL(U).hostname.split('.')[0];
const myBallots = async () => (await (await fetch(U + '/rest/v1/entry_ballots?select=entry_id,challenge_key&voter_id=eq.' + sess.user.id, { headers: { apikey: K, Authorization: 'Bearer ' + sess.access_token } })).json());
let bad = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
const b = await chromium.launch();
for (const [name, path] of [['앱', 'index.html?nc=' + Date.now() + '#challenge'], ['웹', 'community.html?nc=' + Date.now() + '#/challenge']]) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await c.newPage();
  await p.addInitScript(([s, r]) => { localStorage.setItem('sb-' + r + '-auth-token', JSON.stringify(s)); }, [sess, ref]);
  await p.goto(BASE + path); await p.waitForTimeout(5000);
  // 규칙 보기를 열어 문구 확인
  const html = await p.content();
  ok(name + ': 새 규칙 문구가 들어 있음', html.includes('이메일로 가입한 분은 다음 날부터 투표할 수 있어요'));
  ok(name + ': 옛 7일 문구가 없음', !html.includes('가입 7일이 지나야 투표'));
  // 카드를 눌러 투표 버튼이 나오게 (상세가 필요하면)
  let btn = p.locator('[data-ballot]:visible').first();
  for (const key of ['cheeks', 'firststep', 'crawl', 'bump']) {
    if (await btn.count()) break;
    if (name === '앱') { const go = p.locator('[data-challenge-open="' + key + '"]:visible, [data-challenge-pick="' + key + '"]:visible').first(); if (!(await go.count())) continue; await go.click(); }
    else { await p.goto(BASE + 'community.html?nc=' + Date.now() + '#/challenge?c=' + key); }
    await p.waitForTimeout(4000);
    btn = p.locator('[data-ballot]:visible').first();
    if (!(await btn.count()) && name === '앱') { const back = p.locator('[data-challenge-back]:visible').first(); if (await back.count()) { await back.click(); await p.waitForTimeout(1500); } }
  }
  if (!(await btn.count())) { ok(name + ': 투표 버튼 찾음', false); await c.close(); continue; }
  const id = await btn.getAttribute('data-ballot');
  const before = (await myBallots()).some(x => x.entry_id === id), t0 = (await btn.innerText()).trim();
  await btn.click(); await p.waitForTimeout(3500);
  const btn2 = p.locator('[data-ballot="' + id + '"]:visible').first();
  const mid = (await myBallots()).some(x => x.entry_id === id), t1 = (await btn2.count()) ? (await btn2.innerText()).trim() : '(버튼 사라짐)';
  ok(name + ': DB 에 표가 바뀜', mid !== before, before + ' → ' + mid);
  ok(name + ': 화면 글자 = DB', mid ? /투표함|투표했어요/.test(t1) : !/투표함|투표했어요/.test(t1), '"' + t0 + '" → "' + t1 + '"');
  if (await btn2.count()) { await btn2.click(); await p.waitForTimeout(3500); }
  const end = (await myBallots()).some(x => x.entry_id === id);
  ok(name + ': 다시 누르면 원래대로', end === before);
  await c.close();
}
await b.close();
console.log(bad ? `\n${bad}개 실패` : '\n전부 통과');
process.exit(bad ? 1 : 0);

