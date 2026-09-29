-- =============================================================================
-- 권한 테스트 — anon / userA / userB / admin
-- 실행계획 P0-02 완료조건 검증.
--
-- 사용법: Supabase SQL Editor 에 통째로 붙여넣고 실행.
--   - 전체가 하나의 트랜잭션이고 마지막에 rollback 하므로 데이터가 바뀌지 않습니다.
--   - 결과는 마지막 raise exception 메시지로 나옵니다. 에러처럼 보이지만 정상입니다.
--   - 001_test_users.sql 을 먼저 실행해두어야 합니다.
-- =============================================================================
begin;

do $$
declare
  A uuid := '22222222-2222-2222-2222-222222222222';  -- momA
  B uuid := '44444444-4444-4444-4444-444444444444';  -- dadC
  ADM uuid := '11111111-1111-1111-1111-111111111111';
  r text := '';
  n int;

begin
  -- 검증용 행 준비: A 의 비공개(검수대기) 글
  insert into public.community_posts (id, owner_id, author, text, status)
  values ('99999999-0000-0000-0000-000000000001', A, 'A', 'A의 검수대기 글', 'pending');

  -- ---------------------------------------------------------- anon --
  set local role anon;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into n from public.community_posts where id = '99999999-0000-0000-0000-000000000001';
  r := r || E'\n[anon] A의 대기글 조회 = ' || n || ' (0 이어야 정상)';

  begin
    insert into public.community_posts (author, text) values ('해커','익명 글쓰기');
    r := r || E'\n[anon] 글쓰기 = 허용됨 (문제!)';
  exception when others then r := r || E'\n[anon] 글쓰기 = 차단됨 (' || SQLSTATE || ')'; end;

  begin
    perform 1 from public.profiles limit 1;
    r := r || E'\n[anon] 프로필 조회 = 허용됨 (문제!)';
  exception when others then r := r || E'\n[anon] 프로필 조회 = 차단됨'; end;

  begin
    perform 1 from public.benefit_applications limit 1;
    r := r || E'\n[anon] 체험단신청 조회 = 허용됨 (문제!)';
  exception when others then r := r || E'\n[anon] 체험단신청 조회 = 차단됨'; end;

  select count(*) into n from public.community_posts where status = 'approved';
  r := r || E'\n[anon] 승인된 글 조회 = ' || n || '건 (열람 가능해야 정상)';
  reset role;

  -- --------------------------------------------------------- user B --
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', B::text, 'role','authenticated')::text, true);

  select count(*) into n from public.community_posts where id = '99999999-0000-0000-0000-000000000001';
  r := r || E'\n[userB] A의 대기글 조회 = ' || n || ' (0 이어야 정상)';

  update public.community_posts set text = '변조' where id = '99999999-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  r := r || E'\n[userB] A의 글 수정 = ' || n || '행 (0 이어야 정상)';

  delete from public.community_posts where id = '99999999-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  r := r || E'\n[userB] A의 글 삭제 = ' || n || '행 (0 이어야 정상)';

  begin
    insert into public.community_posts (owner_id, author, text) values (A, '위조', '남의 명의로 쓰기');
    r := r || E'\n[userB] A 명의로 글쓰기 = 허용됨 (문제!)';
  exception when others then r := r || E'\n[userB] A 명의로 글쓰기 = 차단됨'; end;

  select count(*) into n from public.profiles;
  r := r || E'\n[userB] 볼 수 있는 프로필 = ' || n || '개 (본인 1개여야 정상)';
  reset role;

  -- --------------------------------------------------------- user A --
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', A::text, 'role','authenticated')::text, true);
  select count(*) into n from public.community_posts where id = '99999999-0000-0000-0000-000000000001';
  r := r || E'\n[userA] 본인 대기글 조회 = ' || n || ' (1 이어야 정상)';
  reset role;

  -- ---------------------------------------------------------- admin --
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', ADM::text, 'role','authenticated', 'email','admin@dadamom.test')::text, true);
  select count(*) into n from public.community_posts where status = 'pending';
  r := r || E'\n[admin] 검수 대기 글 조회 = ' || n || '건 (1건 이상이어야 정상)';
  reset role;

  raise exception E'%', r;
end $$;

rollback;
