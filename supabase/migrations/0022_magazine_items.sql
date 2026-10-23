-- =============================================================================
-- 0022_magazine_items.sql  —  다다맘 매거진 (2026-10-23 사장님 요청)
--
-- 육아 관련 뉴스·기사·인스타·유튜브 쇼츠를 "출처를 밝히고 링크로" 모아 보여준다.
-- 원문 글·사진을 복사해 오지 않는다: 제목 + 우리가 쓴 한 줄 요약 + 출처 이름 + 원문 주소만 저장.
-- 썸네일은 우리가 가진 그림이나 유튜브가 주는 썸네일(앱이 영상 주소에서 만든다)만 쓴다.
-- 나들이·브랜드관과 같은 구조: 누구나 보이는 것만 읽고, 등록·수정·삭제는 관리자(is_admin)만.
-- 적용: 테스트 먼저. 운영은 사장님 승인 후 (SQL Editor).
-- =============================================================================
begin;

create table if not exists public.magazine_items (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'news' check (kind in ('news','article','youtube','instagram')),
  title         text not null check (char_length(title) between 1 and 80),
  summary       text check (summary is null or char_length(summary) <= 200),
  source_name   text not null check (char_length(source_name) between 1 and 40),
  url           text not null check (url ~ '^https://'),
  thumb_url     text check (thumb_url is null or thumb_url ~ '^https://'),
  published_on  date,
  visible       boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists magazine_items_list_idx on public.magazine_items (visible, sort_order, published_on desc);

alter table public.magazine_items enable row level security;

drop policy if exists mag_select on public.magazine_items;
create policy mag_select on public.magazine_items for select
  using (visible or (select public.is_admin()));

drop policy if exists magazine_items_admin_write on public.magazine_items;
create policy magazine_items_admin_write on public.magazine_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.magazine_items to anon, authenticated;
grant insert, update, delete on public.magazine_items to authenticated;

notify pgrst, 'reload schema';
commit;
