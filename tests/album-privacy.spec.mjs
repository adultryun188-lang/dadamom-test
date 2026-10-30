// P0-4 앨범 사진 권한과 서명 URL 범위 → 실제 테스트 DB. node tests/album-privacy.spec.mjs
// 가족 공유(0016)는 육아 기록만 함께 보고 앨범 사진은 공유하지 않는다. 그래서 '가족에서 빠지면 사진이 막히는가'가 아니라
// '애초에 남(가족 포함)이 사진 링크를 받을 수 없는가'와 '이미 받은 링크는 언제 죽는가'를 확인한다.
// momA 가 전용 시험 사진 1장을 올리고 끝에 지운다. 기존 사진·기록·가족 상태는 건드리지 않는다.
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
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test');
const path = A.user.id + '/p0-album-' + Date.now() + '.jpg';
const sign = async t => { const r = await fetch(U + '/storage/v1/object/sign/album/' + path, { method: 'POST', headers: h(t, J), body: JSON.stringify({ expiresIn: 600 }) }); const j = await r.json().catch(() => ({})); return { status: r.status, url: j.signedURL || j.signedUrl || '' }; };
const get = async url => (await fetch(U + '/storage/v1' + url + '&nocache=' + Date.now(), { cache: 'no-store' })).status;
let rowId = null;
try {
  const up = await fetch(U + '/storage/v1/object/album/' + path, { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'image/jpeg' }), body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  ok('momA 가 내 폴더에 시험 사진 올림', up.ok, 'HTTP ' + up.status);
  const ins = await fetch(U + '/rest/v1/album_photos', { method: 'POST', headers: h(A.access_token, { ...J, Prefer: 'return=representation' }), body: JSON.stringify({ path, taken_on: new Date().toISOString().slice(0, 10) }) });
  rowId = ((await ins.json().catch(() => [])) [0] || {}).id || null;
  ok('momA 앨범 행 추가', ins.ok && !!rowId, 'HTTP ' + ins.status);

  const sA = await sign(A.access_token);
  ok('주인은 서명 링크를 받음', sA.status === 200 && !!sA.url);
  ok('받은 링크로 사진이 열림', sA.url && (await get(sA.url)) === 200);
  const sB = await sign(B.access_token);
  ok('다른 회원(가족 포함)은 서명 링크를 못 받음', sB.status !== 200, 'HTTP ' + sB.status);
  const sN = await sign(null);
  ok('비로그인은 서명 링크를 못 받음', sN.status !== 200, 'HTTP ' + sN.status);
  const rowsB = await (await fetch(U + '/rest/v1/album_photos?select=id&id=eq.' + rowId, { headers: h(B.access_token) })).json();
  ok('다른 회원은 앨범 행을 못 읽음', Array.isArray(rowsB) && rowsB.length === 0, JSON.stringify(rowsB));
  const upB = await fetch(U + '/storage/v1/object/album/' + path.replace(A.user.id, A.user.id) + '.b', { method: 'POST', headers: h(B.access_token, { 'Content-Type': 'image/jpeg' }), body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  ok('다른 회원은 남의 폴더에 못 올림', !upB.ok, 'HTTP ' + upB.status);

  // 이미 받은 링크: 권한 변경으로는 안 죽고(토큰이 RLS 를 안 거침), 파일을 지워야 죽는다 (CLAUDE.md 4번 지뢰)
  const del = await fetch(U + '/storage/v1/object/album/' + path, { method: 'DELETE', headers: h(A.access_token) });
  ok('주인이 파일 삭제', del.ok, 'HTTP ' + del.status);
  // CDN 이 잠깐 들고 있을 수 있어 최대 3분까지 10초마다 다시 본다 (링크 자체 유효시간은 10분)
  let after = 200, waited = 0;
  while (sA.url && waited <= 180) { after = await get(sA.url); if (after !== 200) break; await new Promise(r => setTimeout(r, 10000)); waited += 10; }
  ok('파일을 지우면 이미 받은 링크도 안 열림 (CDN 지연 포함)', after !== 200, 'HTTP ' + after + ', ' + waited + '초 뒤');
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  if (rowId) await fetch(U + '/rest/v1/album_photos?id=eq.' + rowId, { method: 'DELETE', headers: h(A.access_token) });
  await fetch(U + '/storage/v1/object/album/' + path, { method: 'DELETE', headers: h(A.access_token) });
  const left = rowId ? await (await fetch(U + '/rest/v1/album_photos?select=id&id=eq.' + rowId, { headers: h(A.access_token) })).json() : [];
  console.log('정리: 시험 행 ' + (Array.isArray(left) && left.length === 0 ? '삭제 확인' : '남음 ' + JSON.stringify(left)));
}
console.log(failed ? `\n${failed}개 실패 / ${passed}개 통과` : `\n앨범 권한·서명 URL ${passed}개 통과 (실제 테스트 DB)`);
process.exit(failed ? 1 : 0);
