/* 다다맘 TEST — 가족 공유(0016) 권한·흐름 검증
 *
 *   node tests/family.spec.mjs
 *
 * 0016_family_share.sql 을 적용한 뒤 실행한다. 실제 테스트 계정으로 API 를 부른다.
 * (가짜 사용자로 DB 안에서 하는 시험은 tests/0016_rehearsal.sql)
 *
 * 확인 항목
 *   - 비로그인은 가족 함수·기록 표를 못 쓴다
 *   - family_share 동의가 없으면 만들기·참여가 막힌다 (가장 최근 동의 기준)
 *   - 초대 코드로 참여, 틀린 코드·빠진 뒤 옛 코드는 거부
 *   - 기록은 구성원끼리만 보이고, 작성자는 서버가 찍는다 (남의 이름 불가)
 *   - 비구성원·운영자는 기록을 못 보고 못 바꾼다 (PATCH 204 함정 → 다시 읽어 확인)
 *   - 방장만 구성원을 뺄 수 있고, 마지막 사람이 나가면 가족이 없어진다
 *
 * 테스트 프로젝트 전용. 운영 주소로 돌리지 않는다. 끝나면 모든 계정이 가족에서 나간다.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const CFG = fs.readFileSync(path.join(HERE, '..', 'config', 'env.staging.js'), 'utf8');
const pick = (k) => (CFG.match(new RegExp(k + ":\\s*'([^']+)'")) || [])[1];

const SUPABASE_URL = process.env.SUPABASE_URL || pick('SUPABASE_URL');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || pick('SUPABASE_ANON_KEY');
// 테스트 전용 계정 비밀번호. CLAUDE.md 에 공개된 값이고 테스트 프로젝트에만 존재한다.
const PW = process.env.TEST_PASSWORD || 'dadamom-test-1234';

if (new URL(SUPABASE_URL).origin !== 'https://srxdtddrtnhtlbbviyvs.supabase.co') {
  console.error('테스트 프로젝트가 아닙니다: ' + SUPABASE_URL);
  console.error('이 스크립트는 테스트 프로젝트만 허용합니다.');
  process.exit(2);
}

let failed = 0;
const NL = String.fromCharCode(10);
function check(name, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
  if (!ok) failed++;
}

async function req(method, pathAndQuery, token, body, extraHeaders) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: 'Bearer ' + (token || ANON_KEY),
    ...(extraHeaders || {})
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(SUPABASE_URL + pathAndQuery, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 본문 없음 */ }
  return { status: r.status, body: text, json };
}

async function login(email) {
  const r = await req('POST', '/auth/v1/token?grant_type=password', null, { email, password: PW });
  if (r.status !== 200) throw new Error('로그인 실패 ' + email + ' HTTP ' + r.status + ' ' + r.body);
  return r.json.access_token;
}
const uidOf = async (tok) => (await req('GET', '/auth/v1/user', tok)).json.id;

const rpc = (fn, tok, args) => req('POST', '/rest/v1/rpc/' + fn, tok, args || {});
const consent = (tok, granted) => req('POST', '/rest/v1/consent_records', tok, { kind: 'family_share', granted },
  { Prefer: 'return=minimal' });
// 앱이 쓸 방식 그대로: 건별 upsert, 응답 본문 없이
const upsert = (tok, rows) => req('POST', '/rest/v1/family_records', tok, rows,
  { Prefer: 'resolution=merge-duplicates,return=minimal' });
const records = (tok, fid) => req('GET', `/rest/v1/family_records?select=kind,rid,body,deleted,updated_by&family_id=eq.${fid}&order=rid`, tok);
const errIs = (r, msg) => r.status >= 400 && (r.json?.message || '') === msg;

(async () => {
  console.log('대상: ' + SUPABASE_URL);
  const tok = {
    A: await login('momA@dadamom.test'),
    C: await login('dadC@dadamom.test'),
    B: await login('momB@dadamom.test'),
    admin: await login('admin@dadamom.test')
  };
  const uid = { A: await uidOf(tok.A), C: await uidOf(tok.C) };
  const privacy = (await rpc('family_privacy_version', tok.A)).json === 17;
  if(process.env.REQUIRE_FAMILY_PRIVACY === '1' && !privacy) throw new Error('0017 미적용: DB 작업은 실행하지 않았습니다.');
  const ended = async t => {
    const r = await req('GET', '/rest/v1/consent_records?kind=eq.family_share&select=granted,scope&order=created_at.desc,granted.asc&limit=1', t);
    return r.json?.[0]?.granted === false;
  };

  // 지난 실행이 중간에 끊겼어도 깨끗하게 시작
  for (const t of Object.values(tok)) await rpc('leave_family', t);

  try {
    console.log(NL + '[비로그인]');
    {
      let r = await rpc('create_family', null);
      check('비로그인 create_family 차단', r.status === 401 || r.status === 403, 'HTTP ' + r.status);
      r = await rpc('my_family', null);
      check('비로그인 my_family 차단', r.status === 401 || r.status === 403, 'HTTP ' + r.status);
      r = await req('GET', '/rest/v1/family_records?select=rid', null);
      check('비로그인 기록 조회 차단', r.status === 401 || r.status === 403, 'HTTP ' + r.status);
    }

    console.log(NL + '[만들기 — 동의 필요]');
    await consent(tok.A, false);
    let r = await rpc('create_family', tok.A);
    check('동의 철회 상태에서 만들기 차단', errIs(r, 'consent_required'), 'HTTP ' + r.status + ' ' + (r.json?.message || ''));
    await consent(tok.A, true);
    r = await rpc('create_family', tok.A);
    check('동의 후 만들기 성공', r.status === 200 && /^[0-9A-F]{10}$/.test(r.json?.invite_code || ''), 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
    const fid = r.json?.family_id;
    const code = r.json?.invite_code;
    if (!fid) throw new Error('가족을 만들지 못해 나머지 확인을 건너뜁니다');
    r = await rpc('create_family', tok.A);
    check('두 번째 가족 만들기 차단', errIs(r, 'already_in_family'), r.json?.message);

    console.log(NL + '[참여]');
    await consent(tok.C, true);
    r = await rpc('join_family', tok.C, { p_code: '0000000000' });
    check('틀린 코드 거부', errIs(r, 'invalid_code'), r.json?.message);
    r = await rpc('join_family', tok.C, { p_code: code.slice(0, 5).toLowerCase() + '-' + code.slice(5) });
    check('소문자·하이픈 섞인 코드로 참여', r.status === 200, 'HTTP ' + r.status + ' ' + (r.json?.message || ''));
    r = await rpc('my_family', tok.A);
    check('구성원 2명, momA 가 방장', r.json?.members?.length === 2 && r.json?.is_owner === true,
      JSON.stringify(r.json?.members?.map(m => m.nickname)));

    console.log(NL + '[기록 — 구성원끼리]');
    const ts = Date.now();
    r = await upsert(tok.C, [{ family_id: fid, kind: 'care', rid: 'c' + ts, body: { type: 'feed', ts }, updated_by: uid.A }]);
    check('dadC 기록 upsert', r.status === 201 || r.status === 204, 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
    r = await records(tok.A, fid);
    const row = r.json?.find(x => x.rid === 'c' + ts);
    check('momA 가 dadC 기록을 봄', !!row, 'rows=' + (r.json?.length ?? r.body));
    check('작성자는 서버가 찍음 (남의 이름 무시)', row?.updated_by === uid.C, 'updated_by=' + row?.updated_by);

    r = await req('PATCH', `/rest/v1/family_records?family_id=eq.${fid}&kind=eq.care&rid=eq.c${ts}`, tok.A, { deleted: true });
    const afterDel = (await records(tok.C, fid)).json?.find(x => x.rid === 'c' + ts);
    check('momA 삭제 표시가 dadC 에게 보임', afterDel?.deleted === true, 'HTTP ' + r.status);

    r = await upsert(tok.C, [{ family_id: fid, kind: 'vaccine', rid: 'bcg', body: true }]);
    r = await upsert(tok.C, [{ family_id: fid, kind: 'vaccine', rid: 'bcg', body: false }]);
    const vax = (await records(tok.A, fid)).json?.find(x => x.rid === 'bcg');
    check('같은 기록 다시 upsert 하면 갱신', vax?.body === false, 'HTTP ' + r.status + ' body=' + JSON.stringify(vax?.body));

    console.log(NL + '[비구성원·운영자]');
    for (const who of ['B', 'admin']) {
      r = await records(tok[who], fid);
      check(who + ' 는 기록이 안 보임', r.status === 200 && r.json?.length === 0, 'rows=' + (r.json?.length ?? r.body));
      r = await upsert(tok[who], [{ family_id: fid, kind: 'care', rid: 'x' + who, body: {} }]);
      check(who + ' 는 기록을 못 넣음', r.status === 401 || r.status === 403, 'HTTP ' + r.status);
      r = await req('PATCH', `/rest/v1/family_records?family_id=eq.${fid}&rid=eq.bcg`, tok[who], { body: 'hacked' });
      const v = (await records(tok.A, fid)).json?.find(x => x.rid === 'bcg');
      check(who + ' 의 수정은 반영 안 됨 (다시 읽어 확인)', v?.body === false, 'HTTP ' + r.status + ' body=' + JSON.stringify(v?.body));
      r = await rpc('my_family', tok[who]);
      check(who + ' 의 my_family 는 null', r.status === 200 && r.json === null, r.body.slice(0, 80));
    }
    r = await req('GET', '/rest/v1/families?select=id', tok.A);
    check('가족 표 직접 조회 차단', r.status === 401 || r.status === 403, 'HTTP ' + r.status);

    console.log(NL + '[빼기·나가기]');
    r = await rpc('remove_family_member', tok.C, { p_user: uid.A });
    check('방장이 아니면 빼기 차단', errIs(r, 'not_owner'), r.json?.message);
    r = await rpc('remove_family_member', tok.A, { p_user: uid.C });
    check('방장이 dadC 빼기', r.status === 200, 'HTTP ' + r.status + ' ' + (r.json?.message || ''));
    if(privacy){
      const kept = (await records(tok.A, fid)).json?.find(x => x.rid === 'bcg');
      check('빼기 후 계정 연결 제거·기록 유지', kept?.updated_by === null && kept?.body === false);
      check('빼기 후 공유 종료 기록 false', await ended(tok.C));
    }
    r = await records(tok.C, fid);
    check('빠진 dadC 는 기록이 안 보임', r.json?.length === 0, 'rows=' + r.json?.length);
    if(privacy){
      r = await rpc('join_family', tok.C, { p_code: code });
      check('종료 뒤 재참여는 새 동의 필요', errIs(r, 'consent_required'));
      await consent(tok.C, true);
    }
    r = await rpc('join_family', tok.C, { p_code: code });
    check('빠진 뒤 옛 코드로 재참여 차단', errIs(r, 'invalid_code'), r.json?.message);

    r = await rpc('new_family_invite', tok.A);
    const code2 = r.json?.invite_code;
    check('새 초대 코드', !!code2 && code2 !== code, code2);
    // 0017부터 강제 제거 시에도 공유 권한이 종료된다. 재참여에는 새 동의가 필요하다.
    await consent(tok.C, true);
    r = await rpc('join_family', tok.C, { p_code: code2 });
    check('새 코드로 다시 참여', r.status === 200, 'HTTP ' + r.status);
    r = await rpc('leave_family', tok.A);
    if(privacy){
      check('나가기 응답은 철회 완료를 함께 확인', r.json?.consent_revoked === true);
      check('나가기 후 공유 종료 기록 false', await ended(tok.A));
      check('나간 계정의 마지막 수정자 연결 제거', (await records(tok.C, fid)).json?.every(x => x.updated_by !== uid.A));
    }
    r = await rpc('my_family', tok.C);
    check('방장이 나가면 dadC 가 방장', r.json?.is_owner === true && r.json?.members?.length === 1, r.body.slice(0, 120));
    r = await rpc('leave_family', tok.C);
    r = await rpc('my_family', tok.C);
    check('마지막 사람이 나가면 가족 없음', r.status === 200 && r.json === null, r.body.slice(0, 80));
  } finally {
    for (const t of Object.values(tok)) await rpc('leave_family', t);
  }

  console.log(NL + (failed ? `실패 ${failed}건` : '전부 통과'));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
