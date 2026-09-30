-- =============================================================================
-- 0005_reactions.sql  —  P0-03 좋아요·응원 조작 방지
--
-- 배경
--   응원(votes)·좋아요(likes)·댓글수(comments)가 security definer RPC
--   increment_votes / increment_likes / increment_comments 로 증감됐다.
--   이 함수들은 "누가 몇 번 눌렀는지"를 전혀 기록하지 않아서, API 를 직접
--   호출하면 같은 사람이 같은 대상에 무한정 점수를 올리거나 깎을 수 있었다.
--
--   2026-09-30 테스트 프로젝트(srxdtddrtnhtlbbviyvs) 실측:
--     · 로그인 사용자가 increment_likes 를 50회 연속 호출 → 12 에서 62 로. 실패 0건.
--     · delta 에 음수를 넣어 남의 글 점수를 31 에서 26 으로 깎는 것도 성공.
--     · 비로그인(anon)으로도 increment_votes 성공 → votes 11 에서 18 로.
--       0002 가 `revoke execute ... from anon` 을 했지만 듣지 않았다.
--       PostgreSQL 은 함수 EXECUTE 를 기본으로 PUBLIC 에 부여하고, anon 은
--       그 PUBLIC 권한을 상속한다. anon 에게서만 회수해도 PUBLIC 경로가 남는다.
--       (baseline 의 delete_my_account 는 `from public, anon` 으로 제대로 막았다)
--     · 반대로 카운터 컬럼을 REST PATCH 로 직접 덮어쓰는 것은 RLS
--       (ce_update_admin / cp_update_admin) 가 이미 막고 있었다.
--
-- 방침
--   숫자를 직접 더하는 대신 "누가 무엇에 반응했는가"를 행으로 남긴다.
--   (대상, 사용자) 조합에 PRIMARY KEY 를 걸어 중복 자체가 DB 에서 불가능하게 한다.
--   표시용 카운터 컬럼은 트리거가 그 행들을 세어 유지한다.
--   카운터는 이제 클라이언트가 쓸 수 없고, 행을 넣고 지우는 것만 할 수 있다.
--
-- 적용 순서: 0004 다음
-- 리허설: tests/0005_rehearsal.sql (begin ... rollback) 을 먼저 실행할 것
--
-- ⚠️ 파괴적 변경 — 아래 6) 백필이 기존 카운터 값을 실제 반응 행 수로 덮어쓴다.
--    반응 행이 아직 없으므로 votes/likes 는 0 이 된다 (comments 는 실제 댓글 수로).
--    테스트 DB 의 시드 숫자는 지어낸 값이라 잃을 것이 없다.
--    운영 이관 시에는 누적된 실제 숫자가 0 으로 초기화되므로 별도 판단이 필요하다.
--    docs/PROMOTION.md 의 0005 항목을 볼 것.
-- =============================================================================
begin;

-- ------------------------------------------------------------ 1) 응원 행 --
create table if not exists public.entry_votes (
  entry_id   uuid not null references public.challenge_entries(id) on delete cascade,
  voter_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  constraint entry_votes_pkey primary key (entry_id, voter_id)
);
-- "내가 응원한 목록" 조회용. PK 는 entry_id 가 선두라 voter_id 단독 조회를 못 받친다.
create index if not exists entry_votes_voter_idx on public.entry_votes (voter_id);

-- --------------------------------------------------------- 2) 좋아요 행 --
create table if not exists public.post_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  liker_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  constraint post_likes_pkey primary key (post_id, liker_id)
);
create index if not exists post_likes_liker_idx on public.post_likes (liker_id);

-- ----------------------------------------------------------------- 3) RLS --
-- 본인 행만 넣고 지울 수 있다. UPDATE 정책은 아예 만들지 않는다
-- (반응은 있음/없음 두 상태뿐이라 수정할 것이 없고, 열어두면 공격면만 늘어난다).
--
-- SELECT 를 `using (true)` 로 열지 않은 이유:
--   그렇게 하면 비로그인도 voter_id 목록을 전부 읽을 수 있어
--   "누가 어느 글에 반응했는지"가 공개된다. 육아 커뮤니티에서 임신·육아 단계가
--   드러나는 것과 같은 문제라 P0-04(사진 비공개)·P0-05(PII 분리) 방향과 어긋난다.
--   비로그인에게 필요한 것은 개별 행이 아니라 합계이고, 합계는 트리거가 유지하는
--   challenge_entries.votes / community_posts.likes 로 이미 공개돼 있다.
--   행 단위 집계까지 공개해야 한다면 아래 두 정책의 using 절을 (true) 로 바꾸고
--   anon 에게 select 를 grant 하면 된다.
alter table public.entry_votes enable row level security;
drop policy if exists ev_select on public.entry_votes;
drop policy if exists ev_insert on public.entry_votes;
drop policy if exists ev_delete on public.entry_votes;
create policy ev_select on public.entry_votes for select to authenticated
  using (voter_id = auth.uid() or is_admin());
create policy ev_insert on public.entry_votes for insert to authenticated
  with check (voter_id = auth.uid());
create policy ev_delete on public.entry_votes for delete to authenticated
  using (voter_id = auth.uid());

alter table public.post_likes enable row level security;
drop policy if exists pl_select on public.post_likes;
drop policy if exists pl_insert on public.post_likes;
drop policy if exists pl_delete on public.post_likes;
create policy pl_select on public.post_likes for select to authenticated
  using (liker_id = auth.uid() or is_admin());
create policy pl_insert on public.post_likes for insert to authenticated
  with check (liker_id = auth.uid());
create policy pl_delete on public.post_likes for delete to authenticated
  using (liker_id = auth.uid());

-- -------------------------------------------------------------- 4) 권한 --
grant select, insert, delete on public.entry_votes, public.post_likes to authenticated;
-- anon 은 반응 행에 어떤 권한도 갖지 않는다. 합계는 부모 테이블 컬럼으로 읽는다.
-- (0002 의 alter default privileges 가 이미 막지만 명시해 둔다)
revoke all on public.entry_votes, public.post_likes from anon;

-- ------------------------------------------------- 5) 카운터 유지 트리거 --
-- security definer + 소유자(postgres) 실행이라 대상 테이블의 RLS
-- (ce_update_admin / cp_update_admin: 관리자만 UPDATE) 를 통과한다.
-- 즉 카운터를 쓸 수 있는 경로는 이 트리거뿐이다.
-- update ... set x = x + 1 은 행 잠금을 잡으므로 동시 반응에도 값이 유실되지 않는다.
create or replace function public.sync_entry_votes()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    update public.challenge_entries set votes = votes + 1 where id = new.entry_id;
  else
    update public.challenge_entries set votes = greatest(0, votes - 1) where id = old.entry_id;
  end if;
  return null;
end $fn$;

create or replace function public.sync_post_likes()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set likes = likes + 1 where id = new.post_id;
  else
    update public.community_posts set likes = greatest(0, likes - 1) where id = old.post_id;
  end if;
  return null;
end $fn$;

create or replace function public.sync_post_comments()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set comments = comments + 1 where id = new.post_id;
  else
    update public.community_posts set comments = greatest(0, comments - 1) where id = old.post_id;
  end if;
  return null;
end $fn$;

drop trigger if exists trg_entry_votes_sync   on public.entry_votes;
drop trigger if exists trg_post_likes_sync    on public.post_likes;
drop trigger if exists trg_post_comments_sync on public.post_comments;
create trigger trg_entry_votes_sync   after insert or delete on public.entry_votes
  for each row execute function public.sync_entry_votes();
create trigger trg_post_likes_sync    after insert or delete on public.post_likes
  for each row execute function public.sync_post_likes();
create trigger trg_post_comments_sync after insert or delete on public.post_comments
  for each row execute function public.sync_post_comments();

-- 트리거 함수는 트리거로만 호출된다. 아무에게도 EXECUTE 를 주지 않는다.
-- (PUBLIC 기본 부여를 회수하지 않으면 0002 와 같은 구멍이 생긴다)
-- 트리거를 만든 뒤에 회수한다: create trigger 는 함수 EXECUTE 권한을 요구하므로
-- 먼저 회수하면 소유자가 아닌 역할로 이 파일을 돌릴 때 실패한다.
-- 트리거가 발동할 때는 EXECUTE 를 검사하지 않으므로 회수해도 동작에 지장이 없다.
revoke all on function public.sync_entry_votes()   from public, anon, authenticated;
revoke all on function public.sync_post_likes()    from public, anon, authenticated;
revoke all on function public.sync_post_comments() from public, anon, authenticated;

-- ------------------------------------------------- 6) 백필 (파괴적 구간) --
-- 지금까지의 카운터는 근거 행이 없는 숫자였다. 실제 행을 세어 다시 맞춘다.
update public.challenge_entries e
   set votes = (select count(*) from public.entry_votes v where v.entry_id = e.id);
update public.community_posts p
   set likes    = (select count(*) from public.post_likes l where l.post_id = p.id),
       comments = (select count(*) from public.post_comments c where c.post_id = p.id);

-- ------------------------------------------------------- 7) RPC 제거 --
-- PUBLIC 에 남은 EXECUTE 까지 확실히 없애기 위해 revoke 가 아니라 drop 한다.
drop function if exists public.increment_votes(uuid, int);
drop function if exists public.increment_likes(uuid, int);
drop function if exists public.increment_comments(uuid, int);

-- 앞으로 만들 함수에 PUBLIC EXECUTE 가 자동으로 붙지 않게 한다.
-- 0002 가 anon 에게서만 회수해 구멍이 남았던 일을 반복하지 않기 위한 조치다.
alter default privileges in schema public revoke execute on functions from public;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';

commit;

-- =============================================================================
-- 되돌리기
-- =============================================================================
-- begin;
-- drop trigger if exists trg_entry_votes_sync   on public.entry_votes;
-- drop trigger if exists trg_post_likes_sync    on public.post_likes;
-- drop trigger if exists trg_post_comments_sync on public.post_comments;
-- drop function if exists public.sync_entry_votes(), public.sync_post_likes(),
--                         public.sync_post_comments();
-- drop table if exists public.entry_votes, public.post_likes;
-- create or replace function public.increment_votes(entry_id uuid, delta int)
-- returns void language sql security definer set search_path = public as $fn$
--   update public.challenge_entries set votes = greatest(0, votes + delta) where id = entry_id;
-- $fn$;
-- create or replace function public.increment_likes(post_id uuid, delta int)
-- returns void language sql security definer set search_path = public as $fn$
--   update public.community_posts set likes = greatest(0, likes + delta) where id = post_id;
-- $fn$;
-- create or replace function public.increment_comments(post_id uuid, delta int)
-- returns void language sql security definer set search_path = public as $fn$
--   update public.community_posts set comments = greatest(0, comments + delta) where id = post_id;
-- $fn$;
-- grant execute on function public.increment_votes(uuid,int),
--                          public.increment_likes(uuid,int),
--                          public.increment_comments(uuid,int) to authenticated;
-- notify pgrst, 'reload schema';
-- commit;
-- 주: 카운터 값 자체는 백필로 덮어써졌으므로 되돌리기로 복원되지 않는다.
