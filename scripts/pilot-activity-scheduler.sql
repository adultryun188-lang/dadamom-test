-- srxdtddrtnhtlbbviyvs SQL Editor postgres 전용. pg_cron 설치를 사전에 확인한다.
-- 기존 다른 작업은 읽거나 바꾸지 않는다. 명령/소유자가 다르면 덮어쓰지 않고 중단.
-- 리허설: 아래 commit을 rollback으로 바꾸고, 이후 job가 없음을 확인한다.
begin;
do $guard$
begin
  if exists(select 1 from cron.job where jobname='dadamom-pilot-activity-purge-daily'
    and (command<>'select public.purge_pilot_activity()' or username<>current_user)) then
    raise exception 'pilot scheduler name collision';
  end if;
  if current_setting('cron.timezone',true) is not null and current_setting('cron.timezone',true)<>'GMT'
    and current_setting('cron.timezone',true)<>'UTC' then
    raise exception 'cron timezone must be UTC/GMT';
  end if;
end $guard$;
-- 기존 전용 작업을 명시적으로 해제한 뒤 재등록한다. 다른 작업은 해제하지 않는다.
select cron.unschedule(jobid) from cron.job where jobname='dadamom-pilot-activity-purge-daily';
-- 18:20 UTC = 매일 한국 03:20. 매일 정상 실행 시 89~90일 사이 파기.
select cron.schedule('dadamom-pilot-activity-purge-daily','20 18 * * *','select public.purge_pilot_activity()');
commit;
-- 실행 확인은 이 이름으로 얻은 jobid만 cron.job_run_details에서 조회한다.
-- 수동 실행: select public.purge_pilot_activity(); (실제 cron 실행 이력과 구분)
-- 되돌리기(전용 작업만): select cron.unschedule('dadamom-pilot-activity-purge-daily');
-- 0044 drop 전 반드시 위 해제. 다른 정리 작업은 해제하지 않는다.
