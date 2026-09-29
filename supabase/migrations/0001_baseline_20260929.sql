-- =============================================================================
-- 0001_baseline_20260929.sql
-- 2026-09-29 시점 운영 프로젝트(hjqchbpxwviengdzvado) 스키마 스냅샷.
--
-- 목적: 테스트 프로젝트를 운영과 같은 출발선에 놓는다.
--       이 파일은 테스트 DB를 처음 세울 때 한 번만 실행한다.
--       운영 DB에서는 실행하지 않는다 (이미 이 상태다).
--
-- 주의: 운영 데이터는 복사하지 않는다. 구조만 옮긴다.
-- =============================================================================
begin;

-- ---------------------------------------------------------------- 관리자 --
create table if not exists public.admin_emails (
  email text not null primary key
);
alter table public.admin_emails enable row level security;
-- 정책 없음 = 클라이언트에서 직접 읽을 수 없음. is_admin() 함수로만 조회된다.
revoke all on public.admin_emails from anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.admin_emails a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$fn$;
grant execute on function public.is_admin() to anon, authenticated;

-- ------------------------------------------------------- 가족공유(동결) --
-- 실행계획 4.7: UI 만 숨기는 게 아니라 백엔드 접근까지 차단한 상태를 유지한다.
create table if not exists public.families (
  code       text not null primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.families enable row level security;
revoke all on public.families from anon, authenticated;

-- -------------------------------------------------------------- 챌린지 --
create table if not exists public.challenge_entries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  age        text,
  note       text,
  media_url  text,
  votes      int  not null default 0,
  created_at timestamptz not null default now(),
  status     text not null default 'pending',
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid()
);

-- ------------------------------------------------------------ 커뮤니티 --
create table if not exists public.community_posts (
  id         uuid primary key default gen_random_uuid(),
  author     text not null,
  text       text not null,
  media_url  text,
  likes      int  not null default 0,
  comments   int  not null default 0,
  created_at timestamptz not null default now(),
  stage      text,
  age_value  int,
  status     text not null default 'pending',
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid()
);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author     text not null,
  content    text not null,
  created_at timestamptz not null default now(),
  reactions  jsonb not null default '{}'::jsonb,
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid()
);

-- -------------------------------------------------------------- 체험단 --
create table if not exists public.benefit_applications (
  id         uuid primary key default gen_random_uuid(),
  trial_key  text not null,
  nickname   text,
  region     text,
  created_at timestamptz not null default now(),
  contact    text,
  address    text,
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid()
);

-- ---------------------------------------------------------------- 공지 --
create table if not exists public.notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  owner_id   uuid references auth.users(id) on delete set null default auth.uid()
);

-- -------------------------------------------------------------- 나들이 --
create table if not exists public.outings (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'event',
  region      text not null default '전체',
  title       text not null,
  place       text,
  address     text,
  hours       text,
  fee         text,
  age_fit     text,
  link_url    text,
  source      text,
  checked_on  date,
  starts_on   date,
  ends_on     date,
  description text,
  emoji       text default '📍',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  owner_id    uuid references auth.users(id) on delete set null default auth.uid()
);
create index if not exists outings_lookup_idx on public.outings (category, region, ends_on);

-- -------------------------------------------------------------- 프로필 --
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  nickname    text,
  kid_type    text,
  parent_role text,
  due_date    date,
  birth_month text,
  region      text,
  interests   jsonb not null default '[]'::jsonb,
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin new.updated_at := now(); return new; end $fn$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------- 성장 앨범 --
create table if not exists public.album_photos (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  path       text not null,
  caption    text,
  taken_on   date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists album_photos_owner_idx on public.album_photos (owner_id, taken_on desc);

-- ----------------------------------------------------------- 신고·차단 --
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users(id) on delete cascade default auth.uid(),
  target_type  text not null check (target_type in ('post','comment','entry')),
  target_id    uuid not null,
  target_owner uuid references auth.users(id) on delete set null,
  reason       text not null,
  detail       text,
  status       text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at   timestamptz not null default now()
);
create unique index if not exists reports_once_idx on public.reports (reporter_id, target_type, target_id);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create or replace function public.is_blocked(target uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select target is not null and auth.uid() is not null and exists (
    select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = target
  );
$fn$;
grant execute on function public.is_blocked(uuid) to anon, authenticated;

-- ============================================================== RLS ======
alter table public.challenge_entries    enable row level security;
alter table public.community_posts      enable row level security;
alter table public.post_comments        enable row level security;
alter table public.benefit_applications enable row level security;
alter table public.notices              enable row level security;
alter table public.outings              enable row level security;
alter table public.profiles             enable row level security;
alter table public.album_photos         enable row level security;
alter table public.reports              enable row level security;
alter table public.blocks               enable row level security;

-- 챌린지
drop policy if exists ce_select       on public.challenge_entries;
drop policy if exists ce_insert       on public.challenge_entries;
drop policy if exists ce_update_admin on public.challenge_entries;
drop policy if exists ce_delete       on public.challenge_entries;
create policy ce_select on public.challenge_entries for select using (
  ((status = 'approved') or (owner_id = auth.uid()) or is_admin()) and not public.is_blocked(owner_id));
create policy ce_insert on public.challenge_entries for insert to authenticated with check (owner_id = auth.uid());
create policy ce_update_admin on public.challenge_entries for update to authenticated using (is_admin()) with check (is_admin());
create policy ce_delete on public.challenge_entries for delete to authenticated using (owner_id = auth.uid() or is_admin());

-- 커뮤니티
drop policy if exists cp_select       on public.community_posts;
drop policy if exists cp_insert       on public.community_posts;
drop policy if exists cp_update_admin on public.community_posts;
drop policy if exists cp_delete       on public.community_posts;
create policy cp_select on public.community_posts for select using (
  ((status = 'approved') or (owner_id = auth.uid()) or is_admin()) and not public.is_blocked(owner_id));
create policy cp_insert on public.community_posts for insert to authenticated with check (owner_id = auth.uid());
create policy cp_update_admin on public.community_posts for update to authenticated using (is_admin()) with check (is_admin());
create policy cp_delete on public.community_posts for delete to authenticated using (owner_id = auth.uid() or is_admin());

-- 댓글
drop policy if exists pcm_select on public.post_comments;
drop policy if exists pcm_insert on public.post_comments;
drop policy if exists pcm_delete on public.post_comments;
create policy pcm_select on public.post_comments for select using (
  ((exists (select 1 from public.community_posts p where p.id = post_comments.post_id and p.status = 'approved'))
   or (owner_id = auth.uid()) or is_admin()) and not public.is_blocked(owner_id));
create policy pcm_insert on public.post_comments for insert to authenticated with check (owner_id = auth.uid());
create policy pcm_delete on public.post_comments for delete to authenticated using (owner_id = auth.uid() or is_admin());

-- 체험단 신청
drop policy if exists ba_select on public.benefit_applications;
drop policy if exists ba_insert on public.benefit_applications;
drop policy if exists ba_delete on public.benefit_applications;
create policy ba_select on public.benefit_applications for select to authenticated using (owner_id = auth.uid() or is_admin());
create policy ba_insert on public.benefit_applications for insert to authenticated with check (owner_id = auth.uid());
create policy ba_delete on public.benefit_applications for delete to authenticated using (owner_id = auth.uid() or is_admin());

-- 공지
drop policy if exists nt_select on public.notices;
drop policy if exists nt_insert on public.notices;
drop policy if exists nt_update on public.notices;
drop policy if exists nt_delete on public.notices;
create policy nt_select on public.notices for select using (true);
create policy nt_insert on public.notices for insert to authenticated with check (is_admin());
create policy nt_update on public.notices for update to authenticated using (is_admin()) with check (is_admin());
create policy nt_delete on public.notices for delete to authenticated using (is_admin());

-- 나들이
drop policy if exists ot_select       on public.outings;
drop policy if exists ot_insert_admin on public.outings;
drop policy if exists ot_update_admin on public.outings;
drop policy if exists ot_delete_admin on public.outings;
create policy ot_select on public.outings for select using (true);
create policy ot_insert_admin on public.outings for insert to authenticated with check (is_admin());
create policy ot_update_admin on public.outings for update to authenticated using (is_admin()) with check (is_admin());
create policy ot_delete_admin on public.outings for delete to authenticated using (is_admin());

-- 프로필
drop policy if exists pf_select on public.profiles;
drop policy if exists pf_insert on public.profiles;
drop policy if exists pf_update on public.profiles;
drop policy if exists pf_delete on public.profiles;
create policy pf_select on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy pf_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy pf_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy pf_delete on public.profiles for delete to authenticated using (id = auth.uid());

-- 성장 앨범
drop policy if exists ap_select on public.album_photos;
drop policy if exists ap_insert on public.album_photos;
drop policy if exists ap_update on public.album_photos;
drop policy if exists ap_delete on public.album_photos;
create policy ap_select on public.album_photos for select to authenticated using (owner_id = auth.uid());
create policy ap_insert on public.album_photos for insert to authenticated with check (owner_id = auth.uid());
create policy ap_update on public.album_photos for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ap_delete on public.album_photos for delete to authenticated using (owner_id = auth.uid());

-- 신고
drop policy if exists rp_select on public.reports;
drop policy if exists rp_insert on public.reports;
drop policy if exists rp_update on public.reports;
create policy rp_select on public.reports for select to authenticated using (reporter_id = auth.uid() or is_admin());
create policy rp_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy rp_update on public.reports for update to authenticated using (is_admin()) with check (is_admin());

-- 차단
drop policy if exists bl_select on public.blocks;
drop policy if exists bl_insert on public.blocks;
drop policy if exists bl_delete on public.blocks;
create policy bl_select on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy bl_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
create policy bl_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- ============================================================ 권한 ======
grant select on public.challenge_entries, public.community_posts, public.post_comments,
                public.notices, public.outings to anon, authenticated;
grant insert, delete on public.challenge_entries, public.community_posts, public.post_comments to authenticated;
grant update on public.challenge_entries, public.community_posts to authenticated;
grant select, insert, delete on public.benefit_applications to authenticated;
grant insert, update, delete on public.notices, public.outings to authenticated;
grant select, insert, update, delete on public.profiles, public.album_photos to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select, insert, delete on public.blocks to authenticated;
revoke all on public.profiles, public.album_photos, public.reports, public.blocks from anon;

-- ====================================================== 계정 삭제 ======
create or replace function public.delete_my_account()
returns json language plpgsql security definer set search_path = public, auth, storage as $fn$
declare uid uuid := auth.uid(); paths text[]; n_media int := 0; n_album int := 0;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(array_agg(distinct p), '{}') into paths from (
    select split_part(split_part(media_url, '/media/', 2), '?', 1) as p
      from public.community_posts where owner_id = uid and coalesce(media_url,'') <> ''
    union all
    select split_part(split_part(media_url, '/media/', 2), '?', 1)
      from public.challenge_entries where owner_id = uid and coalesce(media_url,'') <> ''
  ) s where p <> '';
  if coalesce(array_length(paths, 1), 0) > 0 then
    delete from storage.objects where bucket_id = 'media' and name = any(paths);
    get diagnostics n_media = row_count;
  end if;
  delete from storage.objects where bucket_id = 'album' and (storage.foldername(name))[1] = uid::text;
  get diagnostics n_album = row_count;
  delete from auth.users where id = uid;
  return json_build_object('deleted_media', n_media, 'deleted_album', n_album);
end $fn$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ================================================= 반응 RPC (임시) ======
-- 실행계획 4.3 / P0-03 에서 제거 예정. 0002_reactions.sql 이 대체한다.
-- 운영과 같은 출발선을 만들기 위해 baseline 에는 그대로 둔다.
create or replace function public.increment_votes(entry_id uuid, delta int)
returns void language sql security definer set search_path = public as $fn$
  update public.challenge_entries set votes = greatest(0, votes + delta) where id = entry_id;
$fn$;
create or replace function public.increment_likes(post_id uuid, delta int)
returns void language sql security definer set search_path = public as $fn$
  update public.community_posts set likes = greatest(0, likes + delta) where id = post_id;
$fn$;
create or replace function public.increment_comments(post_id uuid, delta int)
returns void language sql security definer set search_path = public as $fn$
  update public.community_posts set comments = greatest(0, comments + delta) where id = post_id;
$fn$;
grant execute on function public.increment_votes(uuid,int),
                         public.increment_likes(uuid,int),
                         public.increment_comments(uuid,int) to anon, authenticated;

-- ============================================================ Storage ===
insert into storage.buckets (id, name, public)
values ('media','media', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album','album', false, 26214400, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "media public read"          on storage.objects;
drop policy if exists "media authenticated upload" on storage.objects;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
create policy "media authenticated upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media');

drop policy if exists "album own read"   on storage.objects;
drop policy if exists "album own insert" on storage.objects;
drop policy if exists "album own delete" on storage.objects;
create policy "album own read" on storage.objects for select to authenticated
  using (bucket_id = 'album' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "album own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'album' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "album own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'album' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
