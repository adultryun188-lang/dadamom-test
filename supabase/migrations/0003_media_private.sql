-- P0-04 : media 버킷 비공개화
--
-- 문제
--   media 버킷이 public=true 라 한 번 올라간 사진 URL 이 인증 없이 영원히 열렸다.
--   앱은 만료 10년(315360000초)짜리 서명 URL 을 만들어 DB 에 통째로 저장했고,
--   실패하면 공개 URL 로 폴백했다. 글을 지워도, 탈퇴해도 그 URL 은 계속 살아 있었다.
--   경로도 평면(u-<시각>-<난수>.jpg)이라 누가 올린 파일인지 정책으로 가릴 수 없었다.
--
-- 이 마이그레이션이 하는 일
--   1. media_path 컬럼을 추가하고 기존 URL 에서 경로를 뽑아 채운다.
--   2. media 버킷을 비공개로 바꾸고 용량·형식 제한을 건다.
--   3. 읽기를 "승인된 글에 실제로 걸려 있는 파일" 또는 "내가 올린 파일" 로 좁힌다.
--   4. 업로드를 내 폴더(<uid>/...)로만 제한한다.
--
-- 되돌리기: 맨 아래 주석 참고.

begin;

-- ── 1. media_path -----------------------------------------------------------
-- 전체 URL 대신 경로만 저장한다. URL 을 문자열로 쪼개 쓰던 곳이 여럿 있었는데,
-- 서명 URL 형식이 바뀌면 전부 조용히 깨지는 구조였다.
alter table public.community_posts   add column if not exists media_path text;
alter table public.challenge_entries add column if not exists media_path text;

-- 기존 행 채우기: .../object/sign/media/<경로>?token=... 또는 .../object/public/media/<경로>
update public.community_posts
   set media_path = split_part(split_part(media_url, '/media/', 2), '?', 1)
 where media_path is null
   and coalesce(media_url, '') <> ''
   and media_url like '%/media/%';

update public.challenge_entries
   set media_path = split_part(split_part(media_url, '/media/', 2), '?', 1)
 where media_path is null
   and coalesce(media_url, '') <> ''
   and media_url like '%/media/%';

create index if not exists community_posts_media_path_idx
  on public.community_posts (media_path) where media_path is not null;
create index if not exists challenge_entries_media_path_idx
  on public.challenge_entries (media_path) where media_path is not null;

-- ── 2. 버킷 -----------------------------------------------------------------
-- public=false : 이제 서명 URL 없이는 열 수 없다.
-- 25MB / 이미지 3종 : 영상 업로드를 서버에서 막는다. 클라이언트만 막으면
--                     API 를 직접 부르는 쪽은 그대로 통과한다.
update storage.buckets
   set public = false,
       file_size_limit = 26214400,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'media';

-- ── 3. 읽기 정책 ------------------------------------------------------------
-- 승인된 글에 걸려 있는 파일인지 확인한다.
-- security definer 인 이유: 정책 안에서 community_posts 를 직접 참조하면
-- 호출 역할(anon)에 그 테이블 SELECT 권한이 필요해져 permission denied 가 난다.
-- uid 를 인자로 받는 이유: 승인 전 글이라도 글쓴이 본인은 자기 사진을 봐야 한다
-- (검수 대기 중 내 글 미리보기). 옛 평면 경로 파일은 폴더 규칙으로 가릴 수 없어
-- 이 참조 검사가 유일한 통로다. anon 은 uid 가 null 이라 승인된 것만 걸린다.
create or replace function public.media_can_read(obj_name text, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.community_posts
     where media_path = obj_name
       and (status = 'approved' or (uid is not null and owner_id = uid) or public.is_admin())
  ) or exists (
    select 1 from public.challenge_entries
     where media_path = obj_name
       and (status = 'approved' or (uid is not null and owner_id = uid) or public.is_admin())
  );
$fn$;

revoke all on function public.media_can_read(text, uuid) from public;
grant execute on function public.media_can_read(text, uuid) to anon, authenticated;

-- 예전 이름으로 만든 게 있으면 정리
drop function if exists public.media_is_published(text);

drop policy if exists "media public read"          on storage.objects;
drop policy if exists "media authenticated upload" on storage.objects;
drop policy if exists "media public upload"        on storage.objects;
drop policy if exists "media read published or own" on storage.objects;
drop policy if exists "media own upload"           on storage.objects;
drop policy if exists "media own delete"           on storage.objects;

-- 읽기 허용 조건 세 가지
--   ① 승인된 글에 걸려 있는 파일           → 비로그인 둘러보기가 계속 된다
--   ② 검수 대기 중이라도 내가 쓴 글의 파일 → 내 글 미리보기가 깨지지 않는다
--   ③ 내 폴더(<uid>/...)에 있는 파일        → 업로드 직후, 글 저장 전
--   ④ 검수자(is_admin)                      → 승인/반려를 판단하려면 사진을 봐야 한다
-- 옛 평면 경로 파일은 ③에 안 걸리지만 ①②로 계속 열린다.
create policy "media read published or own" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'media'
    and (
      public.media_can_read(name, auth.uid())
      or (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
    )
  );

-- 쓰기: 내 폴더에만. 남의 파일을 덮어쓰거나 버킷 루트를 어지럽힐 수 없다.
create policy "media own upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media own delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 4. 계정 삭제 함수: URL 파싱 대신 media_path 사용 --------------------------
-- 기존 함수는 media_url 을 '/media/' 로 쪼개 경로를 뽑았다. 서명 URL 형식이
-- 바뀌면 조용히 빈 문자열이 나오고, 사진이 안 지워진 채 계정만 사라진다.
-- media_path 를 우선 쓰고, 아직 안 채워진 옛 행만 URL 파싱으로 넘긴다.
create or replace function public.delete_my_account()
returns json language plpgsql security definer set search_path = public, auth, storage as $fn$
declare uid uuid := auth.uid(); paths text[]; n_media int := 0; n_album int := 0;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(array_agg(distinct p), '{}') into paths from (
    select coalesce(nullif(media_path, ''),
                    split_part(split_part(media_url, '/media/', 2), '?', 1)) as p
      from public.community_posts
     where owner_id = uid and (coalesce(media_path,'') <> '' or coalesce(media_url,'') <> '')
    union all
    select coalesce(nullif(media_path, ''),
                    split_part(split_part(media_url, '/media/', 2), '?', 1))
      from public.challenge_entries
     where owner_id = uid and (coalesce(media_path,'') <> '' or coalesce(media_url,'') <> '')
  ) s where p <> '';
  if coalesce(array_length(paths, 1), 0) > 0 then
    delete from storage.objects where bucket_id = 'media' and name = any(paths);
    get diagnostics n_media = row_count;
  end if;
  -- 혹시 남은 내 폴더 파일까지 (글이 이미 지워져 참조가 끊긴 경우)
  delete from storage.objects
   where bucket_id = 'media' and (storage.foldername(name))[1] = uid::text;
  delete from storage.objects where bucket_id = 'album' and (storage.foldername(name))[1] = uid::text;
  get diagnostics n_album = row_count;
  delete from auth.users where id = uid;
  return json_build_object('deleted_media', n_media, 'deleted_album', n_album);
end $fn$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;

-- 되돌리려면:
--   update storage.buckets set public = true, file_size_limit = null,
--          allowed_mime_types = null where id = 'media';
--   drop policy if exists "media read published or own" on storage.objects;
--   drop function if exists public.media_can_read(text, uuid);
--   drop policy if exists "media own upload"  on storage.objects;
--   drop policy if exists "media own delete"  on storage.objects;
--   create policy "media public read" on storage.objects for select using (bucket_id = 'media');
--   create policy "media authenticated upload" on storage.objects for insert to authenticated
--     with check (bucket_id = 'media');
