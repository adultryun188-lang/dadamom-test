-- =============================================================================
-- 0030_media_video.sql — 회원 영상 올리기 열기 (2026-10-27 사장님: "30초 50MB 로 열어줘")
-- media 버킷: 사진(JPG·PNG·WEBP) + 영상(MP4·MOV), 한 파일 50MB 까지.
-- 사진 25MB·영상 30초는 앱이 올리기 전에 확인한다(저장소는 길이를 모른다). 검수에서 한 번 더 본다.
-- 비공개 버킷·내 폴더만 올리기·서명 URL 10분 규칙(0003)은 그대로.
-- 0028(테스트 전용 mp4 허용)을 대신한다.
-- 적용: 테스트 먼저. 운영은 사장님 SQL Editor.
-- 되돌리기: allowed_mime_types = array['image/jpeg','image/png','image/webp'], file_size_limit = 26214400
-- =============================================================================
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'],
       file_size_limit = 52428800
 where id = 'media';

select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'media';
