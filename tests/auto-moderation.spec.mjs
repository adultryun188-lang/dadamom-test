// 자동 검수(0034) → 실제 테스트 DB. node tests/auto-moderation.spec.mjs
// 글만 있는 깨끗한 글은 바로 공개, 연락처가 있으면 대기, 믿을 만한 회원의 사진 글은 바로 공개,
// 3명이 신고하면 내려가고, 신고받은 회원은 다시 검수 대상. 만든 것은 지우고 신고는 기각 처리한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, { 'Content-Type': 'application/json' }), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test'), C = await login('dadC@dadamom.test'), M = await login('admin@dadamom.test');
const tag = Date.now().toString(36), posts = [], entries = [], files = [], reports = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadamom-mod-')), jpg = path.join(dir, 'p.jpg');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=pink:s=320x240', '-frames:v', '1', jpg]);
const upload = async () => {
  const p = `${A.user.id}/mod-${tag}-${files.length}.jpg`;
  const r = await fetch(U + '/storage/v1/object/media/' + p, { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'image/jpeg' }), body: fs.readFileSync(jpg) });
  if (r.ok) files.push(p);
  return p;
};
const post = async (text, media_path = null) => {
  const id = crypto.randomUUID(); posts.push(id);
  const r = await fetch(U + '/rest/v1/community_posts', { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({ id, author: '시험', text: text + ' ' + tag, media_path }) });
  return r.ok ? id : null;
};
const status = async (table, id) => ((await (await fetch(U + `/rest/v1/${table}?select=status&id=eq.${id}`, { headers: h(M.access_token) })).json())[0] || {}).status;
try {
  const p1 = await post('오늘 2026-10-27 첫 이유식 먹었어요');
  ok('글만 있는 깨끗한 글 → 바로 공개 (날짜는 막지 않음)', await status('community_posts', p1) === 'approved');
  const p2 = await post('궁금하면 연락주세요 010-1234-5678');
  ok('전화번호 들어간 글 → 검수 대기', await status('community_posts', p2) === 'pending');
  const p3 = await post('여기 보세요 https://example.com');
  ok('링크 들어간 글 → 검수 대기', await status('community_posts', p3) === 'pending');
  const p4 = await post('오늘 산책 사진', await upload());
  ok('믿을 만한 회원의 사진 글 → 바로 공개', await status('community_posts', p4) === 'approved');
  for (const R of [B, C, M]) {
    const r = await fetch(U + '/rest/v1/reports', { method: 'POST', headers: h(R.access_token, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ target_type: 'post', target_id: p1, target_owner: A.user.id, reason: '시험 ' + tag }) });
    if (r.ok) reports.push(R.user.id);
  }
  ok('3명이 신고 → 글이 검수 대기로 내려감', reports.length === 3 && await status('community_posts', p1) === 'pending');
  const p5 = await post('신고받은 뒤 사진 글', await upload());
  ok('신고받은 회원의 사진 글 → 다시 검수 대기', await status('community_posts', p5) === 'pending');
  const eid = crypto.randomUUID();
  const er = await fetch(U + '/rest/v1/challenge_entries', { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ id: eid, name: '시험', age: '시험', note: 'mod ' + tag, media_path: files[1], challenge_key: 'halloween' }) });
  if (er.ok) entries.push(eid);
  ok('신고받은 회원의 참가작 → 검수 대기', await status('challenge_entries', eid) === 'pending');
  const anonWords = await fetch(U + '/rest/v1/mod_words?select=word', { headers: h(null) });
  const memberWords = await (await fetch(U + '/rest/v1/mod_words?select=word', { headers: h(B.access_token) })).json();
  ok('금지어 목록은 비로그인·일반 회원이 못 봄', !anonWords.ok || (await anonWords.json()).length === 0) ;
  ok('  (일반 회원 0개)', Array.isArray(memberWords) && memberWords.length === 0, JSON.stringify(memberWords).slice(0, 80));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  await fetch(U + `/rest/v1/reports?reason=eq.${encodeURIComponent('시험 ' + tag)}`, { method: 'PATCH', headers: h(M.access_token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ status: 'dismissed' }) });
  for (const id of posts) await fetch(U + '/rest/v1/community_posts?id=eq.' + id, { method: 'DELETE', headers: h(A.access_token) });
  for (const id of entries) await fetch(U + '/rest/v1/challenge_entries?id=eq.' + id, { method: 'DELETE', headers: h(A.access_token) });
  for (const f of files) await fetch(U + '/storage/v1/object/media/' + f, { method: 'DELETE', headers: h(A.access_token) });
  const left = await (await fetch(U + `/rest/v1/reports?select=status&reason=eq.${encodeURIComponent('시험 ' + tag)}`, { headers: h(M.access_token) })).json();
  ok('정리: 시험 신고는 모두 기각 처리', left.every(r => r.status === 'dismissed'), JSON.stringify(left));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
