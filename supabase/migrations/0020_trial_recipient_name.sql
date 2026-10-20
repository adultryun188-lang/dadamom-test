-- =============================================================================
-- 0020_trial_recipient_name.sql  —  체험단 배송정보에 "받는 분 이름" 추가
--
-- 배경 (2026-10-20 사장님): 배송하려면 받는 분 이름이 필요한데 신청서에 이름 칸이 없었다.
--   연락처·주소와 같은 분리 표(benefit_applications_pii)에 둔다 → 같은 RLS(본인만 넣고 읽기),
--   같은 90일 자동 파기(0018), 관리자 화면에서는 가린 값만, 열람은 사유를 남기고(0006).
--   네이버 로그인 회원은 네이버 이름으로 미리 채운다 (앱, 고칠 수 있음).
--
-- 반환 모양이 바뀌는 두 함수는 drop 후 다시 만든다 (create or replace 로는 반환 열을 못 바꿈).
-- 권한은 0006 과 같게: PUBLIC·anon 회수, authenticated 만 실행 (안에서 is_admin 확인).
-- 적용: 테스트 2026-10-20. 운영은 네이버 로그인 이관 때 같이 (사장님 승인).
-- =============================================================================
begin;

alter table public.benefit_applications_pii add column if not exists recipient_name text;

create or replace function public.mask_name(v text)
returns text language sql immutable set search_path = public as $fn$
  select case when v is null or btrim(v) = '' then '***'
              else left(btrim(v), 1) || repeat('*', greatest(char_length(btrim(v)) - 1, 1)) end;
$fn$;

drop function if exists public.admin_applications();
create function public.admin_applications()
returns table (id uuid, trial_key text, nickname text, region text, name_masked text, contact_masked text, address_masked text, purge_after date, created_at timestamptz)
language sql stable security definer set search_path = public as $fn$
  select a.id, a.trial_key, a.nickname, a.region, public.mask_name(p.recipient_name), public.mask_contact(p.contact), public.mask_address(p.address), p.purge_after, a.created_at
    from public.benefit_applications a
    left join public.benefit_applications_pii p on p.application_id = a.id
   where public.is_admin()
   order by a.created_at desc;
$fn$;
revoke all on function public.admin_applications() from public, anon;
grant execute on function public.admin_applications() to authenticated;

drop function if exists public.reveal_application_pii(uuid, text);
create function public.reveal_application_pii(app_id uuid, why text)
returns table (recipient_name text, contact text, address text)
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(btrim(why), '') = '' then raise exception '열람 사유가 필요합니다' using errcode = '22023'; end if;
  insert into public.pii_access_log (application_id, viewer_id, reason) values (app_id, auth.uid(), btrim(why));
  return query select p.recipient_name, p.contact, p.address from public.benefit_applications_pii p where p.application_id = app_id;
end $fn$;
revoke all on function public.reveal_application_pii(uuid, text) from public, anon;
grant execute on function public.reveal_application_pii(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
