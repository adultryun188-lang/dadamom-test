-- =============================================================================
-- 0013_fix_search_path.sql  —  함수 search_path 고정
--
-- 배경
--   2026-10-06 보안 권고(get_advisors)에서 function_search_path_mutable 로 잡혔다.
--   search_path 가 가변인 SECURITY DEFINER 함수는 권한 상승 경로가 된다.
--   호출자가 search_path 를 조작해 함수 본문이 참조하는 이름을 자기 스키마의
--   같은 이름으로 가로챌 수 있다. is_admin() 이 특히 위험하다 —
--   SECURITY DEFINER 로 돌면서 관리자 판정을 내리는 함수다.
--
--   0006 이 만든 mask_contact·mask_address 에도 빠져 있었다.
--   0007(0006 의 구멍 막기)이 이 부분은 다루지 않았다.
--
-- 왜 create or replace 가 아니라 alter function 인가
--   본문을 다시 쓸 필요가 없다. 설정만 붙인다. 본문을 옮겨 적으면
--   그 과정에서 달라질 위험만 생긴다.
--
-- increment_votes·increment_likes·increment_comments 는 여기서 다루지 않는다.
--   0005 가 drop 한다. 지워질 함수에 설정을 붙일 이유가 없다.
--
-- 적용 완료: 2026-10-14 운영(hjqchbpxwviengdzvado) · 테스트(srxdtddrtnhtlbbviyvs) 양쪽
-- =============================================================================
begin;

alter function public.is_admin()         set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.mask_contact(text) set search_path = public;
alter function public.mask_address(text) set search_path = public;

commit;

-- 확인: 네 줄 다 proconfig 에 search_path=public 이 보여야 한다
-- select p.proname, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname='public'
--    and p.proname in ('is_admin','touch_updated_at','mask_contact','mask_address');

-- 되돌리기
-- alter function public.is_admin()         reset search_path;
-- alter function public.touch_updated_at() reset search_path;
-- alter function public.mask_contact(text) reset search_path;
-- alter function public.mask_address(text) reset search_path;
