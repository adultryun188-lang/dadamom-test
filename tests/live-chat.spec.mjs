// 실시간 채팅(0057) → 실제 테스트 DB. node tests/live-chat.spec.mjs
// 비로그인 막힘, 길이·금지어·3초·같은 내용 거절(이유가 돌아옴), 남의 글 고치기·지우기 막힘(값을 다시 읽어 확인),
// 작성자 사칭 막힘, 차단한 사람 글 안 보임, 서로 다른 3명 신고 → 숨김. 만든 것은 관리자가 지우고 신고는 기각한다.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const J = { 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, J), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test'), C = await login('dadC@dadamom.test'), M = await login('admin@dadamom.test');
const tag = Date.now().toString(36), made = [], reports = [];

const send = async (who, body, extra = {}) => {
  const id = crypto.randomUUID();
  const r = await fetch(U + '/rest/v1/chat_messages', { method: 'POST', headers: h(who && who.access_token, { ...J, Prefer: 'return=minimal' }), body: JSON.stringify({ id, body, ...extra }) });
  const err = r.ok ? null : await r.json().catch(() => ({}));
  if (r.ok) made.push(id);
  return { ok: r.ok, status: r.status, id, code: err && err.message, hint: err && err.hint };
};
const read = async (who, id) => {
  const r = await fetch(U + '/rest/v1/chat_messages?select=id,body,user_id,nickname,hidden,is_master&id=eq.' + id, { headers: h(who && who.access_token) });
  return { status: r.status, rows: r.ok ? await r.json() : null };
};
const nick = async who => ((await (await fetch(U + '/rest/v1/profiles?select=nickname&id=eq.' + who.user.id, { headers: h(who.access_token) })).json())[0] || {}).nickname;

try {
  // 비로그인
  const anonRead = await fetch(U + '/rest/v1/chat_messages?select=id&limit=1', { headers: h(null) });
  const anonRows = anonRead.ok ? await anonRead.json() : null;
  ok('비로그인 읽기 막힘', !anonRead.ok || (Array.isArray(anonRows) && anonRows.length === 0), 'HTTP ' + anonRead.status);
  const anonSend = await send(null, '비로그인 ' + tag);
  ok('비로그인 쓰기 막힘', !anonSend.ok, 'HTTP ' + anonSend.status);

  // 정상 + 작성자 사칭
  const m1 = await send(A, '안녕하세요 ' + tag, { user_id: B.user.id, nickname: '운영자' });
  ok('로그인한 회원은 보낼 수 있음', m1.ok, 'HTTP ' + m1.status + ' ' + (m1.hint || ''));
  const r1 = await read(B, m1.id);
  const row = r1.rows && r1.rows[0];
  ok('다른 회원이 읽을 수 있음', !!row);
  ok('작성자는 서버가 채움 (남의 아이디·운영자 이름 무시)', row && row.user_id === A.user.id && row.nickname === ((await nick(A)) || '회원') && row.nickname !== '운영자', row && (row.user_id + ' / ' + row.nickname));

  // 거절과 이유
  await sleep(3200);
  const long = await send(A, 'ㄱ'.repeat(201));
  ok('201자 → 거절, 이유가 돌아옴', !long.ok && /CHAT_TOO_LONG/.test(long.code) && !!long.hint, long.code + ' / ' + long.hint);
  const bad = await send(A, '오픈채팅으로 오세요 ' + tag);
  ok('금지어 → 거절, 이유가 돌아옴', !bad.ok && /CHAT_BLOCKED_WORD/.test(bad.code) && !!bad.hint, bad.code + ' / ' + bad.hint);
  const link = await send(A, '여기 www.example.com ' + tag);
  ok('링크 → 거절', !link.ok && /CHAT_BLOCKED_WORD/.test(link.code), link.code);
  const m2 = await send(A, '두 번째 ' + tag);
  ok('3초 지나면 다시 보낼 수 있음', m2.ok, m2.code || '');
  const fast = await send(A, '세 번째 ' + tag);
  ok('3초 안 연속 → 거절, 이유가 돌아옴', !fast.ok && /CHAT_TOO_FAST/.test(fast.code) && !!fast.hint, fast.code + ' / ' + fast.hint);
  await sleep(3200);
  const rep = await send(A, '두 번째 ' + tag);
  ok('직전과 같은 내용 → 거절, 이유가 돌아옴', !rep.ok && /CHAT_REPEAT/.test(rep.code) && !!rep.hint, rep.code + ' / ' + rep.hint);

  // 고치기·지우기 (204 가 와도 값을 다시 읽어 확인)
  await fetch(U + '/rest/v1/chat_messages?id=eq.' + m1.id, { method: 'PATCH', headers: h(B.access_token, J), body: JSON.stringify({ body: '고침' }) });
  await fetch(U + '/rest/v1/chat_messages?id=eq.' + m1.id, { method: 'DELETE', headers: h(B.access_token) });
  const afterB = (await read(M, m1.id)).rows[0];
  ok('남의 글 고치기·지우기 막힘 (다시 읽어 확인)', afterB && afterB.body === '안녕하세요 ' + tag, afterB && afterB.body);
  await fetch(U + '/rest/v1/chat_messages?id=eq.' + m1.id, { method: 'PATCH', headers: h(A.access_token, J), body: JSON.stringify({ body: '내가 고침', hidden: false }) });
  await fetch(U + '/rest/v1/chat_messages?id=eq.' + m1.id, { method: 'DELETE', headers: h(A.access_token) });
  const afterA = (await read(M, m1.id)).rows[0];
  ok('내 글도 고치기·지우기 못 함 (관리자만)', afterA && afterA.body === '안녕하세요 ' + tag, afterA && afterA.body);

  // 차단
  await fetch(U + '/rest/v1/blocks', { method: 'POST', headers: h(C.access_token, { ...J, Prefer: 'return=minimal' }), body: JSON.stringify({ blocked_id: A.user.id }) });
  const asC = await read(C, m1.id);
  ok('차단한 사람 글은 안 보임', Array.isArray(asC.rows) && asC.rows.length === 0, JSON.stringify(asC.rows));
  await fetch(U + '/rest/v1/blocks?blocked_id=eq.' + A.user.id, { method: 'DELETE', headers: h(C.access_token) });
  ok('차단 풀면 다시 보임', ((await read(C, m1.id)).rows || []).length === 1);

  // 신고 3명 → 숨김
  for (const [who, n] of [[B, 1], [C, 2]]) {
    const r = await fetch(U + '/rest/v1/reports', { method: 'POST', headers: h(who.access_token, { ...J, Prefer: 'return=representation' }), body: JSON.stringify({ target_type: 'chat', target_id: m1.id, target_owner: A.user.id, reason: '광고·스팸' }) });
    const j = await r.json(); if (r.ok) reports.push(j[0].id);
    if (n === 2) ok('2명 신고까지는 보임', ((await read(B, m1.id)).rows || []).length === 1);
  }
  const r3 = await fetch(U + '/rest/v1/reports', { method: 'POST', headers: h(M.access_token, { ...J, Prefer: 'return=representation' }), body: JSON.stringify({ target_type: 'chat', target_id: m1.id, target_owner: A.user.id, reason: '광고·스팸' }) });
  const j3 = await r3.json(); if (r3.ok) reports.push(j3[0].id);
  ok('채팅 신고가 접수됨 (target_type chat)', reports.length === 3, JSON.stringify(j3).slice(0, 120));
  const hid = (await read(M, m1.id)).rows[0];
  ok('서로 다른 3명 신고 → 숨김', hid && hid.hidden === true);
  ok('숨긴 글은 회원에게 안 보임', ((await read(B, m1.id)).rows || []).length === 0);
  // 운영자 표시 (0059): 서버가 단다, 회원은 흉내 못 냄
  await sleep(3200);
  const fake = await send(B, '나도 운영자 ' + tag, { is_master: true });
  const fr = (await read(M, fake.id)).rows[0];
  ok('회원이 운영자 표시를 넣어도 서버가 지움', fake.ok && fr && fr.is_master === false, JSON.stringify(fr));
  const mm = await send(M, '운영자 안내입니다 ' + tag);
  const mr = (await read(B, mm.id)).rows[0];
  ok('운영자 계정 글에는 운영자 표시', mm.ok && mr && mr.is_master === true, JSON.stringify(mr));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  for (const id of reports) await fetch(U + '/rest/v1/reports?id=eq.' + id, { method: 'PATCH', headers: h(M.access_token, J), body: JSON.stringify({ status: 'dismissed' }) });
  for (const id of made) await fetch(U + '/rest/v1/chat_messages?id=eq.' + id, { method: 'DELETE', headers: h(M.access_token) });
  const left = await (await fetch(U + '/rest/v1/chat_messages?select=id&id=in.(' + made.join(',') + ')', { headers: h(M.access_token) })).json();
  ok('정리: 시험 글을 관리자가 지움', Array.isArray(left) && left.length === 0, JSON.stringify(left));
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
