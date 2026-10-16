-- 가족 나가기·구성원 제거·탈퇴: 공유 종료 이력과 계정 연결 해제를 같은 트랜잭션으로 처리.
-- 0016 이후, 테스트 DB에 먼저 적용. 운영 적용은 별도 승인 대상.
begin;

do $guard$
begin
  if to_regclass('public.family_members') is null
     or to_regclass('public.family_records') is null
     or to_regprocedure('public._family_leave(uuid)') is null then
    raise exception '0017 중단: 0016 가족 공유가 먼저 적용돼야 합니다.';
  end if;
end $guard$;

-- 가족이 이미 없어도 재시도할 수 있다. 같은 종료를 재시도하면 false 이력을 중복 생성하지 않는다.
-- 강제 제거도 호출되므로 scope는 자발적 철회라고 단정하지 않는 membership_end로 남긴다.
create or replace function public._record_family_end(p_uid uuid, p_family uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare latest boolean;
begin
  -- auth.users의 FK cascade 중에는 사용자가 이미 삭제됐고, 원장도 함께 삭제된다.
  if not exists (select 1 from auth.users where id = p_uid) then return; end if;
  select granted into latest from public.consent_records
   where owner_id = p_uid and kind = 'family_share'
   order by created_at desc, granted limit 1;
  if latest is distinct from false then
    insert into public.consent_records(owner_id, kind, granted, doc_version, scope, subject_id, created_at)
    values (p_uid, 'family_share', false, 'v1', 'family_membership_end', p_family, clock_timestamp());
  end if;
end $fn$;
revoke all on function public._record_family_end(uuid, uuid) from public, anon, authenticated;

create or replace function public.family_member_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare bad_author boolean;
begin
  -- 하나라도 실패하면 구성원 DELETE까지 모두 rollback된다.
  perform public._record_family_end(old.user_id, old.family_id);
  -- 기록 트리거는 깊이 2로 호출된다. 0016의 FK 정리용 분기가 조작자 uid로 다시 덮어쓰지 않는다.
  with cleared as (
    update public.family_records set updated_by = null
     where family_id = old.family_id and updated_by = old.user_id returning updated_by
  ) select bool_or(updated_by is not null) into bad_author from cleared;
  if coalesce(bad_author, false) then raise exception 'family_author_cleanup_failed'; end if;
  return old;
end $fn$;
revoke all on function public.family_member_cleanup() from public, anon, authenticated;

drop trigger if exists family_member_cleanup on public.family_members;
create trigger family_member_cleanup after delete on public.family_members
  for each row execute function public.family_member_cleanup();

-- 기존 클라이언트의 leave_family도 원자적으로 종료한다. 새 클라이언트는 완료 마커를 확인한다.
create or replace function public.leave_family()
returns json language plpgsql security definer set search_path = '' as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  -- 같은 계정의 나가기 재시도를 직렬화한다. 가족 잠금은 0016 _family_leave가 잡는다.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 17));
  perform public._family_leave(uid);
  -- 앞선 통신에서 종료됐거나 동의만 남아 있던 경우도 false 기록을 보장한다.
  perform public._record_family_end(uid, null);
  return json_build_object('ok', true, 'consent_revoked', true, 'privacy_version', 17);
end $fn$;
revoke all on function public.leave_family() from public, anon;
grant execute on function public.leave_family() to authenticated;

-- 새 앱은 DB 버전을 확인한 뒤 나간다. 미적용 DB에서는 옛 종료 처리를 호출하지 않는다.
create or replace function public.family_privacy_version()
returns integer language sql stable set search_path = '' as $fn$ select 17; $fn$;
revoke all on function public.family_privacy_version() from public, anon;
grant execute on function public.family_privacy_version() to authenticated;

-- 과거에 나간 계정의 잔존 연결만 보정한다. 기록 본문·시각은 유지한다.
-- ALTER TABLE의 잠금과 같은 트랜잭션 안에서 이 트리거만 잠시 멈춘다.
alter table public.family_records disable trigger family_records_stamp;
update public.family_records r set updated_by = null
 where r.updated_by is not null and not exists (
   select 1 from public.family_members m
    where m.family_id = r.family_id and m.user_id = r.updated_by
 );
alter table public.family_records enable trigger family_records_stamp;

notify pgrst, 'reload schema';
commit;

-- 복구 시 0016의 leave_family를 복원하고 새 trigger/내부 함수/version 함수를 제거한다.
-- false 종료 이력은 지우지 않는다. 해제한 updated_by는 자동 복원되지 않는다.
