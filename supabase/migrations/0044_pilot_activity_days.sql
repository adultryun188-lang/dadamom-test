-- 테스트 DB용 준비본. 별도 DB 세션에서 적용·보유기간 정리 작업을 검증한 뒤 사용한다.
-- 명시적으로 등록한 파일럿 참여자의 글·댓글 작성만 하루/종류별 최초 시각으로 보존한다.
-- 본문·사진·이메일·원본 글 ID·아이 정보·초대 코드 수집 없음. 기존 행 백필 없음.
begin;
create table if not exists public.pilot_activity_cohort (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null,
  enrolled_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  check(expires_at>enrolled_at)
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
    where c.user_id=new.owner_id and c.expires_at>now() and c.joined_at<=now()
  ) then
    insert into public.pilot_activity_days(user_id,activity_day,kind,first_at)
    values(new.owner_id,(now() at time zone 'Asia/Seoul')::date,action_kind,now())
    on conflict(user_id,activity_day,kind) do nothing;
  end if;
  return new;
exception when others then
  -- 측정 장애 때문에 글/댓글을 실패시키지 않는다. 코드/SQLSTATE만 기록한다.
  raise warning 'pilot activity capture failed: %',sqlstate;
  return new;
end $fn$;
revoke all on function public.capture_pilot_activity_day() from public,anon,authenticated;
drop trigger if exists pilot_post_activity on public.community_posts;
create trigger pilot_post_activity after insert on public.community_posts for each row execute function public.capture_pilot_activity_day();
drop trigger if exists pilot_comment_activity on public.post_comments;
create trigger pilot_comment_activity after insert on public.post_comments for each row execute function public.capture_pilot_activity_day();
commit;

-- 파일럿 등록은 서버/SQL 관리 경로만. 테스트/운영자/시드를 명시적으로 제외한 참여자만 등록.
-- 보유 상한 90일: 별도 DB 세션은 아래 정리를 매일 실행할 작업을 설정·검증해야 한다.
-- delete from public.pilot_activity_cohort where enrolled_at < now()-interval '90 days';
-- 탈퇴와 코호트 삭제는 cascade. 수집 중단은 expires_at을 현재 시각으로 설정.
-- 되돌리기(별도 실행):
-- begin;
-- drop trigger if exists pilot_post_activity on public.community_posts;
-- drop trigger if exists pilot_comment_activity on public.post_comments;
-- drop function if exists public.capture_pilot_activity_day();
-- drop table if exists public.pilot_activity_days;
-- drop table if exists public.pilot_activity_cohort;
-- commit;
