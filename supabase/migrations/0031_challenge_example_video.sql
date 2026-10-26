-- =============================================================================
-- 0031_challenge_example_video.sql — 챌린지마다 '이렇게 찍어 주세요' 예시 영상 (2026-10-27 사장님 요청)
-- example_video: 사이트 안 파일(./assets/challenge/<id>.mp4) 또는 https 주소. 비우면 예시 영상 칸이 안 나온다.
-- 예시 영상은 Pexels 무료 영상(assets/challenge/README.md). 화면에 '예시 영상'으로 표시하고 참가작으로 쓰지 않는다.
-- 관리 화면 🏆 챌린지에서 바꿀 수 있다.
-- 적용: 테스트 먼저. 운영은 사장님 SQL Editor (0025 다음에).
-- =============================================================================
begin;

alter table public.challenges add column if not exists example_video text
  check (example_video is null or example_video ~ '^(https://|\./assets/)[^\s"<>]+$');

update public.challenges set example_video = './assets/challenge/' || id || '.mp4'
 where id in ('firststep', 'halloween', 'crawl', 'cheeks', 'bump') and example_video is null;

notify pgrst, 'reload schema';
commit;

select id, example_video from public.challenges order by sort_order;
