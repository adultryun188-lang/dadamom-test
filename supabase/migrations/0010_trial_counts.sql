-- =============================================================================
-- 0010_trial_counts.sql  —  체험단 신청 인원수를 제대로 보여주기
--
-- 발견 경위
--   앱은 체험단 카드에 "n / 60명 신청" 과 진행 막대를 그립니다. 그 n 을
--   `select id, {count:'exact', head:true}` 로 가져오는데, benefit_applications 의
--   RLS 는 **본인 행만** 보여줍니다. 그래서 n 은 언제나 0 아니면 1 이었습니다.
--
--   - 모든 사용자에게 진행 막대가 비어 있었습니다.
--   - "모집 인원이 다 차면 마감" 로직(`count >= t.total`)도 영영 작동하지 않았습니다.
--
--   숫자를 보여주려고 RLS 를 열면 누가 신청했는지가 드러납니다. 그건 P0-05 의
--   방향과 정면으로 어긋납니다. 그래서 **합계만** 돌려주는 함수를 따로 둡니다.
--
-- 돌려주는 것: (체험단 키, 신청자 수). 누가 신청했는지는 포함하지 않습니다.
--
-- 적용 순서: 0009 다음
-- =============================================================================
begin;

create or replace function public.trial_application_counts()
returns table (trial_key text, n bigint)
language sql stable security definer set search_path = public as $fn$
  select trial_key, count(*)
    from public.benefit_applications
   group by trial_key;
$fn$;

-- 합계는 비로그인에게도 보여주는 값이라 anon 에게도 연다.
-- (누가 신청했는지는 이 함수로 알 수 없다.)
revoke all on function public.trial_application_counts() from public;
grant execute on function public.trial_application_counts() to anon, authenticated;

comment on function public.trial_application_counts() is
  '체험단별 신청자 "수"만. RLS 를 열지 않고 진행 막대를 그리기 위한 것. 신청자 신원은 안 나간다.';

notify pgrst, 'reload schema';

commit;

-- =============================================================================
-- 되돌리기
-- =============================================================================
-- drop function if exists public.trial_application_counts();
