-- =============================================================================
-- 0016_family_share.sql  —  가족 공유 재설계
--
-- 배경
--   옛 가족 공유는 6자리 코드 하나가 열쇠였습니다. 코드를 아는 사람이면 계정 확인 없이
--   기록 전체를 읽고 덮어쓸 수 있었고, 저장은 기록 전체를 통째로 덮어써서 두 사람이
--   각자 기록하면 한쪽이 사라졌습니다. 그래서 index.html 에서 가족 만들기를 막아 두고
--   families 표 권한도 전부 회수해 둔 상태였습니다 (0행).
--
-- 새 구조
--   families        가족 하나. 만든 사람(owner)과 24시간짜리 초대 코드.
--   family_members  구성원. 계정 단위, 최대 4명, 한 사람은 한 가족에만.
--   family_records  공유 기록 한 건 = 한 행. care(수유·수면) · growth(성장) · vaccine(접종).
--                   통째 덮어쓰기 대신 건별 upsert. 지운 기록은 deleted=true 로 남겨
--                   다른 기기에서 되살아나지 않게 합니다. 앨범 사진은 공유하지 않습니다.
--
--   초대 코드는 들어올 때 한 번 쓰는 입장권입니다. 그 뒤 접근은 구성원 계정으로만 확인합니다.
--   가족 만들기·참여는 family_share 동의가 있어야 됩니다 (서버에서 확인).
--   운영자(is_admin)도 가족 기록은 볼 수 없습니다 — 검수할 이유가 없는 사적 기록입니다.
--   나가면 내가 남긴 기록은 가족에게 남고, 마지막 사람이 나가면 가족과 기록이 지워집니다.
--   회원 탈퇴도 같은 규칙으로 가족에서 나갑니다 (delete_my_account).
--
-- 클라이언트가 쓰는 것 (모두 authenticated 전용)
--   rpc: my_family() · create_family() · new_family_invite() · join_family(p_code)
--        leave_family() · remove_family_member(p_user)
--   표 : family_records — select / upsert (구성원만, 키 변경 불가)
--   오류는 message 로 구분합니다: not_authenticated · consent_required · already_in_family
--        invalid_code · family_full · not_in_family · not_owner · use_leave · not_member
--
-- 적용 순서: 0015 다음. 옛 families 표에 행이 남아 있으면 지우지 않고 멈춥니다.
-- =============================================================================
begin;

-- ---------------------------------------------------------------- 옛 표 정리 --
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'families' and column_name = 'code') then
    if exists (select 1 from public.families) then
      raise exception '옛 families 표에 데이터가 있습니다. 내용을 확인한 뒤 다시 실행하세요.';
    end if;
    drop table public.families;
  end if;
end $$;

-- ------------------------------------------------------------------------ 표 --
create table if not exists public.families (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references auth.users(id) on delete set null,
  invite_code       text unique,
  invite_expires_at timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  constraint family_members_one_family unique (user_id)
);

create table if not exists public.family_records (
  family_id  uuid not null references public.families(id) on delete cascade,
  kind       text not null check (kind in ('care', 'growth', 'vaccine')),
  rid        text not null check (char_length(rid) between 1 and 64),
  body       jsonb not null default '{}'::jsonb check (octet_length(body::text) <= 2048),
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (family_id, kind, rid)
);
-- 동기화: "이 시각 이후 바뀐 것" 조회용
create index if not exists family_records_sync_idx
  on public.family_records (family_id, updated_at);

-- 시각·작성자는 서버가 찍는다. 키(가족·종류·id)는 바꿀 수 없다.
create or replace function public.family_records_stamp()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- 외래키 정리(탈퇴 시 updated_by → null)가 부른 갱신은 그대로 둔다.
  -- 여기서 다시 auth.uid() 를 찍으면 지워지는 계정을 가리켜 탈퇴가 23503 으로 실패한다.
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'UPDATE'
     and (new.family_id, new.kind, new.rid) is distinct from (old.family_id, old.kind, old.rid) then
    raise exception 'family_records key is immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $fn$;

drop trigger if exists family_records_stamp on public.family_records;
create trigger family_records_stamp
  before insert or update on public.family_records
  for each row execute function public.family_records_stamp();

-- -------------------------------------------------------------------- 권한 --
-- 가족·구성원 표는 함수로만 다룬다. 기록 표만 직접 읽고 쓴다.
alter table public.families       enable row level security;
alter table public.family_members enable row level security;
alter table public.family_records enable row level security;

revoke all on public.families, public.family_members, public.family_records
  from public, anon, authenticated;
grant select, insert, update on public.family_records to authenticated;

-- RLS 안에서 family_members 를 직접 읽으면 호출자에게 그 표 권한이 필요하다 → definer 로 감싼다
create or replace function public.is_family_member(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from public.family_members
                  where family_id = fid and user_id = auth.uid());
$fn$;

drop policy if exists fr_select on public.family_records;
drop policy if exists fr_insert on public.family_records;
drop policy if exists fr_update on public.family_records;
create policy fr_select on public.family_records for select to authenticated
  using (public.is_family_member(family_id));
create policy fr_insert on public.family_records for insert to authenticated
  with check (public.is_family_member(family_id));
create policy fr_update on public.family_records for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- -------------------------------------------------------------------- 동의 --
alter table public.consent_records
  drop constraint if exists consent_records_kind_chk;
alter table public.consent_records
  add constraint consent_records_kind_chk check (kind in (
    'signup_terms', 'signup_privacy', 'signup_age14', 'signup_marketing',
    'trial_shipping', 'trial_brand_use', 'entry_photo', 'entry_brand_use',
    'post_visibility',
    'family_share'       -- 가족 공유: 돌봄·성장·접종 기록을 서버에 저장하고 구성원과 공유 (켤 때 필수)
  ));

-- ---------------------------------------------------------------- 내부 함수 --
-- 가장 최근 family_share 동의가 '동의'인지. 같은 시각이면 철회(false)가 이긴다.
create or replace function public._has_family_consent(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select granted from public.consent_records
                    where owner_id = uid and kind = 'family_share'
                    order by created_at desc, granted limit 1), false);
$fn$;

-- 10자리 16진수 (40비트, gen_random_uuid 의 앞부분은 전부 무작위). 0/O · 1/I 혼동 없음.
create or replace function public._new_invite_code()
returns text
language sql
volatile
set search_path = public
as $fn$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$fn$;

-- 나가기 공통 처리: 나가고, 남은 사람이 없으면 가족·기록 삭제, 방장이었으면 넘긴다
create or replace function public._family_leave(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare fid uuid; next_owner uuid;
begin
  select family_id into fid from public.family_members where user_id = uid;
  if fid is null then return; end if;
  perform 1 from public.families where id = fid for update;   -- 동시에 나갈 때 고아 가족 방지

  delete from public.family_members where family_id = fid and user_id = uid;
  select user_id into next_owner from public.family_members
   where family_id = fid order by joined_at limit 1;

  if next_owner is null then
    delete from public.families where id = fid;               -- family_records 도 cascade
  else
    update public.families set owner_id = next_owner
     where id = fid and (owner_id = uid or owner_id is null);
  end if;
end $fn$;

-- -------------------------------------------------------------- 공개 함수 --
-- 내 가족 정보. 가족이 없으면 null.
create or replace function public.my_family()
returns json
language sql
stable
security definer
set search_path = public
as $fn$
  select json_build_object(
    'family_id', f.id,
    'is_owner', f.owner_id = auth.uid(),
    'invite_code', case when f.invite_expires_at > now() then f.invite_code end,
    'invite_expires_at', case when f.invite_expires_at > now() then f.invite_expires_at end,
    'members', (select json_agg(json_build_object(
                         'user_id', m.user_id,
                         'nickname', p.nickname,
                         'is_me', m.user_id = auth.uid(),
                         'is_owner', m.user_id = f.owner_id,
                         'joined_at', m.joined_at) order by m.joined_at)
                  from public.family_members m
                  left join public.profiles p on p.id = m.user_id
                 where m.family_id = f.id))
    from public.families f
    join public.family_members me on me.family_id = f.id and me.user_id = auth.uid();
$fn$;

create or replace function public.create_family()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare uid uuid := auth.uid(); fid uuid;
        code text := public._new_invite_code();
        exp timestamptz := now() + interval '24 hours';
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public._has_family_consent(uid) then raise exception 'consent_required'; end if;
  if exists (select 1 from public.family_members where user_id = uid) then
    raise exception 'already_in_family';
  end if;

  insert into public.families (owner_id, invite_code, invite_expires_at)
       values (uid, code, exp) returning id into fid;
  insert into public.family_members (family_id, user_id) values (fid, uid);

  return json_build_object('family_id', fid, 'invite_code', code, 'invite_expires_at', exp);
end $fn$;

-- 새 초대 코드 (구성원 누구나). 이전 코드는 바로 무효.
create or replace function public.new_family_invite()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare uid uuid := auth.uid(); fid uuid;
        code text := public._new_invite_code();
        exp timestamptz := now() + interval '24 hours';
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select family_id into fid from public.family_members where user_id = uid;
  if fid is null then raise exception 'not_in_family'; end if;

  update public.families set invite_code = code, invite_expires_at = exp where id = fid;
  return json_build_object('invite_code', code, 'invite_expires_at', exp);
end $fn$;

create or replace function public.join_family(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare uid uuid := auth.uid(); fid uuid; n int;
        c text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public._has_family_consent(uid) then raise exception 'consent_required'; end if;
  if exists (select 1 from public.family_members where user_id = uid) then
    raise exception 'already_in_family';
  end if;

  select id into fid from public.families
   where invite_code = c and c <> '' and invite_expires_at > now()
   for update;                                               -- 동시 참여 시 인원 확인을 직렬화
  if fid is null then raise exception 'invalid_code'; end if;

  select count(*) into n from public.family_members where family_id = fid;
  if n >= 4 then raise exception 'family_full'; end if;

  insert into public.family_members (family_id, user_id) values (fid, uid);
  return json_build_object('family_id', fid);
end $fn$;

create or replace function public.leave_family()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public._family_leave(uid);
  return json_build_object('ok', true);
end $fn$;

-- 방장만. 뺀 뒤에는 초대 코드를 없애서 같은 코드로 다시 못 들어오게 한다.
create or replace function public.remove_family_member(p_user uuid)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare uid uuid := auth.uid(); fid uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select id into fid from public.families where owner_id = uid
     and id = (select family_id from public.family_members where user_id = uid);
  if fid is null then raise exception 'not_owner'; end if;
  if p_user = uid then raise exception 'use_leave'; end if;

  delete from public.family_members where family_id = fid and user_id = p_user;
  if not found then raise exception 'not_member'; end if;

  update public.families set invite_code = null, invite_expires_at = null where id = fid;
  return json_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------- 회원 탈퇴: 가족에서도 나간다 --
-- 0004 본문 그대로 + _family_leave 한 줄
create or replace function public.delete_my_account()
returns json
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform public._family_leave(uid);
  delete from public.album_photos where owner_id = uid;
  delete from public.profiles     where id = uid;

  delete from auth.users where id = uid;

  return json_build_object('ok', true);
end $fn$;

-- ------------------------------------------------------------ 함수 실행 권한 --
-- PUBLIC 을 같이 회수해야 anon 이 상속받지 못한다 (CLAUDE.md 4절)
revoke all on function public.family_records_stamp()       from public, anon, authenticated;
revoke all on function public._has_family_consent(uuid)    from public, anon, authenticated;
revoke all on function public._new_invite_code()           from public, anon, authenticated;
revoke all on function public._family_leave(uuid)          from public, anon, authenticated;

revoke all on function public.is_family_member(uuid)       from public, anon;
revoke all on function public.my_family()                  from public, anon;
revoke all on function public.create_family()              from public, anon;
revoke all on function public.new_family_invite()          from public, anon;
revoke all on function public.join_family(text)            from public, anon;
revoke all on function public.leave_family()               from public, anon;
revoke all on function public.remove_family_member(uuid)   from public, anon;
revoke all on function public.delete_my_account()          from public, anon;

grant execute on function public.is_family_member(uuid)     to authenticated;
grant execute on function public.my_family()                to authenticated;
grant execute on function public.create_family()            to authenticated;
grant execute on function public.new_family_invite()        to authenticated;
grant execute on function public.join_family(text)          to authenticated;
grant execute on function public.leave_family()             to authenticated;
grant execute on function public.remove_family_member(uuid) to authenticated;
grant execute on function public.delete_my_account()        to authenticated;

commit;

-- =============================================================================
-- 되돌리기 — 새 표·함수 제거, 탈퇴 함수와 동의 목록을 0015 상태로
--   (옛 families 표는 0행이었으므로 빈 표로 되살린다)
-- =============================================================================
-- begin;
-- drop function if exists public.my_family(), public.create_family(), public.new_family_invite(),
--   public.join_family(text), public.leave_family(), public.remove_family_member(uuid),
--   public.is_family_member(uuid), public._has_family_consent(uuid), public._new_invite_code();
-- -- delete_my_account 를 0004 본문으로 되돌린 뒤에 _family_leave 를 지운다
-- drop function if exists public._family_leave(uuid);
-- drop table if exists public.family_records, public.family_members, public.families;
-- drop function if exists public.family_records_stamp();
-- create table public.families (code text not null primary key,
--   data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
-- alter table public.families enable row level security;
-- revoke all on public.families from anon, authenticated;
-- delete from public.consent_records where kind = 'family_share';
-- alter table public.consent_records drop constraint if exists consent_records_kind_chk;
-- alter table public.consent_records add constraint consent_records_kind_chk check (kind in (
--   'signup_terms','signup_privacy','signup_age14','signup_marketing','trial_shipping',
--   'trial_brand_use','entry_photo','entry_brand_use','post_visibility'));
-- commit;
