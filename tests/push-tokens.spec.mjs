// 0046 푸시 토큰 표 → 실제 테스트 DB. node tests/push-tokens.spec.mjs  (가짜 토큰을 넣고 끝에 지운다)
import fs from 'node:fs';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0, passed = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); c ? passed++ : failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x }); const J = { 'Content-Type': 'application/json' };
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, J), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test');
const tok = 'test-token-' + Date.now() + '-xxxxxxxxxxxxxxxxxxxx';
const reg = async (t, p) => (await fetch(U + '/rest/v1/rpc/register_push_token', { method: 'POST', headers: h(t, J), body: JSON.stringify({ p_token: tok, p_platform: p }) })).status;
const rows = async t => (await (await fetch(U + '/rest/v1/push_tokens?select=user_id,platform&token=eq.' + encodeURIComponent(tok), { headers: h(t) })).json());
try {
  ok('A 가 토큰 등록', [200, 204].includes(await reg(A.access_token, 'web')));
  let r = await rows(A.access_token);
  ok('A 는 내 토큰이 보임', r.length === 1 && r[0].user_id === A.user.id, JSON.stringify(r));
  ok('B 는 A 의 토큰을 못 봄', (await rows(B.access_token)).length === 0);
  ok('비로그인은 등록 못 함', ![200, 204].includes(await reg(null, 'web')));
  ok('이상한 플랫폼은 막힘', ![200, 204].includes(await reg(A.access_token, 'fax')));
  ok('같은 기기를 B 가 쓰면 B 로 넘어감', [200, 204].includes(await reg(B.access_token, 'android')));
  r = await rows(B.access_token);
  ok('이제 B 의 토큰', r.length === 1 && r[0].user_id === B.user.id && r[0].platform === 'android', JSON.stringify(r));
  ok('A 에게서는 사라짐', (await rows(A.access_token)).length === 0);
  const direct = await fetch(U + '/rest/v1/push_tokens', { method: 'POST', headers: h(A.access_token, { ...J, Prefer: 'return=minimal' }), body: JSON.stringify({ token: tok + 'z', user_id: B.user.id, platform: 'web' }) });
  ok('남의 이름으로 직접 넣기 막힘', direct.status >= 400, 'HTTP ' + direct.status);
} catch (e) { failed++; console.log('FAIL 중단: ' + e.message); }
finally {
  await fetch(U + '/rest/v1/push_tokens?token=eq.' + encodeURIComponent(tok), { method: 'DELETE', headers: h(B.access_token) });
  await fetch(U + '/rest/v1/push_tokens?token=eq.' + encodeURIComponent(tok), { method: 'DELETE', headers: h(A.access_token) });
}
console.log(failed ? `\n${failed}개 실패` : `\n푸시 토큰(0046) ${passed}개 통과 (실제 테스트 DB)`);
process.exit(failed ? 1 : 0);
