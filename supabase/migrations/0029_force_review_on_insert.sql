-- =============================================================================
-- 0029_force_review_on_insert.sql — 회원이 글·참가작을 '검수 없이 공개'로 올리거나 숫자를 꾸며 넣던 구멍 막기
--
-- 발견(2026-10-27, 테스트 DB 실측): 일반 회원이 REST 로 직접
--   challenge_entries 에 status='approved', votes=999 / community_posts 에 status='approved', likes=999
-- 를 넣으면 그대로 저장됐다. INSERT 정책은 owner_id 만 보고, 칼럼 기본값은 클라이언트가 덮어쓸 수 있다.
-- 응원·좋아요·댓글의 created_at 도 과거로 넣을 수 있어 '이달의 주인공'(그 달 응원 수)을 지난달로 조작할 수 있었다.
--
-- 고침: 앱·웹에서 온 요청(로그인 회원, auth.role()='authenticated')이고 관리자가 아니면 서버가 값을 정한다.
--   글·참가작: status='pending', 숫자 0, created_at=now()
--   응원·좋아요·댓글: created_at=now() (댓글은 reactions 비움)
-- SQL Editor·서버 작업(에이전트1 의 질문 올리기 등, auth.role() 없음)과 관리자는 그대로.
-- 적용: 테스트 먼저. 운영은 사장님 SQL Editor.
-- =============================================================================
begin;

create or replace function public.force_review_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not coalesce(public.is_admin(), false) then
    new.status := 'pending';
    new.created_at := now();
    if tg_table_name = 'challenge_entries' then new.votes := 0; end if;
    if tg_table_name = 'community_posts' then new.likes := 0; new.comments := 0; end if;
  end if;
  return new;
end $$;
revoke all on function public.force_review_on_insert() from public, anon, authenticated;

drop trigger if exists challenge_entries_force_review on public.challenge_entries;
create trigger challenge_entries_force_review before insert on public.challenge_entries
  for each row execute function public.force_review_on_insert();
drop trigger if exists community_posts_force_review on public.community_posts;
create trigger community_posts_force_review before insert on public.community_posts
  for each row execute function public.force_review_on_insert();

create or replace function public.stamp_now_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.created_at := now();
    if tg_table_name = 'post_comments' then new.reactions := '{}'::jsonb; end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_now_on_insert() from public, anon, authenticated;

drop trigger if exists entry_votes_stamp_now on public.entry_votes;
create trigger entry_votes_stamp_now before insert on public.entry_votes
  for each row execute function public.stamp_now_on_insert();
drop trigger if exists post_likes_stamp_now on public.post_likes;
create trigger post_likes_stamp_now before insert on public.post_likes
  for each row execute function public.stamp_now_on_insert();
drop trigger if exists post_comments_stamp_now on public.post_comments;
create trigger post_comments_stamp_now before insert on public.post_comments
  for each row execute function public.stamp_now_on_insert();

commit;
