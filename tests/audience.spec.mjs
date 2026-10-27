// '회원만' 글(0039) → 실제 테스트 DB. node tests/audience.spec.mjs
// momA 가 회원만 사진 글을 올리면: 다른 회원은 글·사진을 보고, 비로그인은 글도 사진도 못 본다. 만든 것은 지운다.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, { 'Content-Type': 'application/json' }), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test');
const id = crypto.randomUUID(), mp = A.user.id + '/aud-' + Date.now() + '.jpg';
try {
  const up = await fetch(U + '/storage/v1/object/media/' + mp, { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'image/jpeg' }), body: Buffer.from('test') });
  const r = await fetch(U + '/rest/v1/community_posts', { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ id, author: '시험', text: '회원만 시험 글', media_path: mp, audience: 'members' }) });
  ok('회원만 사진 글 올림 (믿을 만한 회원이라 바로 공개)', up.ok && r.ok, 'HTTP ' + r.status);
  const read = async t => (await (await fetch(U + '/rest/v1/community_posts?select=id,audience,status&id=eq.' + id, { headers: h(t) })).json());
  const asB = await read(B.access_token), asAnon = await read(null);
  ok('다른 회원은 글이 보임', asB.length === 1 && asB[0].audience === 'members' && asB[0].status === 'approved', JSON.stringify(asB));
  ok('비로그인은 글이 안 보임', Array.isArray(asAnon) && asAnon.length === 0, JSON.stringify(asAnon));
  const sign = async t => (await fetch(U + '/storage/v1/object/sign/media/' + mp, { method: 'POST', headers: h(t, { 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 60 }) })).status;
  const sB = await sign(B.access_token), sAnon = await sign(null);
  ok('다른 회원은 사진 링크를 받음', sB === 200, 'HTTP ' + sB);
  ok('비로그인은 사진 링크를 못 받음', sAnon !== 200, 'HTTP ' + sAnon);
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  await fetch(U + '/rest/v1/community_posts?id=eq.' + id, { method: 'DELETE', headers: h(A.access_token) });
  await fetch(U + '/storage/v1/object/media/' + mp, { method: 'DELETE', headers: h(A.access_token) });
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
