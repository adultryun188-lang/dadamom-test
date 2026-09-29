-- =============================================================================
-- 0002_tighten_anon_grants.sql
--
-- 배경
--   Supabase 의 "Automatically expose new tables" 기본값 때문에, public 스키마의
--   테이블 대부분에 anon 역할이 SELECT/INSERT/UPDATE/DELETE 권한을 전부 갖고 있다.
--   실제 행 접근은 RLS 가 막고 있어 지금 뚫리는 구멍은 아니다.
--   (2026-09-29 운영에서 확인: anon 의 admin_emails 조회 0행, INSERT 42501 차단)
--   다만 이 상태에서는 RLS 정책 하나만 잘못 만들어도 바로 사고가 된다.
--   실행계획 원칙 8 "클라이언트 제한을 보안으로 간주하지 않는다" 와 같은 맥락으로,
--   권한 자체를 필요한 만큼만 남긴다.
--
-- 방침
--   anon 에게는 공개 피드를 읽는 SELECT 만 남기고 나머지는 전부 회수한다.
--   anon 은 어떤 테이블에도 쓰지 못한다.
--
-- 적용 순서: 0001 다음
-- 되돌리기: 아래 "롤백" 주석의 grant 문을 실행
-- =============================================================================
begin;

-- 1) public 스키마 전체에서 anon 권한을 걷어낸다
revoke all on all tables in schema public from anon;

-- 2) 공개 열람에 꼭 필요한 SELECT 만 다시 부여
--    (실제 어떤 행이 보이는지는 각 테이블의 RLS 정책이 결정한다)
grant select on public.community_posts    to anon;
grant select on public.post_comments      to anon;
grant select on public.challenge_entries  to anon;
grant select on public.notices            to anon;
grant select on public.outings            to anon;

-- 3) 앞으로 만들어질 테이블에도 anon 권한이 자동으로 붙지 않게 한다
alter default privileges in schema public revoke all on tables from anon;

-- 4) 함수 실행 권한은 유지되어야 하는 것만 남긴다
--    is_blocked 는 RLS 정책 안에서 평가되므로 anon 도 실행할 수 있어야 한다.
--    (없으면 비로그인 커뮤니티 열람이 permission denied 로 깨진다)
grant execute on function public.is_admin()            to anon, authenticated;
grant execute on function public.is_blocked(uuid)      to anon, authenticated;
-- 숫자 증감 RPC 는 anon 에게서 회수한다 (0003 에서 아예 제거 예정)
revoke execute on function public.increment_votes(uuid,int)    from anon;
revoke execute on function public.increment_likes(uuid,int)    from anon;
revoke execute on function public.increment_comments(uuid,int) from anon;

commit;

-- =============================================================================
-- 롤백
-- =============================================================================
-- begin;
-- grant all on all tables in schema public to anon;
-- alter default privileges in schema public grant all on tables to anon;
-- grant execute on function public.increment_votes(uuid,int),
--                          public.increment_likes(uuid,int),
--                          public.increment_comments(uuid,int) to anon;
-- commit;
