-- ════════════════════════════════════════════════════════════════════
--  P0-04 추가 사전 점검 — [0] 블록과 같이 돌려주세요 (읽기만 합니다)
--
--  04_SQL_실행순서.sql 의 [0] 이 못 보는 두 가지를 봅니다.
--  둘 다 "리허설이 성공해도 운영에서 터지는" 종류라 미리 봐야 합니다.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- [A] storage.objects 의 **모든** 정책 — 이게 제일 중요합니다
--
-- 0003 은 이름이 'media ...' 로 시작하는 정책만 지웁니다.
-- 그런데 운영 Storage 화면에 이런 경고가 떠 있습니다:
--   "Clients can list all files in this bucket
--    A broad SELECT policy on storage.objects allows clients to
--    retrieve a full list of files."
--
-- 그 넓은 정책의 이름이 'media' 로 시작하지 않으면 0003 이 못 지우고 **살아남습니다.**
-- RLS 정책은 OR 로 묶이므로, 하나라도 전부 허용하는 정책이 남아 있으면
-- 새로 만든 좁은 정책은 아무 의미가 없습니다. 버킷을 private 으로 바꿔도
-- 로그인만 하면(또는 anon 으로) 전부 읽힙니다. **P0-04 가 통째로 무력화됩니다.**
--
-- 기대: 아래 목록에 'media' 로 시작하지 않는 SELECT 정책이 없어야 합니다.
--       있으면 그 이름과 qual 을 그대로 보내주세요. 0003 에 drop 을 추가하겠습니다.
-- ─────────────────────────────────────────────────────────────────────
select policyname      as 정책이름,
       cmd             as 동작,
       roles           as 대상역할,
       permissive      as 허용방식,
       qual            as using_조건,
       with_check      as withcheck_조건
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by cmd, policyname;


-- ─────────────────────────────────────────────────────────────────────
-- [B] delete_my_account() 가 실행 중에 건드리는 것들이 진짜 있는지
--
-- 0004 의 delete_my_account() 는 plpgsql 입니다. plpgsql 본문은 **만들 때
-- 검사하지 않습니다.** 그래서 리허설이 깨끗이 통과해도, 실제로 탈퇴를
-- 눌렀을 때 "그런 테이블 없음(42P01)" 으로 터질 수 있습니다.
--
-- 그러면 "계정 삭제가 항상 실패하는" 지금 상태가 에러 메시지만 바뀐 채
-- 그대로 남습니다. P0-04 를 하는 이유 자체가 사라집니다.
--
-- (media_can_read 와 my_media_paths 는 language sql 이라 만들 때 검사되므로
--  리허설이 잡아줍니다. 여기서 볼 필요 없습니다.)
--
-- 기대: 네 칸 모두 1
-- ─────────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='profiles')        as profiles_테이블,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='id')                                       as profiles_id,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='album_photos')    as album_photos_테이블,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='album_photos'
      and column_name='owner_id')                                 as album_photos_owner_id;


-- ─────────────────────────────────────────────────────────────────────
-- [C] 덤 — media 버킷 파일과 DB 참조가 서로 맞는지
--
-- 대시보드에서 센 파일은 10개입니다 (jpg 6 · mp4 3 · dadamom.html 1).
-- 어느 글에도 안 걸린 파일은 이동 스크립트가 건드리지 않아 루트에 남고,
-- 그 파일로 예전에 나간 서명 URL 이 있으면 계속 열립니다.
--
-- 기대: 참조없는파일 목록에 dadamom.html 과 (지우기로 한 것 외에) 뭐가 더 있는지 확인
-- ─────────────────────────────────────────────────────────────────────
with 파일 as (
  select name from storage.objects where bucket_id = 'media'
),
참조 as (
  select media_path as name from public.community_posts   where coalesce(media_path,'') <> ''
  union
  select media_path            from public.challenge_entries where coalesce(media_path,'') <> ''
)
select f.name as 참조없는파일
  from 파일 f
 where not exists (select 1 from 참조 r where r.name = f.name)
 order by f.name;

-- ⚠️ [C] 는 media_path 가 채워진 뒤에야 의미가 있습니다.
--    0003 적용 **전**에 돌리면 전부 "참조없음" 으로 나옵니다.
--    0003 을 실제 적용한 **뒤에** 다시 한 번 돌려주세요.
