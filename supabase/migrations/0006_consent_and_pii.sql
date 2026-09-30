-- =============================================================================
-- 0006_consent_and_pii.sql  —  P0-05 동의 원장 + 체험단 개인정보 분리
--
-- 배경
--   1) 동의가 서버에 남지 않았다.
--      앱은 동의 체크 결과를 state.consent 객체로 만들어 localStorage 에만 저장했고
--      서버로는 보내지 않았다. 기기를 바꾸면 사라지고, "언제 무엇에 동의했는지"를
--      증명할 방법이 없었다. 개인정보 관련 분쟁에서 사업자가 입증 책임을 진다.
--
--   2) 체험단 신청의 연락처·주소가 본문 테이블에 평문으로 함께 있었다.
--      benefit_applications(trial_key, nickname, region, contact, address, ...)
--      검수자(is_admin)는 신청 목록을 보는 것만으로 전화번호와 집주소를 전부 봤다.
--      당첨자 배송에만 필요한 정보인데 모든 신청자 것이 상시 노출됐다.
--
--   3) 파기 기한이 없었다. 한 번 들어온 주소는 영구 보관됐다.
--
-- 이 파일이 하는 일
--   1. consent_records — 추가만 되는 동의 원장 (수정·삭제 정책 없음)
--   2. benefit_applications_pii — 연락처·주소를 분리. 검수자도 평문은 못 본다
--   3. 검수자용 마스킹 뷰 + 배송 시에만 여는 열람 함수(열람 기록 남김)
--   4. 90일 파기 기한과 파기 함수
--
-- 적용 순서: 0005 다음
-- 리허설: tests/0006_rehearsal.sql (begin ... rollback)
-- =============================================================================
begin;

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
alter table public.benefit_applications drop column if exists contact;
alter table public.benefit_applications drop column if exists address;

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

commit;

-- =============================================================================
-- 되돌리기
-- =============================================================================
-- begin;
-- alter table public.benefit_applications add column if not exists contact text;
-- alter table public.benefit_applications add column if not exists address text;
-- update public.benefit_applications a set contact = p.contact, address = p.address
--   from public.benefit_applications_pii p where p.application_id = a.id;
-- drop function if exists public.pii_purge_stats(), public.purge_expired_pii(),
--                         public.reveal_application_pii(uuid,text), public.admin_applications(),
--                         public.mask_address(text), public.mask_contact(text);
-- drop table if exists public.pii_access_log, public.benefit_applications_pii, public.consent_records;
-- commit;
