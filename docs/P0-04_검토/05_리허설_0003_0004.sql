-- ════════════════════════════════════════════════════════════════════
--  P0-04 운영 DB 리허설 — 0003 + 0004 을 한 트랜잭션에 넣고 ROLLBACK
--  운영 프로젝트 SQL Editor 에 이 파일 전체를 붙여 한 번 실행하세요.
--
--  맨 아래가 rollback; 입니다. 아무것도 남지 않습니다.
--  손으로 begin;/commit; 을 지울 필요가 없게 미리 벗겨 두었습니다.
--
--  0003 과 0004 를 같이 넣은 이유: 0004 의 my_media_paths() 와
--  delete_my_account() 는 0003 이 만드는 media_path 컬럼에 의존합니다.
--  따로 리허설하면 0004 가 '컬럼 없음' 으로 실패합니다.
--
--  보셔야 할 것은 맨 끝의 표 4개입니다. 기대값을 각 표 위에 적어뒀습니다.
--  그 결과를 그대로 복사해서 알려주세요.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────── 0003_media_private.sql ─────────────────────────

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


-- ──────────────── 0004_delete_account_storage_fix.sql ────────────────

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


-- ════════════════════════════════════════════════════════════════════
--  확인 — 아래 4개 표의 결과를 알려주세요
-- ════════════════════════════════════════════════════════════════════

-- [표 1] 백필 — 전체 와 경로채워짐 이 **같아야** 합니다.
--        다르면 운영 적용을 하지 않습니다 (코드 배포 시 그 행 사진이 사라집니다).
select 'community_posts'   as 테이블,
       count(*)                                                as 전체,
       count(*) filter (where coalesce(media_path,'') <> '')    as 경로채워짐,
       count(*) filter (where coalesce(media_path,'') =  '')    as 못채움
  from public.community_posts where coalesce(media_url,'') <> ''
union all
select 'challenge_entries',
       count(*),
       count(*) filter (where coalesce(media_path,'') <> ''),
       count(*) filter (where coalesce(media_path,'') =  '')
  from public.challenge_entries where coalesce(media_url,'') <> '';

-- [표 2] 버킷 — 기대: public=false / 26214400 / {image/jpeg,image/png,image/webp}
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'media';

-- [표 3] 정책 — 기대: 아래 3개가 있고, "media public read" 는 **없어야** 합니다.
--        media read published or own (SELECT) / media own upload (INSERT) / media own delete (DELETE)
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'media%'
 order by policyname;

-- [표 4] 함수 — 기대: 네 칸 모두 null 이 아님
select to_regprocedure('public.media_can_read(text,uuid)') as media_can_read,
       to_regprocedure('public.my_media_paths()')          as my_media_paths,
       to_regprocedure('public.delete_my_account()')       as delete_my_account,
       to_regprocedure('public.is_admin()')                as is_admin;

-- 못 채운 행이 있으면 어떤 URL 인지도 같이 봅니다 (0건이면 빈 결과)
select 'community_posts' as 테이블, id, owner_id, left(media_url, 140) as media_url
  from public.community_posts
 where coalesce(media_url,'') <> '' and coalesce(media_path,'') = ''
union all
select 'challenge_entries', id, owner_id, left(media_url, 140)
  from public.challenge_entries
 where coalesce(media_url,'') <> '' and coalesce(media_path,'') = '';

-- ════════════════════════════════════════════════════════════════════
rollback;
-- ════════════════════════════════════════════════════════════════════
-- 되돌렸습니다. 운영에 남은 변경은 없습니다.
