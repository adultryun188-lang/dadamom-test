/* 다다맘 TEST — 레드팀(공격 점검) 2026-11-02
 *
 *   node tests/redteam.spec.mjs
 *
 * 테스트(스테이징) 프로젝트 전용. 운영 주소로는 돌지 않는다 (hostname assert).
 * 비로그인 / 일반 회원 / 다른 회원 시점에서 권한·검수·노출·입력을 찔러 본다.
 * 넣은 행은 전부 끝에 지운다. 숫자를 바꾸는 함수는 delta=0 으로만 부른다.
 *
 * 결과: [확인됨] = 실제로 뚫림,  [막힘] = 방어 확인(안심 목록).
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const CFG = fs.readFileSync(path.join(HERE, '..', 'config', 'env.staging.js'), 'utf8');
const pick = (k) => (CFG.match(new RegExp(k + ":\\s*'([^']+)'")) || [])[1];

const SUPABASE_URL = process.env.SUPABASE_URL || pick('SUPABASE_URL');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || pick('SUPABASE_ANON_KEY');
const PW = process.env.TEST_PASSWORD || 'dadamom-test-1234';

// 안전장치: 테스트 프로젝트가 아니면 실행 거부
if (new URL(SUPABASE_URL).hostname !== 'srxdtddrtnhtlbbviyvs.supabase.co') {
  console.error('테스트 프로젝트가 아닙니다. 중단: ' + SUPABASE_URL);
  process.exit(2);
}

const NL = String.fromCharCode(10);
function note(tag, name, detail) { console.log('  ' + tag + '  ' + name + (detail ? '   ' + detail : '')); }

async function req(method, pq, token, body, extra) {
  const headers = { apikey: ANON_KEY, Authorization: 'Bearer ' + (token || ANON_KEY), ...(extra || {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(SUPABASE_URL + pq, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* no body */ }
  return { status: r.status, body: text, json };
}
async function login(email) {
  const r = await req('POST', '/auth/v1/token?grant_type=password', null, { email, password: PW });
  if (r.status !== 200) throw new Error('로그인 실패 ' + email + ' HTTP ' + r.status + ' ' + r.body);
  return r.json.access_token;
}
const uidOf = async (tok) => (await req('GET', '/auth/v1/user', tok)).json.id;
const cleanup = [];

(async () => {
  console.log('대상: ' + SUPABASE_URL + NL);
  const tokA = await login('momA@dadamom.test');
  const tokB = await login('momB@dadamom.test');
  const uidA = await uidOf(tokA);
  const uidB = await uidOf(tokB);

  // 댓글 스푸핑에 쓸 승인된 글 하나
  const appr = ((await req('GET', '/rest/v1/community_posts?select=id&status=eq.approved&limit=1', tokA)).json || [])[0];

  // ───────────────────────── 1. 작성자 이름 위조 + 자동 공개 (글) ──
  console.log('[1] 작성자 위조 — community_posts');
  {
    const r = await req('POST', '/rest/v1/community_posts', tokA,
      { author: '운영자 다다맘', text: '레드팀 점검용 평범한 글입니다 오늘 날씨가 좋네요', stage: 'parenting', age_value: 12 },
      { Prefer: 'return=representation' });
    const row = Array.isArray(r.json) ? r.json[0] : r.json;
    if (row && row.id) {
      cleanup.push(['community_posts', 'id=eq.' + row.id, tokA]);
      const spoofed = row.author === '운영자 다다맘' && row.owner_id === uidA;
      note(spoofed ? '[확인됨]' : '[막힘]',
        'momA 가 author="운영자 다다맘" 으로 글 작성',
        'status=' + row.status + (row.status === 'approved' ? ' (검수 없이 즉시 공개)' : ' (검수 대기)'));
    } else note('[막힘]', 'momA author 위조 글', 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
  }

  // ───────────────────────── 2. status=approved 직접 지정 (검수 트리거) ──
  console.log('[2] status=approved 를 직접 넣어 검수 우회 시도 (금지어 포함)');
  {
    const r = await req('POST', '/rest/v1/community_posts', tokA,
      { author: '레드팀', text: '좋은 정보 여기 https://evil.example 확인하세요', status: 'approved' },
      { Prefer: 'return=representation' });
    const row = Array.isArray(r.json) ? r.json[0] : r.json;
    if (row && row.id) {
      cleanup.push(['community_posts', 'id=eq.' + row.id, tokA]);
      note(row.status === 'approved' ? '[확인됨]' : '[막힘]',
        'status=approved 직접 지정', '서버가 매긴 status=' + row.status);
      // 2b. 자기 글을 PATCH 로 self-approve
      await req('PATCH', '/rest/v1/community_posts?id=eq.' + row.id, tokA, { status: 'approved' });
      const back = (await req('GET', '/rest/v1/community_posts?select=status&id=eq.' + row.id, tokA)).json?.[0]?.status;
      note(back === 'approved' ? '[확인됨]' : '[막힘]',
        'momA 가 자기 pending 글을 PATCH 로 승인', '다시 읽은 status=' + back);
    } else note('[막힘]', 'status 직접 지정', 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
  }

  // ───────────────────────── 3. outcome 에 링크·전화 직접 삽입 (set_post_outcome 우회) ──
  console.log('[3] outcome 칸에 링크·전화번호 직접 삽입 (INSERT 로)');
  {
    const r = await req('POST', '/rest/v1/community_posts', tokA,
      { author: '레드팀', text: '[질문] 레드팀 점검', outcome: '해결 https://evil.example 전화 010-1234-5678' },
      { Prefer: 'return=representation' });
    const row = Array.isArray(r.json) ? r.json[0] : r.json;
    if (row && row.id) {
      cleanup.push(['community_posts', 'id=eq.' + row.id, tokA]);
      note(/https?:\/\//.test(row.outcome || '') ? '[확인됨]' : '[막힘]',
        'INSERT 로 outcome 에 링크 삽입 (함수의 광고차단 우회)', 'outcome=' + JSON.stringify(row.outcome));
    } else note('[막힘]', 'outcome INSERT', 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
  }

  // ───────────────────────── 4. owner_id 를 남으로 지정 ──
  console.log('[4] owner_id 를 momB 로 지정해 글 넣기');
  {
    const r = await req('POST', '/rest/v1/community_posts', tokA,
      { author: 'x', text: '레드팀 owner 위조', owner_id: uidB }, { Prefer: 'return=representation' });
    const row = Array.isArray(r.json) ? r.json[0] : r.json;
    if (row && row.id) cleanup.push(['community_posts', 'id=eq.' + row.id, tokA]);
    note((r.status === 403 || r.status === 401) ? '[막힘]' : '[확인됨]',
      'momA 가 owner_id=momB 로 글', 'HTTP ' + r.status + ' ' + (r.json?.code || ''));
  }

  // ───────────────────────── 5. 댓글 작성자 위조 ──
  console.log('[5] 댓글 author 위조');
  if (appr) {
    const r = await req('POST', '/rest/v1/post_comments', tokA,
      { post_id: appr.id, author: '운영자', content: '레드팀 점검 댓글' }, { Prefer: 'return=representation' });
    const row = Array.isArray(r.json) ? r.json[0] : r.json;
    if (row && row.id) {
      cleanup.push(['post_comments', 'id=eq.' + row.id, tokA]);
      note(row.author === '운영자' ? '[확인됨]' : '[막힘]', 'momA 댓글 author="운영자"', 'author=' + row.author);
    } else note('[막힘]', '댓글 author 위조', 'HTTP ' + r.status + ' ' + r.body.slice(0, 120));
  } else note('[건너뜀]', '댓글 author 위조', '승인된 글이 없음');

  // ───────────────────────── 6. 아주 긴 입력 (10만 자) ──
  console.log('[6] 10만 자 글 작성');
  {
    const big = 'A'.repeat(100000);
    const r = await req('POST', '/rest/v1/community_posts', tokA,
      { author: '레드팀', text: big }, { Prefer: 'return=representation' });
    const row = Array.isArray(r.json) ? r.json[0] : r.json;
    if (row && row.id) {
      cleanup.push(['community_posts', 'id=eq.' + row.id, tokA]);
      note('[확인됨]', '10만 자 글 저장됨 (길이 제한 없음)', 'len=' + (row.text || '').length + ' status=' + row.status);
    } else note('[막힘]', '10만 자 글', 'HTTP ' + r.status + ' ' + r.body.slice(0, 80));
  }

  // ───────────────────────── 7. 남의 개인정보 읽기 (안심 목록 확인) ──
  console.log('[7] 남의 데이터 읽기 시도');
  {
    const prof = await req('GET', '/rest/v1/profiles?select=id,nickname,due_date&id=eq.' + uidB, tokA);
    note((prof.status === 200 && Array.isArray(prof.json) && prof.json.length === 0) ? '[막힘]' : '[확인됨]',
      'momA 가 momB 프로필 읽기', 'rows=' + (prof.json?.length ?? '?'));

    const allProf = await req('GET', '/rest/v1/profiles?select=id', tokA);
    const onlyMine = Array.isArray(allProf.json) && allProf.json.every(x => x.id === uidA);
    note(onlyMine ? '[막힘]' : '[확인됨]', 'momA 프로필 전체 조회는 본인만', 'rows=' + (allProf.json?.length ?? '?'));

    const push = await req('GET', '/rest/v1/push_tokens?select=token,user_id', tokA);
    const pushOk = Array.isArray(push.json) && push.json.every(x => x.user_id === uidA);
    note(pushOk ? '[막힘]' : '[확인됨]', 'momA push_tokens 조회는 본인만', 'rows=' + (push.json?.length ?? '?'));

    const pii = await req('GET', '/rest/v1/benefit_applications_pii?select=owner_id,contact', tokA);
    const piiOk = Array.isArray(pii.json) && pii.json.every(x => x.owner_id === uidA);
    note(piiOk ? '[막힘]' : '[확인됨]', 'momA 체험단 PII 조회는 본인만', 'rows=' + (pii.json?.length ?? '?'));

    const anonProf = await req('GET', '/rest/v1/profiles?select=id', null);
    note((anonProf.status === 401 || anonProf.status === 403) ? '[막힘]' : '[확인됨]', '비로그인 프로필 조회', 'HTTP ' + anonProf.status);

    const anonPush = await req('GET', '/rest/v1/push_tokens?select=token', null);
    note((anonPush.status === 401 || anonPush.status === 403) ? '[막힘]' : '[확인됨]', '비로그인 push_tokens 조회', 'HTTP ' + anonPush.status);

    const anonEntry = await req('GET', '/rest/v1/challenge_entries?select=status&status=eq.pending&limit=1', null);
    note((anonEntry.status === 200 && (anonEntry.json || []).length === 0) ? '[막힘]' : '[확인됨]', '비로그인 대기중 참가작 열람', 'rows=' + (anonEntry.json?.length ?? '?'));
  }

  // ───────────────────────── 8. 운영자 전용 RPC 를 일반 회원이 호출 ──
  console.log('[8] 운영자 전용 RPC 를 momA(비운영자) 로 호출');
  {
    const aa = await req('POST', '/rest/v1/rpc/admin_applications', tokA, {});
    note((aa.status === 200 && Array.isArray(aa.json) && aa.json.length === 0) ? '[막힘]' : '[확인됨]',
      'admin_applications() (체험단 명단)', 'HTTP ' + aa.status + ' rows=' + (Array.isArray(aa.json) ? aa.json.length : '?'));

    const rp = await req('POST', '/rest/v1/rpc/reveal_application_pii', tokA, { app_id: '00000000-0000-0000-0000-000000000000', why: 'x' });
    note((rp.status >= 400) ? '[막힘]' : '[확인됨]', 'reveal_application_pii() (연락처·주소)', 'HTTP ' + rp.status + ' ' + (rp.json?.code || ''));

    const fg = await req('POST', '/rest/v1/rpc/admin_first_gift', tokA, {});
    note((fg.status >= 400) ? '[막힘]' : '[확인됨]', 'admin_first_gift() (당첨자 이메일)', 'HTTP ' + fg.status + ' ' + (fg.json?.code || ''));

    const we = await req('POST', '/rest/v1/rpc/admin_challenge_winner_email', tokA, { p_entry: '00000000-0000-0000-0000-000000000000' });
    note((we.status >= 400 || we.json === null) ? '[막힘]' : '[확인됨]', 'admin_challenge_winner_email()', 'HTTP ' + we.status + ' ' + (we.json ?? ''));
  }

  // ───────────────────────── 9. 제거된 숫자 조작 RPC (delta=0) ──
  console.log('[9] increment_* RPC 제거 확인 (delta=0)');
  for (const [lab, tok] of [['비로그인', null], ['momA', tokA]]) {
    const r = await req('POST', '/rest/v1/rpc/increment_likes', tok, { post_id: '00000000-0000-0000-0000-000000000000', delta: 0 });
    note(r.status === 404 ? '[막힘]' : '[확인됨]', lab + ' increment_likes 호출', 'HTTP ' + r.status + ' ' + (r.json?.code || ''));
  }

  // ───────────────────────── 10. 내 참가작 자기 응원(entry_votes) ──
  console.log('[10] 내 참가작에 스스로 응원(entry_votes)');
  {
    const mine = ((await req('GET', '/rest/v1/challenge_entries?select=id,votes&status=eq.approved&owner_id=eq.' + uidA + '&limit=1', tokA)).json || [])[0];
    if (mine) {
      const r = await req('POST', '/rest/v1/entry_votes', tokA, { entry_id: mine.id, voter_id: uidA });
      if (r.status < 300) cleanup.push(['entry_votes', 'entry_id=eq.' + mine.id + '&voter_id=eq.' + uidA, tokA]);
      note((r.status === 201 || r.status === 204) ? '[확인됨]' : '[막힘]',
        'momA 가 자기 참가작에 응원(+1)', 'HTTP ' + r.status + ' (취소는 cast_ballot 아님, 응원 카운터)');
    } else note('[건너뜀]', '자기 참가작 응원', 'momA 소유 승인 참가작 없음');
  }

  // ───────────────────────── 원복 ──
  console.log(NL + '[원복] 넣은 행 삭제');
  for (const [table, filter, tok] of cleanup) {
    const d = await req('DELETE', '/rest/v1/' + table + '?' + filter, tok);
    // 다시 읽어 지워졌는지 확인 (PATCH/DELETE 는 0행이어도 204)
    const left = await req('GET', '/rest/v1/' + table + '?select=*&' + filter, tok);
    const n = Array.isArray(left.json) ? left.json.length : '?';
    console.log('   삭제 ' + table + ' [' + filter + '] HTTP ' + d.status + ' 남은행=' + n);
  }
  console.log(NL + '끝. [확인됨] 항목을 docs 보고서에 올리세요.');
  process.exit(0);
})().catch(e => { console.error(NL + '오류: ' + (e && e.message ? e.message : e)); process.exit(2); });
