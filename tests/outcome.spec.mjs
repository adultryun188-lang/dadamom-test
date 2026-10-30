// 0045 질문 해결 후기 → 실제 테스트 DB. node tests/outcome.spec.mjs
// momA 가 [질문] 글을 쓰고 후기를 남김. 남의 글·말머리 없는 글·링크/전화·길이·직접 UPDATE 를 막는지 확인. 만든 글은 지운다.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0, passed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); c ? passed++ : failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const J = { 'Content-Type': 'application/json' };
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, J), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const rpc = async (t, b) => { const r = await fetch(U + '/rest/v1/rpc/set_post_outcome', { method: 'POST', headers: h(t, J), body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test');
const q = crypto.randomUUID(), plain = crypto.randomUUID();
const mk = (id, text) => fetch(U + '/rest/v1/community_posts', { method: 'POST', headers: h(A.access_token, { ...J, Prefer: 'return=minimal' }), body: JSON.stringify({ id, author: '시험', text, stage: 'parenting', age_value: 9 }) });
const read = async id => ((await (await fetch(U + '/rest/v1/community_posts?select=outcome,outcome_at&id=eq.' + id, { headers: h(A.access_token) })).json())[0]) || {};
try {
  ok('질문 글 작성', (await mk(q, '[질문] 시험 이유식 거부\n어떻게 하세요?')).ok);
  ok('말머리 없는 글 작성', (await mk(plain, '[자랑] 시험 자랑 글')).ok);
  let r = await rpc(A.access_token, { p_post: q, p_outcome: '숟가락을 바꾸니 먹기 시작했어요' });
  ok('본인 질문 글에 후기 저장', r.status === 200 && !!r.body, JSON.stringify(r));
  let row = await read(q);
  ok('후기와 시각이 글에 남음', row.outcome === '숟가락을 바꾸니 먹기 시작했어요' && !!row.outcome_at, JSON.stringify(row));
  r = await rpc(B.access_token, { p_post: q, p_outcome: '남이 쓰는 후기입니다' });
  ok('남의 글엔 못 씀', r.status >= 400 && /NOT_FOUND/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  r = await rpc(A.access_token, { p_post: plain, p_outcome: '자랑 글 후기입니다' });
  ok('질문·고민이 아닌 글엔 못 씀', r.status >= 400 && /NOT_QUESTION/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  r = await rpc(A.access_token, { p_post: q, p_outcome: '여기서 샀어요 https://shop.example.com' });
  ok('링크는 막힘', r.status >= 400 && /NO_LINK/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  r = await rpc(A.access_token, { p_post: q, p_outcome: '연락 주세요 010-1234-5678' });
  ok('전화번호는 막힘', r.status >= 400 && /NO_LINK/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  r = await rpc(A.access_token, { p_post: q, p_outcome: '짧음' });
  ok('너무 짧으면 막힘', r.status >= 400 && /BAD_LENGTH/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  r = await rpc(null, { p_post: q, p_outcome: '비로그인 후기입니다' });
  ok('비로그인은 못 씀', r.status >= 400, 'HTTP ' + r.status);
  await fetch(U + '/rest/v1/community_posts?id=eq.' + q, { method: 'PATCH', headers: h(A.access_token, { ...J, Prefer: 'return=minimal' }), body: JSON.stringify({ outcome: '직접 바꾸기 시도입니다' }) });
  row = await read(q);
  ok('직접 UPDATE 로는 못 바꿈 (값 다시 읽어 확인)', row.outcome === '숟가락을 바꾸니 먹기 시작했어요', JSON.stringify(row));
  r = await rpc(A.access_token, { p_post: q, p_outcome: null });
  row = await read(q);
  ok('후기 지우기(null)', r.status === 200 && row.outcome == null && row.outcome_at == null, JSON.stringify(row));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  for (const id of [q, plain]) await fetch(U + '/rest/v1/community_posts?id=eq.' + id, { method: 'DELETE', headers: h(A.access_token) });
}
console.log(failed ? `\n${failed}개 실패 / ${passed} 통과` : `\n해결 후기(0045) ${passed}개 통과 (실제 테스트 DB)`);
process.exit(failed ? 1 : 0);
