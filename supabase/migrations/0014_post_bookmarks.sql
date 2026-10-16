-- =============================================================================
-- 0014_post_bookmarks.sql  —  커뮤니티 글 스크랩(북마크)
--
-- 웹 커뮤니티(community.html)의 "⭐ 스크랩" 버튼과 마이페이지 "스크랩한 글" 목록.
-- 기기 저장소가 아니라 서버에 두어 휴대폰·PC 어디서나 같은 목록을 본다.
--
-- 원칙
--   · 본인 행만 읽고·넣고·지운다. 누가 무엇을 스크랩했는지는 아무에게도 공개하지 않는다
--     (post_likes 와 같은 방침 — 0005 참고).
--   · 비로그인(anon)은 어떤 권한도 없다.
--   · 글이 지워지거나 탈퇴하면 함께 지워진다 (on delete cascade).
--   · 수정(UPDATE)할 것이 없으므로 UPDATE 정책·권한을 두지 않는다.
--
-- 추가만 하는 변경이라 되돌리기는 drop table 한 줄. 기존 데이터에 영향 없음.
-- 적용: 테스트(srxdtddrtnhtlbbviyvs) 2026-10-16. 운영은 승인 후.
-- =============================================================================
begin;

create table if not exists public.post_bookmarks (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_bookmarks_pkey primary key (post_id, user_id)
);
-- "내 스크랩 최신순" 조회용. PK 는 post_id 가 앞이라 user_id 조회를 받치지 못한다.
create index if not exists post_bookmarks_user_idx on public.post_bookmarks (user_id, created_at desc);

alter table public.post_bookmarks enable row level security;
drop policy if exists pb_select on public.post_bookmarks;
drop policy if exists pb_insert on public.post_bookmarks;
drop policy if exists pb_delete on public.post_bookmarks;
create policy pb_select on public.post_bookmarks for select to authenticated using (user_id = auth.uid());
create policy pb_insert on public.post_bookmarks for insert to authenticated with check (user_id = auth.uid());
create policy pb_delete on public.post_bookmarks for delete to authenticated using (user_id = auth.uid());

revoke all on public.post_bookmarks from public, anon;
grant select, insert, delete on public.post_bookmarks to authenticated;

notify pgrst, 'reload schema';
commit;

-- 확인
-- select relrowsecurity from pg_class where oid = 'public.post_bookmarks'::regclass;   -- true
-- select policyname, cmd from pg_policies where tablename = 'post_bookmarks';          -- 3개

-- 되돌리기
-- drop table if exists public.post_bookmarks;
