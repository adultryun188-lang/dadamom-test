// 0054 서버 쪽 입력 제한 → 실제 테스트 DB. node tests/input-limits.spec.mjs  (넣은 것은 끝에 지운다)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0, passed = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); c ? passed++ : failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), 'Content-Type': 'application/json', ...x });
const A = await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null), body: JSON.stringify({ email: 'momA@dadamom.test', password: 'dadamom-test-1234' }) })).json();
const T = A.access_token, me = A.user.id;
const post = (await (await fetch(U + '/rest/v1/community_posts?select=id&status=eq.approved&limit=1', { headers: h(T) })).json())[0];
const long = n => '가'.repeat(n);
const ins = (tbl, row) => fetch(U + '/rest/v1/' + tbl, { method: 'POST', headers: h(T, { Prefer: 'return=minimal' }), body: JSON.stringify(row) });
const made = [];
try {
  const okId = randomUUID();
  let r = await ins('post_comments', { id: okId, post_id: post.id, content: '시험 댓글', author: '하람이맘' });
  ok('보통 댓글은 들어감', r.status === 201, 'HTTP ' + r.status); if (r.status === 201) made.push(okId);
  r = await ins('post_comments', { id: randomUUID(), post_id: post.id, content: long(1001), author: '하람이맘' });
  ok('1001자 댓글은 막힘', r.status >= 400, 'HTTP ' + r.status);
  const lid = randomUUID();
  r = await ins('post_comments', { id: lid, post_id: post.id, content: '시험', author: long(31) });
  if (r.status === 201) made.push(lid);
  const la = (await (await fetch(U + '/rest/v1/post_comments?select=author&id=eq.' + lid, { headers: h(T) })).json())[0];
  ok('31자 작성자 이름은 들어가지 않음 (막히거나 닉네임으로 바뀜)', r.status >= 400 || (la && la.author.length <= 30), 'HTTP ' + r.status + ' ' + (la ? la.author : ''));
  const prof = (await (await fetch(U + '/rest/v1/profiles?select=nickname,birth_month&id=eq.' + me, { headers: h(T) })).json())[0];
  await fetch(U + '/rest/v1/profiles?id=eq.' + me, { method: 'PATCH', headers: h(T), body: JSON.stringify({ nickname: long(21) }) });
  let now = (await (await fetch(U + '/rest/v1/profiles?select=nickname&id=eq.' + me, { headers: h(T) })).json())[0];
  ok('21자 닉네임은 안 바뀜', now.nickname === prof.nickname, now.nickname.slice(0, 10));
  await fetch(U + '/rest/v1/profiles?id=eq.' + me, { method: 'PATCH', headers: h(T), body: JSON.stringify({ birth_month: '<script>' }) });
  now = (await (await fetch(U + '/rest/v1/profiles?select=birth_month&id=eq.' + me, { headers: h(T) })).json())[0];
  ok('이상한 생년월은 안 바뀜', now.birth_month === prof.birth_month, String(now.birth_month));
  await fetch(U + '/rest/v1/profiles?id=eq.' + me, { method: 'PATCH', headers: h(T), body: JSON.stringify({ nickname: '다다맘운영자' }) });
  now = (await (await fetch(U + '/rest/v1/profiles?select=nickname&id=eq.' + me, { headers: h(T) })).json())[0];
  ok('닉네임을 운영자로 못 바꿈 (0055)', now.nickname === prof.nickname, now.nickname);
  const fid = randomUUID();
  r = await ins('post_comments', { id: fid, post_id: post.id, content: '사칭 시험', author: '운영자' });
  if (r.status === 201) made.push(fid);
  const got = (await (await fetch(U + '/rest/v1/post_comments?select=author&id=eq.' + fid, { headers: h(T) })).json())[0];
  ok('댓글 작성자는 서버가 내 닉네임으로 (0055)', got && got.author === prof.nickname, got && got.author);
  r = await ins('reports', { target_type: 'post', target_id: post.id, reason: '시험', detail: long(1001) });
  ok('1001자 신고 내용은 막힘', r.status >= 400, 'HTTP ' + r.status);
} catch (e) { failed++; console.log('FAIL 중단: ' + e.message); }
finally { for (const id of made) await fetch(U + '/rest/v1/post_comments?id=eq.' + id, { method: 'DELETE', headers: h(T) }); }
console.log(failed ? `\n${failed}개 실패` : `\n서버 입력 제한(0054) ${passed}개 통과 (실제 테스트 DB)`);
process.exit(failed ? 1 : 0);
