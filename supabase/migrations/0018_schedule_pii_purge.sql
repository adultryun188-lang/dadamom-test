-- =============================================================================
-- 0018_schedule_pii_purge.sql  —  체험단 배송정보 90일 파기를 매일 자동 실행
--
-- 배경
--   0006 이 benefit_applications_pii 에 purge_after(신청일 + 90일)와 purge_expired_pii() 를 만들었지만
--   실제로 부르는 곳이 없었다 (운영·테스트 모두 pg_cron 미설치, 2026-10-16 확인).
--   개인정보처리방침에 "90일 후 파기"를 적으려면 실제로 지워져야 한다. 사장님 결정: 매일 자동 실행.
--
-- 왜 새 함수인가
--   purge_expired_pii() 는 is_admin() 을 확인한다. 예약 작업은 로그인한 사람이 없어 auth.uid() 가 null 이라
--   그대로 부르면 'not allowed' 로 실패한다. 관리자 확인 없는 내부 함수를 두되, 아무 역할에도 EXECUTE 를
--   주지 않는다 (PUBLIC 포함 — 0005 지뢰). 예약 작업은 postgres 로 돌아 소유자 권한으로 실행된다.
--   기존 purge_expired_pii() 는 관리자 화면용으로 그대로 둔다.
--
-- 시각: 매일 18:10 UTC = 한국 03:10. 기준 날짜는 기존 함수와 같은 current_date.
-- 실행 기록: cron.job_run_details 에 남는다.
--
-- ⚠️ 켜는 순간부터 purge_after 가 지난 배송정보(연락처·주소)는 되돌릴 수 없게 지워진다. 신청 이력
--    (benefit_applications: 닉네임·지역·체험단)은 남는다. 이것이 방침의 의도된 동작이다.
-- 적용: 테스트(srxdtddrtnhtlbbviyvs)·운영 2026-10-16 (각각 begin…rollback 리허설 후, 사장님 결정)
-- =============================================================================
begin;

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public._purge_expired_pii_job()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare n integer;
begin
  delete from public.benefit_applications_pii where purge_after < current_date;
  get diagnostics n = row_count;
  return n;
end $fn$;

revoke all on function public._purge_expired_pii_job() from public, anon, authenticated;

-- 같은 이름이 있으면 바꿔 단다 (여러 번 돌려도 작업은 하나)
select cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-pii';
select cron.schedule('purge-expired-pii', '10 18 * * *', 'select public._purge_expired_pii_job()');

commit;

-- 확인
-- select jobname, schedule, command, active from cron.job where jobname = 'purge-expired-pii';
-- select status, return_message, start_time from cron.job_run_details
--  where jobid = (select jobid from cron.job where jobname = 'purge-expired-pii') order by start_time desc limit 5;

-- 되돌리기
-- select cron.unschedule('purge-expired-pii');
-- drop function if exists public._purge_expired_pii_job();
