-- 0038: 협찬·체험단으로 받은 제품 글에 '제품 제공받음' 표시 (경쟁 조사 6번, 표시광고법)
-- 글쓴이가 체크하면 sponsored = true, 앱·웹이 글 위에 표시를 붙인다. 검수·숫자 규칙(0029·0034)은 그대로.
begin;
alter table public.community_posts add column if not exists sponsored boolean not null default false;
notify pgrst, 'reload schema';
commit;
select count(*) filter (where sponsored) as sponsored_posts, count(*) as all_posts from public.community_posts;
