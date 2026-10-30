// 0048 체험단 신청의 육아기록 연속 일수 → 실제 테스트 DB. node tests/trial-streak.spec.mjs  (넣은 신청은 끝에 지운다)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0, passed = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); c ? passed++ : failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), 'Content-Type': 'application/json', ...x });
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test'), ADM = await login('admin@dadamom.test');
const key = 'streak-test-' + Date.now();
const ins = (t, id, n) => fetch(U + '/rest/v1/benefit_applications', { method: 'POST', headers: h(t, { Prefer: 'return=minimal' }), body: JSON.stringify({ id, trial_key: key, nickname: 't', region: 't', care_streak: n }) });
const idA = randomUUID(), idB = randomUUID();
try {
  ok('A 신청 (2일)', (await ins(A.access_token, idA, 2)).status === 201);
  ok('B 신청 (9일)', (await ins(B.access_token, idB, 9)).status === 201);
  ok('60일 넘는 값은 막힘', (await ins(A.access_token, randomUUID(), 99)).status >= 400);
  const rows = (await (await fetch(U + '/rest/v1/rpc/admin_applications', { method: 'POST', headers: h(ADM.access_token), body: '{}' })).json()).filter(r => r.trial_key === key);
  ok('운영자 목록에 일수가 보임', rows.length === 2 && rows.some(r => r.care_streak === 9), JSON.stringify(rows.map(r => r.care_streak)));
  ok('7일 넘은 분이 먼저', rows[0] && rows[0].care_streak === 9);
  const notAdmin = await (await fetch(U + '/rest/v1/rpc/admin_applications', { method: 'POST', headers: h(A.access_token), body: '{}' })).json();
  ok('회원은 목록을 못 봄', Array.isArray(notAdmin) && notAdmin.length === 0);
} catch (e) { failed++; console.log('FAIL 중단: ' + e.message); }
finally {
  for (const [t, id] of [[A.access_token, idA], [B.access_token, idB]]) await fetch(U + '/rest/v1/benefit_applications?id=eq.' + id, { method: 'DELETE', headers: h(t) });
  const left = await (await fetch(U + '/rest/v1/rpc/admin_applications', { method: 'POST', headers: h(ADM.access_token), body: '{}' })).json();
  if (left.some(r => r.trial_key === key)) console.log('주의: 시험 신청이 남음 (trial_key ' + key + ')');
}
console.log(failed ? `\n${failed}개 실패` : `\n체험단 연속 일수(0048) ${passed}개 통과 (실제 테스트 DB)`);
process.exit(failed ? 1 : 0);
