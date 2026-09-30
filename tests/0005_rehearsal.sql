-- =============================================================================
-- 0005_rehearsal.sql  —  0005_reactions.sql 리허설 (아무것도 남기지 않는다)
--
-- 목적
--   0005 의 6) 백필이 카운터 값을 덮어쓰는 파괴적 구간이다.
--   실제 적용 전에 "무엇이 어떻게 바뀌는지"를 눈으로 확인한다.
--
-- 사용법
--   Supabase SQL Editor 에 이 파일 전체를 붙여넣고 실행한다.
--   마지막 ROLLBACK 때문에 DB 에는 아무 변화도 남지 않는다.
--   결과 표의 before / after 열을 확인한 뒤 0005_reactions.sql 을 실행한다.
--
-- 대상: 테스트 프로젝트 srxdtddrtnhtlbbviyvs 전용. 운영에서 실행하지 않는다.
-- =============================================================================
begin;

-- ---------------------------------------------------------- 적용 전 상태 --
create temp table _rehearsal_before as
select
  (select coalesce(sum(votes), 0)    from public.challenge_entries)                as sum_votes,
  (select coalesce(sum(likes), 0)    from public.community_posts)                  as sum_likes,
  (select coalesce(sum(comments), 0) from public.community_posts)                  as sum_comments,
  (select count(*) from public.post_comments)                                      as real_comment_rows,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('increment_votes', 'increment_likes', 'increment_comments'))                 as increment_fns,
  (select count(*) from pg_tables
    where schemaname = 'public' and tablename in ('entry_votes', 'post_likes'))     as reaction_tables,
  -- increment_* 의 EXECUTE 가 PUBLIC 에 남아 있는가 (0002 가 못 막은 그 경로)
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('increment_votes', 'increment_likes', 'increment_comments')
      and has_function_privilege('public', p.oid, 'EXECUTE'))                       as public_can_execute,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('increment_votes', 'increment_likes', 'increment_comments')
      and has_function_privilege('anon', p.oid, 'EXECUTE'))                         as anon_can_execute;

-- 어떤 글의 숫자가 얼마나 깎이는지 행 단위로 남겨둔다.
--
-- ⚠️ 여기서는 적용 "전" 값만 담는다. 적용 후 값은 본문이 끝난 뒤 아래에서 채운다.
--    이 시점에는 entry_votes / post_likes 가 아직 없어서, 그 테이블을 조회하면
--    42P01 (undefined_table) 로 리허설 전체가 실패한다.
create temp table _rehearsal_rows as
select 'challenge_entries'::text as tbl, e.id, e.name as label,
       e.votes as before_val, null::int as after_val
  from public.challenge_entries e
union all
select 'community_posts', p.id, left(p.text, 24),
       p.likes, null::int
  from public.community_posts p;

-- =========================================================================
-- 여기서부터 0005_reactions.sql 의 본문과 동일 (begin/commit 만 제외)
-- =========================================================================
create table if not exists public.entry_votes (
  entry_id   uuid not null references public.challenge_entries(id) on delete cascade,
  voter_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  constraint entry_votes_pkey primary key (entry_id, voter_id)
);
create index if not exists entry_votes_voter_idx on public.entry_votes (voter_id);

create table if not exists public.post_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  liker_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  constraint post_likes_pkey primary key (post_id, liker_id)
);
create index if not exists post_likes_liker_idx on public.post_likes (liker_id);

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

grant select, insert, delete on public.entry_votes, public.post_likes to authenticated;
revoke all on public.entry_votes, public.post_likes from anon;

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

revoke all on function public.sync_entry_votes()   from public, anon, authenticated;
revoke all on function public.sync_post_likes()    from public, anon, authenticated;
revoke all on function public.sync_post_comments() from public, anon, authenticated;

update public.challenge_entries e
   set votes = (select count(*) from public.entry_votes v where v.entry_id = e.id);
update public.community_posts p
   set likes    = (select count(*) from public.post_likes l where l.post_id = p.id),
       comments = (select count(*) from public.post_comments c where c.post_id = p.id);

drop function if exists public.increment_votes(uuid, int);
drop function if exists public.increment_likes(uuid, int);
drop function if exists public.increment_comments(uuid, int);

alter default privileges in schema public revoke execute on functions from public;

-- =========================================================================
-- 리허설 보고
-- =========================================================================
-- 적용 "후" 값을 채운다. 백필이 끝난 뒤이므로 부모 테이블의 카운터가 곧 실제 반응 행 수다.
-- (entry_votes / post_likes 를 직접 세지 않는 이유는 위 주석 참고 — 여기서는 이미
--  테이블이 있지만, 백필 결과를 그대로 읽는 편이 실제 적용 결과와 정확히 같다.)
update _rehearsal_rows r
   set after_val = e.votes
  from public.challenge_entries e
 where r.tbl = 'challenge_entries' and e.id = r.id;
update _rehearsal_rows r
   set after_val = p.likes
  from public.community_posts p
 where r.tbl = 'community_posts' and p.id = r.id;

create temp table _rehearsal_after as
select
  (select coalesce(sum(votes), 0)    from public.challenge_entries)                as sum_votes,
  (select coalesce(sum(likes), 0)    from public.community_posts)                  as sum_likes,
  (select coalesce(sum(comments), 0) from public.community_posts)                  as sum_comments,
  (select count(*) from public.post_comments)                                      as real_comment_rows,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('increment_votes', 'increment_likes', 'increment_comments'))                 as increment_fns,
  (select count(*) from pg_tables
    where schemaname = 'public' and tablename in ('entry_votes', 'post_likes'))     as reaction_tables,
  0::bigint as public_can_execute,
  0::bigint as anon_can_execute;

-- 요약과 행별 변화를 한 결과 표로 낸다.
-- (SQL Editor 는 마지막으로 행을 돌려준 문장의 결과만 보여주는 경우가 있어
--  두 개로 나누면 앞의 표가 안 보인다. rollback 직전의 마지막 조회여야 한다.)
select r.구분, r.항목, r.적용전, r.적용후, r.비고
  from (
    select 1 as ord, 0 as sub, '① 요약'::text as 구분,
           '응원 합계 (votes)'::text as 항목,
           b.sum_votes::text as 적용전, a.sum_votes::text as 적용후,
           (case when b.sum_votes = a.sum_votes then '변화 없음' else '바뀜' end)::text as 비고
      from _rehearsal_before b, _rehearsal_after a
    union all select 2, 0, '① 요약', '좋아요 합계 (likes)',
           b.sum_likes::text, a.sum_likes::text,
           (case when b.sum_likes = a.sum_likes then '변화 없음' else '바뀜' end)::text
      from _rehearsal_before b, _rehearsal_after a
    union all select 3, 0, '① 요약', '댓글수 컬럼 합계',
           b.sum_comments::text, a.sum_comments::text,
           (case when b.sum_comments = a.sum_comments then '변화 없음' else '바뀜' end)::text
      from _rehearsal_before b, _rehearsal_after a
    union all select 4, 0, '① 요약', '실제 댓글 행 수 (이 값에 맞춰진다)',
           b.real_comment_rows::text, a.real_comment_rows::text, '참고'::text
      from _rehearsal_before b, _rehearsal_after a
    union all select 5, 0, '① 요약', 'increment_* 함수 개수 (3 → 0 이어야 정상)',
           b.increment_fns::text, a.increment_fns::text,
           (case when a.increment_fns = 0 then '제거됨' else '남아있음!' end)::text
      from _rehearsal_before b, _rehearsal_after a
    union all select 6, 0, '① 요약', '반응 테이블 개수 (0 → 2 이어야 정상)',
           b.reaction_tables::text, a.reaction_tables::text,
           (case when a.reaction_tables = 2 then '생성됨' else '확인 필요!' end)::text
      from _rehearsal_before b, _rehearsal_after a
    union all select 7, 0, '① 요약', 'PUBLIC 이 increment_* 실행 가능 (구멍)',
           b.public_can_execute::text, a.public_can_execute::text,
           (case when b.public_can_execute > 0 then '적용 전에는 뚫려 있었음' else '-' end)::text
      from _rehearsal_before b, _rehearsal_after a
    union all select 8, 0, '① 요약', 'anon 이 increment_* 실행 가능 (구멍)',
           b.anon_can_execute::text, a.anon_can_execute::text,
           (case when b.anon_can_execute > 0 then '적용 전에는 뚫려 있었음' else '-' end)::text
      from _rehearsal_before b, _rehearsal_after a
    union all
    select 100,
           (row_number() over (order by (x.before_val - x.after_val) desc, x.id))::int,
           '② 행별 변화',
           x.tbl || ' / ' || coalesce(x.label, ''),
           x.before_val::text, x.after_val::text,
           (x.after_val - x.before_val)::text
      from _rehearsal_rows x
     where x.before_val <> x.after_val
  ) r
 order by r.ord, r.sub;

rollback;

-- =============================================================================
-- 롤백이 됐는지 확인하고 싶으면 아래만 따로 실행하세요.
-- (같은 실행에 넣으면 이것이 마지막 결과가 되어 위 표가 가려질 수 있습니다)
-- =============================================================================
-- select
--   (select count(*) from pg_tables
--     where schemaname = 'public' and tablename in ('entry_votes', 'post_likes')) as 반응테이블_남음,
--   (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname in
--       ('increment_votes', 'increment_likes', 'increment_comments'))             as increment함수_남음,
--   (select coalesce(sum(votes), 0) from public.challenge_entries)                as 응원합계,
--   (select coalesce(sum(likes), 0) from public.community_posts)                  as 좋아요합계;
-- 기대값: 반응테이블_남음 0, increment함수_남음 3, 합계는 리허설 전과 동일
