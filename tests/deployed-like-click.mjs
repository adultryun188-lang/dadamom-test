// CLAUDE.md 8절: 배포본(테스트 사이트)에서 좋아요 버튼을 실제로 눌러 화면과 DB 를 대조. 누른 뒤 원래대로 되돌린다.
// node tests/deployed-like-click.mjs   (가상 계정 momB 세션을 주입, 비밀번호를 화면에 입력하지 않음)
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL || 'https://adultryun188-lang.github.io/dadamom-test/';
assert(BASE.includes('/dadamom-test/') || BASE.includes('localhost'), 'STOP: 테스트 사이트만');
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
const sess = await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'momB@dadamom.test', password: 'dadamom-test-1234' }) })).json();
const ref = new URL(U).hostname.split('.')[0];
const dbLikes = async id => ((await (await fetch(U + '/rest/v1/community_posts?select=likes&id=eq.' + id, { headers: { apikey: K, Authorization: 'Bearer ' + sess.access_token } })).json())[0] || {}).likes;
let failed = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await c.newPage();
await p.addInitScript(([s, r]) => { localStorage.setItem('sb-' + r + '-auth-token', JSON.stringify(s)); }, [sess, ref]);
for (const [where, hash] of [['홈', '#home'], ['커뮤니티', '#community']]) {
  await p.goto(BASE + 'index.html?nc=' + Date.now() + hash); await p.waitForTimeout(4000);
  const btn = p.locator('#screen-' + hash.slice(1) + ' [data-postlike]').first();
  if (!(await btn.count())) { ok(where + ' 좋아요 버튼 있음', false); continue; }
  const id = await btn.getAttribute('data-postlike');
  const read = async () => ({ pressed: await btn.getAttribute('aria-pressed'), text: (await btn.innerText()).replace(/\s+/g, ' ').trim() });
  const before = await read(), db0 = await dbLikes(id);
  await btn.click(); await p.waitForTimeout(3000);
  const mid = await read(), db1 = await dbLikes(id);
  ok(where + ' 누르면 화면 상태가 바뀜', mid.pressed !== before.pressed, before.pressed + ' → ' + mid.pressed);
  ok(where + ' 화면 숫자 = DB 숫자', mid.text.includes(String(db1)), '화면 "' + mid.text + '" / DB ' + db1);
  ok(where + ' DB 가 한 칸 움직임', Math.abs(db1 - db0) === 1, db0 + ' → ' + db1);
  await btn.click(); await p.waitForTimeout(3000);
  const db2 = await dbLikes(id), end = await read();
  ok(where + ' 다시 누르면 원래대로 (화면·DB)', db2 === db0 && end.pressed === before.pressed, 'DB ' + db2 + ', ' + end.pressed);
}
await b.close();
console.log(failed ? `\n${failed}개 실패` : '\n배포본 좋아요 클릭 확인 통과');
process.exit(failed ? 1 : 0);
