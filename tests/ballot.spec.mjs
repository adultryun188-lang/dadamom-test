// 챌린지 회원만 보기 + 투표(0041) → 실제 테스트 DB. node tests/ballot.spec.mjs
// momA 가 볼살 챌린지에 사진으로 참가 → 비로그인은 참가작·사진·주인공을 못 보고, momB 는 본다.
// momB 투표/취소/다시 투표, momA 는 내 것에 투표 못 함, 표를 직접 넣을 수 없음, 주인공 점수에 투표 5점. 만든 것은 지운다.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const J = { 'Content-Type': 'application/json' };
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, J), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const rpc = async (t, f, b) => { const r = await fetch(U + '/rest/v1/rpc/' + f, { method: 'POST', headers: h(t, J), body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test');
const id = crypto.randomUUID(), mp = A.user.id + '/ballot-' + Date.now() + '.jpg';
try {
  const up = await fetch(U + '/storage/v1/object/media/' + mp, { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'image/jpeg' }), body: Buffer.from('test') });
  const r = await fetch(U + '/rest/v1/challenge_entries', { method: 'POST', headers: h(A.access_token, { ...J, Prefer: 'return=minimal' }),
    body: JSON.stringify({ id, owner_id: A.user.id, name: '시험', age: '15개월', note: '투표 시험', media_path: mp, challenge_key: 'cheeks' }) });
  ok('momA 참가 (바로 공개)', up.ok && r.ok, 'HTTP ' + r.status);
  const read = async t => (await (await fetch(U + '/rest/v1/challenge_entries?select=id,status&id=eq.' + id, { headers: h(t) })).json());
  const asB = await read(B.access_token), asAnon = await read(null);
  ok('회원은 참가작이 보임', asB.length === 1 && asB[0].status === 'approved', JSON.stringify(asB));
  ok('비로그인은 참가작이 안 보임', Array.isArray(asAnon) && asAnon.length === 0, JSON.stringify(asAnon));
  const sign = async t => (await fetch(U + '/storage/v1/object/sign/media/' + mp, { method: 'POST', headers: h(t, J), body: JSON.stringify({ expiresIn: 60 }) })).status;
  ok('회원은 사진 링크를 받음', (await sign(B.access_token)) === 200);
  ok('비로그인은 사진 링크를 못 받음', (await sign(null)) !== 200);
  const hAnon = await rpc(null, 'challenge_hall', { p_months: 1 });
  ok('비로그인은 이달의 주인공을 못 봄', hAnon.status !== 200 || (Array.isArray(hAnon.body) && hAnon.body.length === 0), 'HTTP ' + hAnon.status);

  const v1 = await rpc(B.access_token, 'cast_ballot', { p_entry: id });
  ok('momB 투표', v1.body === 'voted', JSON.stringify(v1));
  const v2 = await rpc(B.access_token, 'cast_ballot', { p_entry: id });
  ok('같은 참가작을 다시 누르면 취소', v2.body === 'removed', JSON.stringify(v2));
  const v3 = await rpc(B.access_token, 'cast_ballot', { p_entry: id });
  ok('다시 투표', v3.body === 'voted', JSON.stringify(v3));
  const own = await rpc(A.access_token, 'cast_ballot', { p_entry: id });
  ok('내 참가작에는 투표 못 함', own.status >= 400 && /OWN_ENTRY/.test(JSON.stringify(own.body)), JSON.stringify(own.body));
  const anonV = await rpc(null, 'cast_ballot', { p_entry: id });
  ok('비로그인은 투표 못 함', anonV.status >= 400, 'HTTP ' + anonV.status);
  const month = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
  const direct = await fetch(U + '/rest/v1/entry_ballots', { method: 'POST', headers: h(A.access_token, { ...J, Prefer: 'return=minimal' }),
    body: JSON.stringify({ voter_id: A.user.id, challenge_key: 'cheeks', month: month + 'x', entry_id: id }) });
  ok('표를 직접 넣을 수 없음', direct.status >= 400, 'HTTP ' + direct.status);
  const mine = await (await fetch(U + '/rest/v1/entry_ballots?select=entry_id&month=eq.' + month + '&challenge_key=eq.cheeks', { headers: h(B.access_token) })).json();
  ok('내 표를 읽을 수 있음', mine.length === 1 && mine[0].entry_id === id, JSON.stringify(mine));
  const hall = await rpc(B.access_token, 'challenge_hall', { p_months: 1 });
  const row = (hall.body || []).find(x => x.entry_id === id);
  ok('주인공 점수에 투표 5점이 들어감', row && row.month_ballots === 1 && row.score >= 5, JSON.stringify(row || hall.body));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  await fetch(U + '/rest/v1/challenge_entries?id=eq.' + id, { method: 'DELETE', headers: h(A.access_token) });
  await fetch(U + '/storage/v1/object/media/' + mp, { method: 'DELETE', headers: h(A.access_token) });
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
