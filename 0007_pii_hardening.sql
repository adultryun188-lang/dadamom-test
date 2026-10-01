-- =============================================================================
-- 0007_pii_hardening.sql  —  0006 에서 내가 낸 구멍 셋을 막는다
--
-- 0006 을 적용한 뒤 파일을 다시 읽다가 찾았습니다. 셋 다 0006 안의 실수입니다.
--
-- (A) purge_expired_pii() 에 관리자 확인이 없었다.
--     security definer 인데 authenticated 전원에게 execute 를 줬고,
--     함수 본문에 is_admin() 검사가 없다. 즉 로그인만 하면 아무나
--     "기한 지난 배송정보 전부 삭제" 를 실행할 수 있었다. 되돌릴 수 없는 파괴 동작이다.
--     (0006 의 침투 테스트 12개는 읽기·수정만 봤고 이 함수는 부르지 않았다.)
--
-- (B) pii_access_log.viewer_id 가 not null 인데 FK 가 on delete set null 이다.
--     검수자가 회원 탈퇴하면 PostgreSQL 이 NULL 을 넣으려다 23502 로 실패하고
--     delete_my_account() 전체가 실패한다. P0-04 에서 고쳤던 것과 같은 모양의 버그다.
--     열람 기록은 감사 기록이므로 cascade 로 같이 지우면 안 된다.
--     → viewer_id 의 not null 을 푼다. 사람은 지워져도 "열린 사실" 은 남는다.
--
-- (C) 남의 신청서에 배송지를 심을 수 있었다.
--     bap_insert 정책이 owner_id = auth.uid() 만 봤다. application_id 가
--     "내 신청서" 인지는 보지 않았다. 아직 배송정보가 없는 남의 신청서 id 를
--     알아내면, 거기에 자기 주소를 넣을 수 있었다. 검수자 화면에는 그게
--     그 신청자의 배송지로 보인다. → 검수자가 엉뚱한 곳으로 물건을 보낸다.
--     → 정책에 "그 신청서가 내 것" 조건을 추가한다.
--
-- 적용 순서: 0006 다음
-- 리허설: tests/0007_rehearsal.sql (begin ... rollback)
-- =============================================================================
begin;

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

commit;

-- =============================================================================
-- 되돌리기 (권장하지 않음 — 되돌리면 (A) 구멍이 다시 열린다)
-- =============================================================================
-- begin;
-- create or replace function public.purge_expired_pii()
-- returns integer language plpgsql security definer set search_path = public as $fn$
-- declare n integer;
-- begin
--   delete from public.benefit_applications_pii where purge_after < current_date;
--   get diagnostics n = row_count; return n;
-- end $fn$;
-- alter table public.pii_access_log alter column viewer_id set not null;
-- drop policy if exists bap_insert on public.benefit_applications_pii;
-- create policy bap_insert on public.benefit_applications_pii for insert to authenticated
--   with check (owner_id = auth.uid());
-- drop function if exists public.owns_application(uuid, uuid);
-- commit;
