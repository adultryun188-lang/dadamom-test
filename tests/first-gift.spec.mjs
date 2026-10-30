// 0051 첫 참가 선물 명단(운영자만) → 실제 테스트 DB. node tests/first-gift.spec.mjs  (읽기만 함)
import fs from 'node:fs';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const h = t => ({ apikey: K, Authorization: 'Bearer ' + (t || K), 'Content-Type': 'application/json' });
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const ADM = await login('admin@dadamom.test'), A = await login('momA@dadamom.test');
// 테스트 데이터는 지난 달에 있을 수 있어 최근 12달 중 명단이 있는 달을 찾는다
let rows = [], month = '';
for (let i = 0; i < 12 && !rows.length; i++) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); month = d.toISOString().slice(0, 7);
  const r = await fetch(U + '/rest/v1/rpc/admin_first_gift', { method: 'POST', headers: h(ADM.access_token), body: JSON.stringify({ p_month: month }) });
  rows = r.ok ? await r.json() : [];
}
ok('운영자는 명단을 봄', rows.length > 0, month + ' ' + rows.length + '명');
ok('한 사람에 한 줄', new Set(rows.map(r => r.owner_id)).size === rows.length);
ok('순번이 1부터 이어짐', rows.every((r, i) => r.rn === i + 1));
ok('운영자 본인은 빠짐', !rows.some(r => r.email === 'admin@dadamom.test'));
ok('30명 이하', rows.length <= 30);
const no = await fetch(U + '/rest/v1/rpc/admin_first_gift', { method: 'POST', headers: h(A.access_token), body: '{}' });
ok('회원은 못 봄', no.status >= 400, 'HTTP ' + no.status);
const anon = await fetch(U + '/rest/v1/rpc/admin_first_gift', { method: 'POST', headers: h(null), body: '{}' });
ok('비로그인은 못 봄', anon.status >= 400, 'HTTP ' + anon.status);
console.log(failed ? `\n${failed}개 실패` : '\n첫 참가 선물 명단(0051) 통과 (실제 테스트 DB)');
process.exit(failed ? 1 : 0);
