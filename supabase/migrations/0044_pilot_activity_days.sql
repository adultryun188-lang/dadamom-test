-- 테스트 DB srxdtddrtnhtlbbviyvs 전용. 명시 등록된 가상 fixture로만 검증한다.
-- 본문·사진·이메일·원본 글 ID·아이 정보·초대 코드 없음. 기존 행 백필 없음.
begin;
create table if not exists public.pilot_activity_cohort (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null,
  enrolled_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  check(joined_at<=enrolled_at),
  check(expires_at>enrolled_at and expires_at<=enrolled_at+interval '30 days')
);
create table if not exists public.pilot_activity_days (
  user_id uuid not null references public.pilot_activity_cohort(user_id) on delete cascade,
  activity_day date not null,
  kind text not null check(kind in ('post','comment')),
  first_at timestamptz not null default now(),
  primary key(user_id,activity_day,kind)
);
alter table public.pilot_activity_cohort enable row level security;
alter table public.pilot_activity_days enable row level security;
revoke all on public.pilot_activity_cohort,public.pilot_activity_days from public,anon,authenticated;

create or replace function public.capture_pilot_activity_day()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare action_kind text;
begin
  action_kind := case tg_table_name when 'community_posts' then 'post' when 'post_comments' then 'comment' end;
  if action_kind is not null and exists (
    select 1 from public.pilot_activity_cohort c
    where c.user_id=new.owner_id and c.enrolled_at<=now() and c.expires_at>now() and c.joined_at<=now()
  ) then
    insert into public.pilot_activity_days(user_id,activity_day,kind,first_at)
    values(new.owner_id,(now() at time zone 'Asia/Seoul')::date,action_kind,now())
    on conflict(user_id,activity_day,kind) do nothing;
  end if;
  return new;
exception when others then
  -- 측정 장애 때문에 원본 작성을 실패시키지 않는다. 본문/ID 없이 SQLSTATE만 경고한다.
  raise warning 'pilot activity capture failed: %',sqlstate;
  return new;
end $fn$;
revoke all on function public.capture_pilot_activity_day() from public,anon,authenticated;
drop trigger if exists pilot_post_activity on public.community_posts;
create trigger pilot_post_activity after insert on public.community_posts for each row execute function public.capture_pilot_activity_day();
drop trigger if exists pilot_comment_activity on public.post_comments;
create trigger pilot_comment_activity after insert on public.post_comments for each row execute function public.capture_pilot_activity_day();

-- 일일 작업의 최대 24시간 간격을 고려해 89일 도달 시 정리한다(최대 하루 일찍 삭제).
-- 정상 일일 실행 시 등록 후 90일 상한. 작업 장애/중단 중 자동 파기를 보장하지 않는다.
-- 이 함수는 파일럿 코호트와 그에 종속된 일별 활동만 삭제한다.
create or replace function public.purge_pilot_activity()
returns integer language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare n integer;
begin
  delete from public.pilot_activity_cohort where enrolled_at<=statement_timestamp()-interval '89 days';
  get diagnostics n=row_count;
  return n;
end $fn$;
revoke all on function public.purge_pilot_activity() from public,anon,authenticated;
commit;

-- 스케줄은 scripts/pilot-activity-scheduler.sql에서 별도 리허설/등록한다.
-- 등록은 서버 SQL만. 신규 검증은 전용 가상 fixture에만; 실제 회원 자동등록 금지.
-- joined_at=실제 가입 기준, enrolled_at=파일럿 관찰 시작. 과거 7일을 완전 관찰로 해석하지 않는다.
-- 수집 중단: enrolled_at<now()인 등록의 expires_at=now(); 코호트 삭제/탈퇴는 활동 cascade.
-- 되돌리기: 먼저 전용 cron 작업만 해제(아래 파일 참고) 후 아래를 별도 실행.
-- begin;
-- drop trigger if exists pilot_post_activity on public.community_posts;
-- drop trigger if exists pilot_comment_activity on public.post_comments;
-- drop function if exists public.capture_pilot_activity_day();
-- drop function if exists public.purge_pilot_activity();
-- drop table if exists public.pilot_activity_days;
-- drop table if exists public.pilot_activity_cohort;
-- commit;
