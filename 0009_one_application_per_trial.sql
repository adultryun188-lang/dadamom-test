-- =============================================================================
-- 0009_one_application_per_trial.sql  —  같은 체험단에 두 번 신청되지 않게
--
-- 발견 경위
--   P0-05 UI 검증 중에 알았습니다. "신청 완료" 로 버튼이 잠기는 건
--   state.applied 라는 **기기 localStorage 값**뿐이고, 서버에는 아무 제약이 없습니다.
--   브라우저 저장소를 지우거나 다른 기기에서 열면 같은 체험단에 몇 번이든
--   다시 신청됩니다. 실제로 하나의 계정으로 같은 체험단에 2건을 만들어
--   검수자 목록에 둘 다 뜨는 것을 확인했습니다.
--
--   당첨자를 추첨한다면 한 사람이 표를 여러 장 갖는 셈이고,
--   배송 목록에도 같은 사람이 중복으로 들어갑니다.
--
-- 이 파일이 하는 일
--   (owner_id, trial_key) 에 유니크 인덱스. 서버가 직접 막습니다.
--
-- ⚠️ 운영 적용 전 반드시: 이미 중복이 있으면 인덱스 생성이 실패합니다.
--   아래 사전 점검이 중복을 찾으면 **먼저 사람이 판단**해야 합니다
--   (어느 건을 남길지는 제품 결정이라 여기서 자동으로 지우지 않습니다).
--
-- 남은 과제(앱 코드): 지금은 중복 시도가 DB 오류로 막히기만 합니다.
--   앱이 시작할 때 서버에서 내 신청 목록을 읽어 state.applied 를 채우도록
--   고쳐야 다른 기기에서도 "신청 완료" 가 제대로 보입니다.
--
-- 적용 순서: 0008 다음
-- =============================================================================
begin;

-- ── 사전 점검: 중복이 있으면 여기서 멈춘다 ──
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

comment on index public.benefit_applications_one_per_trial is
  '한 사람이 같은 체험단에 두 번 신청하지 못하게. 기기 localStorage 플래그로는 못 막는다.';

commit;

-- =============================================================================
-- 되돌리기
-- =============================================================================
-- drop index if exists public.benefit_applications_one_per_trial;
