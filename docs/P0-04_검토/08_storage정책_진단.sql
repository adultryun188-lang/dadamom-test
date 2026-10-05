-- ════════════════════════════════════════════════════════════════════
--  P0-04 마지막 확인 — storage 읽기가 정말 좁혀졌는지
--  운영 Supabase(hjqchbpxwviengdzvado) SQL Editor.
--  읽기만 합니다. 바뀌는 것 없습니다. 결과 표 4개를 알려주세요.
--
--  왜 중요한가
--    0003 은 이름이 'media ...' 인 정책만 drop 합니다. 운영에 이름이 다른
--    넓은 SELECT 정책이 남아 있으면 지워지지 않습니다. RLS 정책은 OR 로
--    묶이므로, 전부 허용하는 정책 하나가 살아남으면 새로 만든 좁은 정책이
--    아무 의미가 없습니다. 버킷을 private 으로 바꿔도 다 읽힙니다.
--    → P0-04 가 통째로 무력화됩니다.
-- ════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- [표 1] 가장 중요 — RLS 자체가 켜져 있나
--
-- 정책을 아무리 좁혀도 RLS 가 꺼져 있으면 전부 무시됩니다.
-- 기대: rls_켜짐 = true, rls_강제 = 무엇이든 상관없음
-- ─────────────────────────────────────────────────────────────────────
select c.relname            as 테이블,
       c.relrowsecurity     as rls_켜짐,
       c.relforcerowsecurity as rls_강제
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'storage' and c.relname in ('objects','buckets');


-- ─────────────────────────────────────────────────────────────────────
-- [표 2] storage.objects 의 모든 정책 — 이름으로 거르지 않습니다
--
-- 기대: SELECT 정책이 "media read published or own" 과 album 용 하나뿐.
--       그 밖에 SELECT 정책이 있으면 using_조건 을 보내주세요.
-- ─────────────────────────────────────────────────────────────────────
select policyname  as 정책이름,
       cmd         as 동작,
       roles       as 대상역할,
       permissive  as 허용방식,
       qual        as using_조건,
       with_check  as withcheck_조건
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by cmd, policyname;


-- ─────────────────────────────────────────────────────────────────────
-- [표 3] 자동 판정 — 위험해 보이는 SELECT 정책만 골라냅니다
--
-- 아래 조건 중 하나라도 걸리면 '위험' 으로 표시합니다:
--   · using 조건에 bucket_id 가 아예 없다  → 모든 버킷에 적용된다
--   · using 조건이 true 다                 → 전부 허용
--   · media 버킷을 가리키는데 media_can_read / foldername 검사가 없다
--
-- 기대: 0행. 한 행이라도 나오면 그 이름과 using_조건 을 보내주세요.
-- ─────────────────────────────────────────────────────────────────────
select policyname as 위험정책, roles as 대상역할, qual as using_조건,
       case
         when qual is null                                 then 'using 없음 = 전부 허용'
         when btrim(qual) = 'true'                          then 'using (true) = 전부 허용'
         when qual not like '%bucket_id%'                   then 'bucket_id 조건 없음 = 모든 버킷'
         when qual like '%''media''%'
          and qual not like '%media_can_read%'
          and qual not like '%foldername%'                  then 'media 인데 범위 검사 없음'
       end as 이유
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and cmd in ('SELECT','ALL')
   and (
     qual is null
     or btrim(qual) = 'true'
     or qual not like '%bucket_id%'
     or (qual like '%''media''%' and qual not like '%media_can_read%' and qual not like '%foldername%')
   )
 order by policyname;


-- ─────────────────────────────────────────────────────────────────────
-- [표 4] 버킷 상태 재확인 — media 는 public=false 여야 합니다
-- ─────────────────────────────────────────────────────────────────────
select id as 버킷, public as 공개, file_size_limit as 용량제한, allowed_mime_types as 허용형식
  from storage.buckets
 order by id;


-- ════════════════════════════════════════════════════════════════════
--  [표 3] 에 뭔가 나왔을 때의 처방 — 이름을 알려주시면 제가 확정해 드립니다
--
--  섣불리 지우면 안 됩니다. album 버킷이나 Supabase 가 내부로 쓰는 정책을
--  지우면 성장앨범이 깨집니다. 그래서 이름과 using 조건을 보고 판단합니다.
--
--  (참고) 지울 때의 형태:
--    drop policy if exists "<표 3 이 알려준 이름>" on storage.objects;
--  그 뒤 [표 2] 를 다시 돌려 SELECT 정책이 둘(media·album)만 남는지 확인합니다.
-- ════════════════════════════════════════════════════════════════════
