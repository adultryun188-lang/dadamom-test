-- ════════════════════════════════════════════════════════════════════
--  P0-05 단계 A 적용 — 0006(수정) + 0007 + 0008
--  ⚠️ 리허설이 통과한 뒤에만 실행하세요. 이 파일은 commit 합니다.
--
--  drop column 두 줄은 들어있지 않습니다 (단계 C 로 미룹니다).
--  그래서 이 단계가 끝난 뒤에도 구 코드의 체험단 신청이 정상 동작합니다.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ───────────── 0006_consent_and_pii.sql (drop column 2줄 제외) ─────────────

-- ─────────────────────────────────────────────── 1) 동의 원장 ──
-- 추가만 한다. 철회도 granted=false 인 새 행으로 남긴다.
-- UPDATE/DELETE 정책을 만들지 않아 원장이 사후에 바뀌지 않는다.
create table if not exists public.consent_records (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null,
  granted     boolean not null,
  doc_version text not null default 'v1',
  scope       text,
  subject_id  uuid,
  created_at  timestamptz not null default now(),
  constraint consent_records_kind_chk check (kind in (
    'trial_shipping',    -- 배송을 위한 연락처·주소 제공 (필수)
    'trial_brand_use',   -- 브랜드의 후기 광고 활용 (선택)
    'entry_photo',       -- 아이 사진 챌린지 게시 (필수)
    'entry_brand_use',   -- 브랜드의 참가작 광고 활용 (선택)
    'post_visibility'    -- 게시글 공개범위 확인
  ))
);
create index if not exists consent_records_owner_idx
  on public.consent_records (owner_id, kind, created_at desc);

alter table public.consent_records enable row level security;
drop policy if exists cr_select on public.consent_records;
drop policy if exists cr_insert on public.consent_records;
create policy cr_select on public.consent_records for select to authenticated
  using (owner_id = auth.uid() or is_admin());
create policy cr_insert on public.consent_records for insert to authenticated
  with check (owner_id = auth.uid());
-- UPDATE / DELETE 정책 없음 = 아무도 못 고치고 못 지운다 (계정 삭제 시 cascade 만)

grant select, insert on public.consent_records to authenticated;
revoke all on public.consent_records from anon;

-- ────────────────────────────────── 2) 체험단 개인정보 분리 ──
-- 배송에만 쓰는 정보를 본문에서 떼어낸다.
-- select 를 '본인만' 으로 둔다. 검수자도 이 테이블은 직접 못 읽는다.
create table if not exists public.benefit_applications_pii (
  application_id uuid primary key
                 references public.benefit_applications(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  contact        text,
  address        text,
  purge_after    date not null default (current_date + 90),
  created_at     timestamptz not null default now()
);
create index if not exists ba_pii_purge_idx on public.benefit_applications_pii (purge_after);

alter table public.benefit_applications_pii enable row level security;
drop policy if exists bap_select on public.benefit_applications_pii;
drop policy if exists bap_insert on public.benefit_applications_pii;
drop policy if exists bap_delete on public.benefit_applications_pii;
create policy bap_select on public.benefit_applications_pii for select to authenticated
  using (owner_id = auth.uid());
create policy bap_insert on public.benefit_applications_pii for insert to authenticated
  with check (owner_id = auth.uid());
create policy bap_delete on public.benefit_applications_pii for delete to authenticated
  using (owner_id = auth.uid() or is_admin());

grant select, insert, delete on public.benefit_applications_pii to authenticated;
revoke all on public.benefit_applications_pii from anon;

-- 기존 행 이전
insert into public.benefit_applications_pii (application_id, owner_id, contact, address)
select a.id, a.owner_id, a.contact, a.address
  from public.benefit_applications a
 where (coalesce(a.contact,'') <> '' or coalesce(a.address,'') <> '')
on conflict (application_id) do nothing;

-- 본문에서 제거. 남겨두면 두 곳에 같은 정보가 생겨 파기가 의미 없어진다.
-- [단계 C 로 미룸] alter table public.benefit_applications drop column if exists contact;
-- [단계 C 로 미룸] alter table public.benefit_applications drop column if exists address;

-- ──────────────────────── 3) 검수자용 마스킹 + 열람 기록 ──
-- 검수자는 평소 마스킹된 값만 본다. 010-1234-5678 → 010-****-5678
create or replace function public.mask_contact(v text)
returns text language sql immutable as $fn$
  select case
    when v is null or length(regexp_replace(v, '\D', '', 'g')) < 7 then '***'
    else left(regexp_replace(v, '\D', '', 'g'), 3) || '-****-' ||
         right(regexp_replace(v, '\D', '', 'g'), 4)
  end;
$fn$;

-- 주소는 앞 두 마디(시/도 + 시군구)까지만
create or replace function public.mask_address(v text)
returns text language sql immutable as $fn$
  select case
    when v is null or btrim(v) = '' then '***'
    else array_to_string((string_to_array(btrim(v), ' '))[1:2], ' ') || ' ***'
  end;
$fn$;

-- 열람 기록. 누가 언제 누구의 배송지를 열었는지 남긴다.
create table if not exists public.pii_access_log (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  viewer_id      uuid not null references auth.users(id) on delete set null,
  reason         text,
  created_at     timestamptz not null default now()
);
alter table public.pii_access_log enable row level security;
drop policy if exists pal_select on public.pii_access_log;
create policy pal_select on public.pii_access_log for select to authenticated
  using (is_admin());
grant select on public.pii_access_log to authenticated;
revoke all on public.pii_access_log from anon;
-- INSERT 는 아래 함수(security definer)로만. 직접 넣을 수 없다.

-- 검수자용 목록: 마스킹된 값만
create or replace function public.admin_applications()
returns table (
  id uuid, trial_key text, nickname text, region text,
  contact_masked text, address_masked text,
  purge_after date, created_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select a.id, a.trial_key, a.nickname, a.region,
         public.mask_contact(p.contact), public.mask_address(p.address),
         p.purge_after, a.created_at
    from public.benefit_applications a
    left join public.benefit_applications_pii p on p.application_id = a.id
   where public.is_admin()
   order by a.created_at desc;
$fn$;
revoke all on function public.admin_applications() from public, anon;
grant execute on function public.admin_applications() to authenticated;

-- 배송할 때만 여는 열람 함수. 부를 때마다 기록이 남는다.
create or replace function public.reveal_application_pii(app_id uuid, why text)
returns table (contact text, address text)
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(why), '') = '' then
    raise exception '열람 사유가 필요합니다' using errcode = '22023';
  end if;
  insert into public.pii_access_log (application_id, viewer_id, reason)
  values (app_id, auth.uid(), btrim(why));
  return query
    select p.contact, p.address
      from public.benefit_applications_pii p
     where p.application_id = app_id;
end $fn$;
revoke all on function public.reveal_application_pii(uuid, text) from public, anon;
grant execute on function public.reveal_application_pii(uuid, text) to authenticated;

-- ───────────────────────────────────── 4) 파기 ──
-- 기한이 지난 배송 정보를 지운다. 신청 기록(닉네임·지역·당첨 여부)은 남는다.
create or replace function public.purge_expired_pii()
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  delete from public.benefit_applications_pii where purge_after < current_date;
  get diagnostics n = row_count;
  return n;
end $fn$;
revoke all on function public.purge_expired_pii() from public, anon, authenticated;
-- 운영자 콘솔에서 부를 수 있게. 자동화는 Supabase 스케줄러로 별도 설정.
grant execute on function public.purge_expired_pii() to authenticated;

-- 파기 예정 건수 (콘솔 표시용)
create or replace function public.pii_purge_stats()
returns table (total bigint, expiring_30d bigint, expired bigint)
language sql stable security definer set search_path = public as $fn$
  select count(*),
         count(*) filter (where purge_after <= current_date + 30 and purge_after >= current_date),
         count(*) filter (where purge_after < current_date)
    from public.benefit_applications_pii
   where public.is_admin();
$fn$;
revoke all on function public.pii_purge_stats() from public, anon;
grant execute on function public.pii_purge_stats() to authenticated;

-- 계정 삭제 시 원장·PII 도 같이 지워지도록 (cascade 로 이미 되지만 명시)
notify pgrst, 'reload schema';


-- ───────────── 0007_pii_hardening.sql ─────────────

-- ─────────────────────────────── (A) 파기는 검수자만 ──
create or replace function public.purge_expired_pii()
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.benefit_applications_pii where purge_after < current_date;
  get diagnostics n = row_count;
  return n;
end $fn$;
revoke all on function public.purge_expired_pii() from public, anon;
grant execute on function public.purge_expired_pii() to authenticated;

-- ──────────────────── (B) 열람 기록은 사람이 지워져도 남는다 ──
alter table public.pii_access_log alter column viewer_id drop not null;

comment on column public.pii_access_log.viewer_id is
  '연 사람. 그 계정이 탈퇴하면 NULL 이 되고 기록 자체는 남는다.';

-- ─────────────────── (C) 배송지는 "내 신청서" 에만 붙는다 ──
-- 정책 안에서 다른 표를 직접 조회하면 그 표의 RLS·권한에 또 걸린다.
-- (P0-04 의 is_blocked / media_can_read 에서 이미 두 번 당한 자리다.)
-- security definer 함수로 감싸서 그 함정을 피한다.
create or replace function public.owns_application(app_id uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.benefit_applications
     where id = app_id and owner_id = uid
  );
$fn$;
revoke all on function public.owns_application(uuid, uuid) from public, anon;
grant execute on function public.owns_application(uuid, uuid) to authenticated;

drop policy if exists bap_insert on public.benefit_applications_pii;
create policy bap_insert on public.benefit_applications_pii for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.owns_application(application_id, auth.uid())
  );

notify pgrst, 'reload schema';


-- ───────────── 0008_purge_after_server_only.sql ─────────────

revoke insert on public.benefit_applications_pii from authenticated;
grant insert (application_id, owner_id, contact, address)
  on public.benefit_applications_pii to authenticated;

-- select / delete 는 그대로 둔다 (본인 조회, 본인·검수자 삭제)
grant select, delete on public.benefit_applications_pii to authenticated;

comment on column public.benefit_applications_pii.purge_after is
  '보관 기한. 서버 기본값(90일)으로만 정해진다. 클라이언트는 이 칸에 쓸 수 없다.';

notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════
commit;
-- ════════════════════════════════════════════════════════════════════
-- 적용됐습니다. 아래 확인 표 4개의 결과를 알려주세요.

-- ════════════════════════════════════════════════════════════════════
--  확인 — 표 4개. 결과를 그대로 알려주세요.
-- ════════════════════════════════════════════════════════════════════

-- [표 1] 이전됐나 — 두 숫자가 3절 [2] 의 '옮길행' 과 같아야 합니다.
--        '아직본문에' 는 단계 C 에서 지울 예정이라 지금은 같아도 정상입니다.
select (select count(*) from public.benefit_applications_pii) as pii행수,
       (select count(*) from public.benefit_applications
         where coalesce(contact,'') <> '' or coalesce(address,'') <> '') as 아직본문에;

-- [표 2] 표 권한 — anon 은 한 줄도 나오면 안 됩니다.
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema='public'
   and table_name in ('consent_records','benefit_applications_pii','pii_access_log')
   and grantee in ('anon','authenticated')
 order by table_name, grantee, privilege_type;

-- [표 3] 함수 권한 — anon=false, authenticated=true
select p.proname as 함수, r.rolname as 역할,
       has_function_privilege(r.rolname, p.oid, 'execute') as 실행가능
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
       (values ('anon'),('authenticated')) as r(rolname)
 where n.nspname='public'
   and p.proname in ('admin_applications','reveal_application_pii','purge_expired_pii','pii_purge_stats')
 order by p.proname, r.rolname;

-- [표 4] drop column 이 정말 안 됐는지 — 둘 다 1 이어야 합니다.
--        0 이면 컬럼이 지워진 것이고, 코드 배포 전까지 체험단 신청이 실패합니다.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications' and column_name='contact') as contact컬럼,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications' and column_name='address') as address컬럼;
