-- 0040: 민감할 수 있는 사진(수유·목욕 등)은 흐리게, 눌러야 보이게 (경쟁 조사 13번, Peanut)
-- 글쓴이가 체크하면 sensitive = true. 이름 숨기기는 글쓴이 이름만 '익명'으로 저장한다(운영자는 owner_id 로 안다).
begin;
alter table public.community_posts add column if not exists sensitive boolean not null default false;
notify pgrst, 'reload schema';
commit;
select count(*) filter (where sensitive) as sensitive_posts from public.community_posts;
