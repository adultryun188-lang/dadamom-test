-- P0-04 운영 DB 작업 — Supabase SQL Editor 에 붙여 쓰는 순서
-- 운영 프로젝트: hjqchbpxwviengdzvado
-- 한 블록씩, 위에서 아래로. 결과를 보고 다음으로 넘어갑니다.


-- ════════════════════════════════════════════════════════════
-- [0] 사전 점검 — 0003 이 의존하는 것들이 운영에 실제로 있는지
--     (저장소의 0001 은 '재구성한 기준선' 이라 운영과 다를 수 있습니다)
-- ════════════════════════════════════════════════════════════
select
  to_regprocedure('public.is_admin()')            as is_admin_있나,
  to_regprocedure('public.is_blocked(uuid)')      as is_blocked_있나,
  to_regprocedure('public.delete_my_account()')   as delete_my_account_있나,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='challenge_entries'
      and column_name='owner_id')                 as ce_owner_id,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='community_posts'
      and column_name='owner_id')                 as cp_owner_id,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='album_photos'
      and column_name='path')                     as album_path,
  (select public from storage.buckets where id='media') as media_지금_public;

-- 기대: 앞의 셋이 null 이 아니고, 숫자 셋이 모두 1, media_지금_public = true
-- 하나라도 어긋나면 멈추고 보고하세요.


-- ── 백필 대상이 몇 건인지 미리 보기 (읽기만 함) ──────────────
select 'community_posts' as 테이블,
       count(*) filter (where coalesce(media_url,'') <> '')                      as url있음,
       count(*) filter (where coalesce(media_url,'') <> '' and media_url like '%/media/%') as 백필가능,
       count(*) filter (where coalesce(media_url,'') <> '' and media_url not like '%/media/%') as 백필불가
  from public.community_posts
union all
select 'challenge_entries',
       count(*) filter (where coalesce(media_url,'') <> ''),
       count(*) filter (where coalesce(media_url,'') <> '' and media_url like '%/media/%'),
       count(*) filter (where coalesce(media_url,'') <> '' and media_url not like '%/media/%')
  from public.challenge_entries;

-- 백필불가 가 0 이 아니면, 아래로 그 행들을 먼저 보세요.
select 'community_posts' as 테이블, id, owner_id, left(media_url, 120) as media_url
  from public.community_posts
 where coalesce(media_url,'') <> '' and media_url not like '%/media/%'
union all
select 'challenge_entries', id, owner_id, left(media_url, 120)
  from public.challenge_entries
 where coalesce(media_url,'') <> '' and media_url not like '%/media/%';


-- ════════════════════════════════════════════════════════════
-- [1] 리허설 — 0003 을 begin; … rollback; 으로 감싸 실행
--     0003_media_private.sql 파일 내용의 맨 위 begin; 과 맨 아래 commit; 을
--     지우고, 아래처럼 감싸서 붙입니다.
-- ════════════════════════════════════════════════════════════
-- begin;
--   <<< 0003_media_private.sql 본문 (begin;/commit; 제외) >>>
--
--   -- 리허설 안에서 바로 확인
--   select 'community_posts' as 테이블,
--          count(*) as 전체,
--          count(*) filter (where coalesce(media_path,'') <> '') as 경로채워짐
--     from public.community_posts where coalesce(media_url,'') <> ''
--   union all
--   select 'challenge_entries', count(*),
--          count(*) filter (where coalesce(media_path,'') <> '')
--     from public.challenge_entries where coalesce(media_url,'') <> '';
--
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id='media';
--
--   select policyname from pg_policies
--    where schemaname='storage' and tablename='objects' order by policyname;
-- rollback;

-- 리허설에서 전체 = 경로채워짐 이어야 합니다. 다르면 여기서 멈춥니다.


-- ════════════════════════════════════════════════════════════
-- [2] 실제 적용 — 0003 그대로 (파일에 begin;/commit; 이 이미 있습니다)
--     그 다음 0004 그대로.
-- ════════════════════════════════════════════════════════════
-- 1) supabase/migrations/0003_media_private.sql  전체 실행
-- 2) supabase/migrations/0004_delete_account_storage_fix.sql  전체 실행


-- ════════════════════════════════════════════════════════════
-- [3] 적용 후 관문 — 이 숫자가 안 맞으면 코드 배포를 하지 마세요
--     (새 코드는 공개 URL 폴백이 없어, 백필이 놓친 행은 사진이 사라집니다)
-- ════════════════════════════════════════════════════════════
select 'community_posts' as 테이블,
       count(*) as 전체,
       count(*) filter (where coalesce(media_path,'') <> '') as 경로채워짐
  from public.community_posts where coalesce(media_url,'') <> ''
union all
select 'challenge_entries', count(*),
       count(*) filter (where coalesce(media_path,'') <> '')
  from public.challenge_entries where coalesce(media_url,'') <> '';

-- 버킷·정책·함수 확인
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id='media';
-- 기대: public=false, 26214400, {image/jpeg,image/png,image/webp}

select policyname, cmd, roles from pg_policies
 where schemaname='storage' and tablename='objects' order by policyname;
-- 기대: "media read published or own"(select), "media own upload"(insert),
--       "media own delete"(delete) 가 있고, "media public read" 는 없음

select to_regprocedure('public.media_can_read(text,uuid)') as media_can_read,
       to_regprocedure('public.my_media_paths()')          as my_media_paths;
-- 기대: 둘 다 null 이 아님


-- ════════════════════════════════════════════════════════════
-- [4] 파일 이동 뒤 — 루트에 남은 파일 확인 (예전 서명 URL 로 계속 열리는 것들)
-- ════════════════════════════════════════════════════════════
select name, (metadata->>'size')::bigint as 바이트, metadata->>'mimetype' as 형식, created_at
  from storage.objects
 where bucket_id='media' and name not like '%/%'
 order by name;

-- 이동 결과도 같이
select 'community_posts' as 테이블,
       count(*) filter (where media_path like '%/%')     as 새경로,
       count(*) filter (where media_path not like '%/%'
                         and coalesce(media_path,'') <> '') as 옛경로남음,
       count(*) filter (where coalesce(media_url,'') <> '') as url_아직있음
  from public.community_posts
union all
select 'challenge_entries',
       count(*) filter (where media_path like '%/%'),
       count(*) filter (where media_path not like '%/%'
                         and coalesce(media_path,'') <> ''),
       count(*) filter (where coalesce(media_url,'') <> '')
  from public.challenge_entries;
-- 기대: 옛경로남음 = 0, url_아직있음 = 0


-- ════════════════════════════════════════════════════════════
-- [참고] 스크립트가 '파일은 옮겼는데 DB 갱신 실패' 를 낸 경우의 수동 복구
--        (지시서에 없는 상황입니다 — 재실행으로는 안 고쳐집니다)
-- ════════════════════════════════════════════════════════════
-- update public.community_posts
--    set media_path = owner_id::text || '/' || media_path, media_url = null
--  where id = '<보고된 id>';
