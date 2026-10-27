// 0029: 회원이 검수 없이 공개·숫자 꾸미기·날짜 되돌리기를 못 하는지 (실제 테스트 DB). node tests/force-review.spec.mjs
// 공개 여부는 0034 서버 규칙이 정한다 — 그래서 일부러 링크를 넣어 '대기'가 나와야 하는 글로 시험한다. 만든 행은 끝에서 지운다.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const h = (t, pref = 'return=minimal') => ({ apikey: K, Authorization: 'Bearer ' + (t || K), 'Content-Type': 'application/json', Prefer: pref });
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const B = await login('momB@dadamom.test'), ADM = await login('admin@dadamom.test');
const get = async (path, t) => (await fetch(U + '/rest/v1/' + path, { headers: h(t) })).json();
const cleanup = []; let mp = '';
try {
  const eid = crypto.randomUUID();
  // 볼살은 사진만 받는다 (0035) — 사진 파일이 있어야 참가작을 넣을 수 있다
  mp = B.user.id + '/force-' + Date.now() + '.jpg';
  await fetch(U + '/storage/v1/object/media/' + mp, { method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + B.access_token, 'Content-Type': 'image/jpeg' }, body: Buffer.from('test') });
  await fetch(U + '/rest/v1/challenge_entries', { method: 'POST', headers: h(B.access_token), body: JSON.stringify({ id: eid, name: 'x', note: 'force test https://x.example', media_path: mp, challenge_key: 'cheeks', status: 'approved', votes: 999, created_at: '2020-01-01T00:00:00Z' }) });
  cleanup.push('challenge_entries?id=eq.' + eid);
  const e = (await get('challenge_entries?select=status,votes,created_at&id=eq.' + eid, B.access_token))[0];
  ok('참가작: approved 로 넣어도 서버 규칙대로 (링크 있음 → 대기)', e && e.status === 'pending', JSON.stringify(e));
  ok('참가작: 응원 수 999 → 0', e && e.votes === 0);
  ok('참가작: 날짜를 2020 으로 넣어도 지금', e && e.created_at > '2026');

  const pid = crypto.randomUUID();
  await fetch(U + '/rest/v1/community_posts', { method: 'POST', headers: h(B.access_token), body: JSON.stringify({ id: pid, author: 'x', text: 'force test https://x.example', status: 'approved', likes: 999, comments: 50 }) });
  cleanup.push('community_posts?id=eq.' + pid);
  const p = (await get('community_posts?select=status,likes,comments&id=eq.' + pid, B.access_token))[0];
  ok('글: approved 로 넣어도 서버 규칙대로 (링크 있음 → 대기)', p && p.status === 'pending', JSON.stringify(p));
  ok('글: 좋아요·댓글 수 0', p && p.likes === 0 && p.comments === 0);

  // 응원 날짜 되돌리기: 공개된 참가작이 있어야 응원할 수 있다 → 관리자가 승인
  await fetch(U + '/rest/v1/challenge_entries?id=eq.' + eid, { method: 'PATCH', headers: h(ADM.access_token), body: JSON.stringify({ status: 'approved' }) });
  const vr = await fetch(U + '/rest/v1/entry_votes', { method: 'POST', headers: h(ADM.access_token), body: JSON.stringify({ entry_id: eid, created_at: '2026-01-15T00:00:00Z' }) });
  const hall = await (await fetch(U + '/rest/v1/rpc/challenge_hall', { method: 'POST', headers: h(B.access_token), body: JSON.stringify({ p_months: 12 }) })).json();
  ok('응원 날짜를 1월로 넣어도 1월 순위에 안 들어감', vr.status < 300 && !hall.some(x => x.month === '2026-01'), 'vote HTTP ' + vr.status);

  // 관리자는 그대로 (공지성 글 등)
  const aid = crypto.randomUUID();
  await fetch(U + '/rest/v1/community_posts', { method: 'POST', headers: h(ADM.access_token), body: JSON.stringify({ id: aid, author: '다다란운영자', text: 'admin test', status: 'approved' }) });
  cleanup.push('community_posts?id=eq.' + aid);
  const a = (await get('community_posts?select=status&id=eq.' + aid, ADM.access_token))[0];
  ok('관리자가 올린 글은 바로 공개 그대로', a && a.status === 'approved');
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message); }
finally {
  for (const c of cleanup) await fetch(U + '/rest/v1/' + c, { method: 'DELETE', headers: h(ADM.access_token) });
  await fetch(U + '/storage/v1/object/media/' + mp, { method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + B.access_token } }).catch(() => {});
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
