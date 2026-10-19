-- ════════════════════════════════════════════════════════════════════
--  운영 DB 에 빠져 있던 0002 · 0009 · 0010 (2026-10-19 점검에서 발견)
--
--  왜: 2026-10-09 인수인계 표에는 0009·0010 이 운영 ✅ 로 적혀 있지만,
--      2026-10-19 운영 스키마를 직접 읽어 보니 둘 다 없었다.
--        - 0009 benefit_applications_one_per_trial 유니크 인덱스 없음
--          → 같은 체험단에 한 사람이 여러 번 신청할 수 있다
--        - 0010 trial_application_counts() 함수 없음
--          → 체험단 카드의 "n / 모집 인원" 이 0 으로 보이고 마감 판단이 안 된다
--      0002(비로그인 쓰기 권한 회수)도 아직 안 돼 있다. RLS 가 막고 있어 API 로 뚫리진 않지만
--      anon 에 INSERT·UPDATE·DELETE·TRUNCATE 권한이 남아 있다 (방어선이 하나뿐).
--
--  0002 원본을 그대로 쓰지 않는 이유: 원본은 increment_* 함수 권한을 회수하는데,
--  운영에서는 0005 로 그 함수들이 이미 지워져 "함수 없음" 오류로 전체가 멈춘다.
--  여기서는 그 줄만 뺐다. 나머지는 supabase/migrations/0002·0009·0010 과 같다.
--
--  지금 운영 상태(2026-10-19): 체험단 신청 0건, 중복 0건 → 0009 는 바로 걸린다.
--  안전장치: 테스트 DB(가족 공유 표가 있음)에서 돌리면 멈춘다. 중복 신청이 있으면 멈춘다.
--  적용: 사장님 승인 후. 먼저 begin…rollback 리허설 (2026-10-19 리허설 통과 기록은 아래).
-- ════════════════════════════════════════════════════════════════════
begin;

do $where$
begin
  if to_regclass('public.family_members') is not null then
    raise exception '중단: 테스트 DB 입니다 (가족 공유 표가 있음). 운영 프로젝트에서 실행하세요.';
  end if;
end $where$;

-- 0002 — 비로그인(anon)은 공개 목록 읽기만
revoke all on all tables in schema public from anon;
grant select on public.community_posts    to anon;
grant select on public.post_comments      to anon;
grant select on public.challenge_entries  to anon;
grant select on public.notices            to anon;
grant select on public.outings            to anon;
alter default privileges in schema public revoke all on tables from anon;
grant execute on function public.is_admin()       to anon, authenticated;
grant execute on function public.is_blocked(uuid) to anon, authenticated;

-- 0009 — 같은 체험단 한 사람 한 번
do $chk$
declare dups text;
begin
  select string_agg(owner_id::text || ' / ' || trial_key || ' (' || c || '건)', ', ')
    into dups
    from (select owner_id, trial_key, count(*) c
            from public.benefit_applications
           group by owner_id, trial_key
          having count(*) > 1) d;
  if dups is not null then
    raise exception '중복 신청이 이미 있습니다. 어느 건을 남길지 먼저 정하세요: %', dups
      using errcode = '23505';
  end if;
end $chk$;
create unique index if not exists benefit_applications_one_per_trial
  on public.benefit_applications (owner_id, trial_key);

-- 0010 — 체험단별 신청자 "수"만 (누가 신청했는지는 안 나간다)
create or replace function public.trial_application_counts()
returns table (trial_key text, n bigint)
language sql stable security definer set search_path = public as $fn$
  select trial_key, count(*)
    from public.benefit_applications
   group by trial_key;
$fn$;
revoke all on function public.trial_application_counts() from public;
grant execute on function public.trial_application_counts() to anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- 확인 (적용 뒤)
-- select has_table_privilege('anon','public.community_posts','select')   as 비로그인_글읽기,      -- true
--        has_table_privilege('anon','public.community_posts','insert')   as 비로그인_글쓰기,      -- false
--        has_table_privilege('anon','public.benefit_applications','select') as 비로그인_신청읽기, -- false
--        to_regclass('public.benefit_applications_one_per_trial') is not null as 중복방지,      -- true
--        to_regprocedure('public.trial_application_counts()') is not null      as 신청수함수;   -- true
