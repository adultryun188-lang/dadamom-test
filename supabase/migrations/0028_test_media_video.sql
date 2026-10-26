-- =============================================================================
-- 0028_test_media_video.sql — **테스트 전용**: media 버킷에 짧은 영상(mp4) 허용
-- 2026-10-27 사장님: 챌린지에 사진·영상 예시를 넣어 느낌을 보고 싶다("꼭 영상도").
-- 화면은 이미 영상(mediaTag → <video>)을 보여줄 수 있다. 저장소만 사진 전용이었다.
-- 운영에는 아직 넣지 않는다 — 회원 영상 올리기를 열지(용량·검수·비용)는 사장님 결정 뒤에.
-- 되돌리기: allowed_mime_types = array['image/jpeg','image/png','image/webp']
-- =============================================================================
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4']
 where id = 'media';
