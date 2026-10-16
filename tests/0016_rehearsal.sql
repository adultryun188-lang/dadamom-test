-- =============================================================================
-- tests/0016_rehearsal.sql — 0016 가족 공유 리허설. begin ... rollback 이라 DB 에 남지 않는다.
--
-- 앞부분은 supabase/migrations/0016_family_share.sql 본문(begin~commit 사이) 그대로,
-- 뒷부분은 가짜 사용자 6명으로 하는 권한·흐름 시험이다.
-- 오류 없이 끝나면 통과. assert 가 깨지면 그 메시지로 멈춘다.
-- 본문을 고치면 이 파일도 다시 만든다 (본문 복사 + 아래 시험).
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


-- =============================================================================
-- 여기부터 시험. 가짜 사용자 6명을 만들어 역할을 바꿔 가며 확인한다.
-- assert 가 하나라도 깨지면 오류로 멈춘다. 오류 없이 끝나면 통과.
-- =============================================================================
create function public._rh_act(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('rh.u' || n), 'role', 'authenticated')::text, true);
end $$;

create function public._rh_expect_err(q text, want text) returns void language plpgsql as $$
declare got text;
begin
  begin
    execute q;
    got := '(오류 없이 성공함)';
  exception when others then
    got := sqlerrm;
  end;
  if got not like '%' || want || '%' then
    raise exception '기대한 오류 [%] / 실제 [%] / %', want, got, q;
  end if;
end $$;

do $$
declare i int; uid uuid;
begin
  for i in 1..6 loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email)
         values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
                 'rehearsal' || i || '@dadamom.test');
    perform set_config('rh.u' || i, uid::text, true);
  end loop;
end $$;

-- 비로그인: 함수도 표도 막힘
set local role anon;
select public._rh_expect_err('select public.create_family()', 'permission denied');
select public._rh_expect_err('select public.join_family(''X'')', 'permission denied');
select public._rh_expect_err('select * from public.family_records', 'permission denied');
reset role;

set local role authenticated;
do $$
declare code text; fid uuid; r json; n int; c int;
begin
  -- 1 동의 없이는 못 만든다
  perform public._rh_act(1);
  perform public._rh_expect_err('select public.create_family()', 'consent_required');
  insert into public.consent_records (kind, granted) values ('family_share', true);
  r := public.create_family();
  code := r->>'invite_code';
  fid := (r->>'family_id')::uuid;
  perform set_config('rh.fid', fid::text, true);
  assert code ~ '^[0-9A-F]{10}$', '초대 코드 형식: ' || coalesce(code, 'null');
  perform public._rh_expect_err('select public.create_family()', 'already_in_family');

  -- 2 참여: 동의 필요, 소문자·하이픈 섞어도 됨, 4명까지
  for n in 2..5 loop
    perform public._rh_act(n);
    perform public._rh_expect_err(format('select public.join_family(%L)', code), 'consent_required');
    insert into public.consent_records (kind, granted) values ('family_share', true);
    if n < 5 then
      perform public.join_family(lower(substr(code, 1, 5)) || '-' || substr(code, 6));
    else
      perform public._rh_expect_err(format('select public.join_family(%L)', code), 'family_full');
    end if;
  end loop;
  perform public._rh_act(6);
  insert into public.consent_records (kind, granted) values ('family_share', true);
  perform public._rh_expect_err('select public.join_family(''0000000000'')', 'invalid_code');
  perform public._rh_expect_err('select public.join_family('''')', 'invalid_code');

  -- 동의를 철회하면(최근 기록이 false) 다시 막힌다
  insert into public.consent_records (kind, granted) values ('family_share', false);
  perform public._rh_expect_err(format('select public.join_family(%L)', code), 'consent_required');

  -- 3 기록: 작성자·시각은 서버가 찍고, 구성원만 읽고 쓴다
  perform public._rh_act(2);
  insert into public.family_records (family_id, kind, rid, body, updated_by)
       values (fid, 'care', 'c1', '{"type":"feed","ts":1}', current_setting('rh.u1')::uuid);
  select count(*) into c from public.family_records
   where family_id = fid and updated_by = current_setting('rh.u2')::uuid;
  assert c = 1, 'updated_by 를 클라이언트가 바꿀 수 있음';
  insert into public.family_records (family_id, kind, rid, body)
       values (fid, 'vaccine', 'bcg', 'true')
  on conflict (family_id, kind, rid) do update set body = excluded.body;
  insert into public.family_records (family_id, kind, rid, body)
       values (fid, 'vaccine', 'bcg', 'false')
  on conflict (family_id, kind, rid) do update set body = excluded.body;
  assert (select body from public.family_records where family_id = fid and rid = 'bcg') = 'false'::jsonb,
         'upsert 가 갱신되지 않음';
  perform public._rh_expect_err(
    format('insert into public.family_records (family_id, kind, rid, body) values (%L, ''care'', ''big'', %L)',
           fid, json_build_object('memo', repeat('가', 1000))), 'check constraint');

  perform public._rh_act(1);
  select count(*) into c from public.family_records where family_id = fid;
  assert c = 2, '다른 구성원 기록이 안 보임: ' || c;
  update public.family_records set deleted = true where family_id = fid and rid = 'c1';
  assert (select deleted from public.family_records where family_id = fid and rid = 'c1'), '삭제 표시 안 됨';
  perform public._rh_expect_err(
    format('update public.family_records set rid = ''c2'' where family_id = %L and rid = ''c1''', fid), 'immutable');
  perform public._rh_expect_err(
    format('delete from public.family_records where family_id = %L', fid), 'permission denied');

  perform public._rh_act(6);                                   -- 비구성원
  select count(*) into c from public.family_records where family_id = fid;
  assert c = 0, '비구성원이 기록을 봄';
  perform public._rh_expect_err(
    format('insert into public.family_records (family_id, kind, rid) values (%L, ''care'', ''x'')', fid),
    'row-level security');
  assert public.my_family() is null, '비구성원 my_family 가 null 이 아님';
  perform public._rh_expect_err('select * from public.families', 'permission denied');
  perform public._rh_expect_err('select * from public.family_members', 'permission denied');
  perform public._rh_expect_err('select public._family_leave(auth.uid())', 'permission denied');

  -- 4 방장만 뺄 수 있고, 빼면 초대 코드가 무효
  perform public._rh_act(1);
  r := public.my_family();
  assert json_array_length(r->'members') = 4 and (r->>'is_owner')::boolean, '구성원 목록/방장 표시 틀림';
  perform public._rh_act(2);
  perform public._rh_expect_err(format('select public.remove_family_member(%L)', current_setting('rh.u3')), 'not_owner');
  perform public._rh_act(1);
  perform public._rh_expect_err(format('select public.remove_family_member(%L)', current_setting('rh.u1')), 'use_leave');
  perform public.remove_family_member(current_setting('rh.u4')::uuid);
  assert (public.my_family()->>'invite_code') is null, '빼고 나서 초대 코드가 남음';
  perform public._rh_act(4);
  assert public.my_family() is null, '빠진 사람이 아직 구성원';
  perform public._rh_expect_err(format('select public.join_family(%L)', code), 'invalid_code');
  select count(*) into c from public.family_records where family_id = fid;
  assert c = 0, '빠진 사람이 기록을 봄';

  -- 5 새 초대 코드는 구성원 누구나, 이전 코드는 무효
  perform public._rh_act(2);
  r := public.new_family_invite();
  assert (r->>'invite_code') <> code, '새 코드가 같음';

  -- 6 방장이 나가면 다음으로 오래된 사람이 방장
  perform public._rh_act(1);
  perform public.leave_family();
  perform public._rh_act(2);
  assert (public.my_family()->>'is_owner')::boolean, '방장이 넘어가지 않음';

  -- 7 탈퇴하면 가족에서도 빠지고 방장이 넘어간다
  perform public.delete_my_account();
  perform public._rh_act(3);
  r := public.my_family();
  assert json_array_length(r->'members') = 1 and (r->>'is_owner')::boolean, '탈퇴 후 구성원/방장 정리 안 됨';
  assert exists (select 1 from public.family_records where family_id = fid and rid = 'bcg' and updated_by is null),
         '탈퇴한 사람이 남긴 기록이 사라졌거나 작성자가 남음';

  -- 8 마지막 사람이 나가면 가족과 기록이 지워진다 (아래 postgres 로 확인)
  perform public.leave_family();
  assert public.my_family() is null, '나갔는데 아직 구성원';
end $$;
reset role;

do $$
begin
  assert not exists (select 1 from public.families where id = current_setting('rh.fid')::uuid), '빈 가족이 남음';
  assert not exists (select 1 from public.family_records where family_id = current_setting('rh.fid')::uuid), '기록이 남음';
  assert not has_function_privilege('anon', 'public.my_family()', 'execute'), 'anon 이 my_family 실행 가능';
  assert not has_function_privilege('authenticated', 'public._family_leave(uuid)', 'execute'), '내부 함수가 열려 있음';
end $$;

rollback;
