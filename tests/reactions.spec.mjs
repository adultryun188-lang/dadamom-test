/* 다다맘 TEST — P0-03 반응(응원·좋아요) 권한 검증
 *
 *   node tests/reactions.spec.mjs
 *
 * 0005_reactions.sql 을 적용한 뒤 실행한다. 적용 전에 돌리면 전부 실패한다.
 *
 * 확인 항목
 *   - 같은 계정이 같은 대상에 두 번 반응할 수 없다 (PK 유니크 제약)
 *   - 다른 계정은 각각 한 번씩 반응할 수 있고 합계가 정확하다
 *   - 남의 이름(voter_id/liker_id)으로 행을 넣을 수 없다 (RLS)
 *   - 남의 반응을 지울 수 없다 (RLS)
 *   - 비로그인은 반응을 넣을 수 없고, 반응 행 목록도 읽을 수 없다
 *   - 비로그인도 합계(votes/likes)는 읽을 수 있다
 *   - increment_* RPC 가 사라졌다 (PUBLIC 경로까지)
 *   - 댓글 작성/삭제 시 comments 가 트리거로 맞춰진다
 *
 * 테스트 프로젝트 전용. 운영 주소로 돌리지 않는다.
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

if (!/srxdtddrtnhtlbbviyvs/.test(SUPABASE_URL) && !process.env.ALLOW_ANY_PROJECT) {
  console.error('테스트 프로젝트가 아닙니다: ' + SUPABASE_URL);
  console.error('의도한 것이라면 ALLOW_ANY_PROJECT=1 을 붙이세요.');
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

const counter = async (table, col, id) =>
  (await req('GET', `/rest/v1/${table}?select=${col}&id=eq.${id}`, null)).json?.[0]?.[col];

// 만들어 둔 행을 어떤 경로로 끝나든 지운다
const cleanup = [];

(async () => {
  console.log('대상: ' + SUPABASE_URL);

  const tokA = await login('momA@dadamom.test');
  const tokB = await login('momB@dadamom.test');
  const uidA = await uidOf(tokA);
  const uidB = await uidOf(tokB);
  console.log('momA=' + uidA + NL + 'momB=' + uidB);

  const entry = (await req('GET', '/rest/v1/challenge_entries?select=id,votes&status=eq.approved&limit=1', null)).json[0];
  const post = (await req('GET', '/rest/v1/community_posts?select=id,likes,comments&status=eq.approved&limit=1', null)).json[0];
  if (!entry || !post) { console.error('승인된 참가작/게시물이 없습니다. 시드를 먼저 넣으세요.'); process.exit(2); }

  const v0 = entry.votes, l0 = post.likes, c0 = post.comments;
  console.log(`대상 entry=${entry.id} votes=${v0}   post=${post.id} likes=${l0} comments=${c0}`);

  // ------------------------------------------------- 응원 (entry_votes) --
  console.log(NL + '[응원 — entry_votes]');
  {
    let r = await req('POST', '/rest/v1/entry_votes', tokA, { entry_id: entry.id, voter_id: uidA });
    check('momA 최초 응원 성공', r.status === 201 || r.status === 204, 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
    if (r.status < 300) cleanup.push(['entry_votes', `entry_id=eq.${entry.id}&voter_id=eq.${uidA}`, tokA]);
    check('합계 +1', (await counter('challenge_entries', 'votes', entry.id)) === v0 + 1, 'votes=' + await counter('challenge_entries', 'votes', entry.id));

    // 같은 계정 중복
    r = await req('POST', '/rest/v1/entry_votes', tokA, { entry_id: entry.id, voter_id: uidA });
    check('momA 중복 응원 차단', r.status === 409 && r.json?.code === '23505', 'HTTP ' + r.status + ' ' + (r.json?.code || '') + ' ' + (r.json?.message || ''));
    check('중복 시도 후 합계 그대로', (await counter('challenge_entries', 'votes', entry.id)) === v0 + 1);

    // 다른 계정은 각각 한 번씩 가능
    r = await req('POST', '/rest/v1/entry_votes', tokB, { entry_id: entry.id, voter_id: uidB });
    check('momB 응원 성공 (다른 계정)', r.status === 201 || r.status === 204, 'HTTP ' + r.status);
    if (r.status < 300) cleanup.push(['entry_votes', `entry_id=eq.${entry.id}&voter_id=eq.${uidB}`, tokB]);
    check('합계 +2', (await counter('challenge_entries', 'votes', entry.id)) === v0 + 2, 'votes=' + await counter('challenge_entries', 'votes', entry.id));

    // momB 도 중복은 막힌다
    r = await req('POST', '/rest/v1/entry_votes', tokB, { entry_id: entry.id, voter_id: uidB });
    check('momB 중복 응원 차단', r.status === 409 && r.json?.code === '23505', 'HTTP ' + r.status);

    // 남의 이름으로 행 넣기
    r = await req('POST', '/rest/v1/entry_votes', tokA, { entry_id: entry.id, voter_id: uidB });
    check('momA 가 momB 이름으로 넣기 차단', r.status === 403 || r.status === 401, 'HTTP ' + r.status + ' ' + (r.json?.code || ''));

    // 비로그인
    r = await req('POST', '/rest/v1/entry_votes', null, { entry_id: entry.id });
    check('비로그인 응원 차단', r.status === 401 || r.status === 403, 'HTTP ' + r.status + ' ' + (r.json?.code || ''));

    // 남의 반응 지우기
    r = await req('DELETE', `/rest/v1/entry_votes?entry_id=eq.${entry.id}&voter_id=eq.${uidB}`, tokA);
    check('momA 가 momB 응원 삭제 실패 (합계 유지)', (await counter('challenge_entries', 'votes', entry.id)) === v0 + 2, 'HTTP ' + r.status + ' votes=' + await counter('challenge_entries', 'votes', entry.id));

    // 내 반응 취소
    r = await req('DELETE', `/rest/v1/entry_votes?entry_id=eq.${entry.id}&voter_id=eq.${uidA}`, tokA);
    check('momA 응원 취소 성공', r.status === 204 || r.status === 200, 'HTTP ' + r.status);
    check('취소 후 합계 -1', (await counter('challenge_entries', 'votes', entry.id)) === v0 + 1, 'votes=' + await counter('challenge_entries', 'votes', entry.id));

    // 조회 범위
    const mine = await req('GET', '/rest/v1/entry_votes?select=entry_id,voter_id', tokB);
    const onlyMine = Array.isArray(mine.json) && mine.json.every(x => x.voter_id === uidB);
    check('momB 는 자기 반응만 조회됨', mine.status === 200 && onlyMine, 'HTTP ' + mine.status + ' rows=' + (mine.json?.length ?? '?'));

    const anonRows = await req('GET', '/rest/v1/entry_votes?select=voter_id', null);
    check('비로그인은 반응 행 조회 차단', anonRows.status === 401 || anonRows.status === 403, 'HTTP ' + anonRows.status);

    const anonAgg = await req('GET', `/rest/v1/challenge_entries?select=votes&id=eq.${entry.id}`, null);
    check('비로그인도 합계는 조회 가능', anonAgg.status === 200 && typeof anonAgg.json?.[0]?.votes === 'number', 'HTTP ' + anonAgg.status + ' ' + anonAgg.body.slice(0, 60));
  }

  // ---------------------------------------------- 좋아요 (post_likes) --
  console.log(NL + '[좋아요 — post_likes]');
  {
    let r = await req('POST', '/rest/v1/post_likes', tokA, { post_id: post.id, liker_id: uidA });
    check('momA 좋아요 성공', r.status === 201 || r.status === 204, 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
    if (r.status < 300) cleanup.push(['post_likes', `post_id=eq.${post.id}&liker_id=eq.${uidA}`, tokA]);
    check('합계 +1', (await counter('community_posts', 'likes', post.id)) === l0 + 1, 'likes=' + await counter('community_posts', 'likes', post.id));

    r = await req('POST', '/rest/v1/post_likes', tokA, { post_id: post.id, liker_id: uidA });
    check('momA 중복 좋아요 차단', r.status === 409 && r.json?.code === '23505', 'HTTP ' + r.status);

    r = await req('POST', '/rest/v1/post_likes', tokA, { post_id: post.id, liker_id: uidB });
    check('남의 이름으로 좋아요 차단', r.status === 403 || r.status === 401, 'HTTP ' + r.status);

    r = await req('POST', '/rest/v1/post_likes', null, { post_id: post.id });
    check('비로그인 좋아요 차단', r.status === 401 || r.status === 403, 'HTTP ' + r.status);

    // 무한 증가 시도 — 예전 구멍 재현
    let ok = 0;
    for (let i = 0; i < 20; i++) {
      const rr = await req('POST', '/rest/v1/post_likes', tokA, { post_id: post.id, liker_id: uidA });
      if (rr.status < 300) ok++;
    }
    const after = await counter('community_posts', 'likes', post.id);
    check('20회 반복 시도해도 합계는 +1 그대로', ok === 0 && after === l0 + 1, '성공 ' + ok + '회, likes=' + after);
  }

  // ------------------------------------------------ RPC 제거 확인 --
  console.log(NL + '[increment_* RPC 제거]');
  // delta 는 반드시 0 으로 호출한다. 함수가 아직 살아있는 상태에서 이 검사를 돌리면
  // delta 가 0 이 아닐 때 실제로 숫자를 바꿔 DB 를 더럽힌다.
  for (const [label, tok] of [['비로그인', null], ['로그인(momA)', tokA]]) {
    for (const fn of ['increment_votes', 'increment_likes', 'increment_comments']) {
      const arg = fn === 'increment_votes' ? { entry_id: entry.id, delta: 0 } : { post_id: post.id, delta: 0 };
      const r = await req('POST', '/rest/v1/rpc/' + fn, tok, arg);
      check(`${label} ${fn} 없음`, r.status === 404, 'HTTP ' + r.status + ' ' + (r.json?.code || ''));
    }
  }

  // ------------------------------------------------ 댓글수 트리거 --
  console.log(NL + '[댓글수 트리거]');
  {
    const before = await counter('community_posts', 'comments', post.id);
    const r = await req('POST', '/rest/v1/post_comments', tokA,
      { post_id: post.id, author: '검증봇', content: 'P0-03 검증용 댓글' },
      { Prefer: 'return=representation' });
    const row = Array.isArray(r.json) ? r.json[0] : r.json;
    check('댓글 작성 성공', r.status === 201 && row?.id, 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
    check('comments +1 (트리거)', (await counter('community_posts', 'comments', post.id)) === before + 1,
      'comments=' + await counter('community_posts', 'comments', post.id));
    if (row?.id) {
      await req('DELETE', `/rest/v1/post_comments?id=eq.${row.id}`, tokA);
      check('댓글 삭제 후 comments -1 (트리거)', (await counter('community_posts', 'comments', post.id)) === before,
        'comments=' + await counter('community_posts', 'comments', post.id));
    }
  }

  // ------------------------------------------------------- 원복 --
  console.log(NL + '[원복]');
  for (const [table, filter, tok] of cleanup) {
    await req('DELETE', `/rest/v1/${table}?${filter}`, tok);
  }
  const vEnd = await counter('challenge_entries', 'votes', entry.id);
  const lEnd = await counter('community_posts', 'likes', post.id);
  const cEnd = await counter('community_posts', 'comments', post.id);
  check('votes 원복', vEnd === v0, `${v0} -> ${vEnd}`);
  check('likes 원복', lEnd === l0, `${l0} -> ${lEnd}`);
  check('comments 원복', cEnd === c0, `${c0} -> ${cEnd}`);

  console.log(NL + (failed ? '실패 ' + failed + '건' : '전부 통과'));
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error(NL + '오류: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
