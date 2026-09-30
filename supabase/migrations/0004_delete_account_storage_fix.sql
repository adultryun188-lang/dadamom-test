-- P0-04 후속 : 계정 삭제 함수가 실제로는 동작하지 않던 문제
--
-- 무슨 일인가
--   Supabase 는 storage.objects 에 protect_delete() 트리거를 걸어
--   SQL 로 직접 지우는 것을 막는다 (고아 파일 방지).
--     ERROR 42501: Direct deletion from storage tables is not allowed.
--   delete_my_account() 는 앨범 파일을 무조건 직접 delete 하므로
--   호출하면 항상 예외가 나고 계정이 삭제되지 않았다.
--   security definer 여도 트리거는 그대로 걸린다 (0003 작업 중 실측 확인).
--
--   계정 삭제는 App Store 심사 필수 항목이라 이대로 두면 출시가 막힌다.
--
-- 고치는 방향
--   파일 삭제는 클라이언트가 Storage API 로 먼저 한다.
--   (내 폴더에 대한 delete 정책이 이미 있으므로 권한은 충분하다)
--   이 함수는 DB 행과 계정만 지운다. 함수 안에서는 파일을 건드리지 않는다.
--
--   파일이 일부 안 지워지더라도 계정 삭제 자체는 진행한다.
--   "탈퇴가 안 되는" 상태가 "파일이 남는" 것보다 나쁘기 때문이다.
--   대신 남은 파일 경로를 돌려줘서 클라이언트가 다시 시도하거나 기록할 수 있게 한다.

begin;

create or replace function public.my_media_paths()
returns text[]
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(array_agg(distinct p), '{}')
    from (
      select coalesce(nullif(media_path, ''),
                      split_part(split_part(media_url, '/media/', 2), '?', 1)) as p
        from public.community_posts
       where owner_id = auth.uid()
         and (coalesce(media_path,'') <> '' or coalesce(media_url,'') <> '')
      union all
      select coalesce(nullif(media_path, ''),
                      split_part(split_part(media_url, '/media/', 2), '?', 1))
        from public.challenge_entries
       where owner_id = auth.uid()
         and (coalesce(media_path,'') <> '' or coalesce(media_url,'') <> '')
    ) s
   where p <> '';
$fn$;

revoke all on function public.my_media_paths() from public, anon;
grant execute on function public.my_media_paths() to authenticated;

-- 파일 삭제를 뺀 계정 삭제
create or replace function public.delete_my_account()
returns json
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- auth.users 를 지우면 owner_id 를 참조하는 행들은 on delete cascade / set null 로
  -- 정리된다. 남는 것이 있으면 여기서 명시적으로 지운다.
  delete from public.album_photos where owner_id = uid;
  delete from public.profiles     where id = uid;

  delete from auth.users where id = uid;

  return json_build_object('ok', true);
end $fn$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
