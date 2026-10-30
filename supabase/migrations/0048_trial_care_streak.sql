-- 0048 체험단 신청 때 육아기록 연속 일수를 남긴다 (2026-10-30, 홍보전략 4판 06 7-3 #4)
--
-- 혜택 화면은 "육아기록을 7일 이어 쓴 분을 먼저 뽑아요"라고 약속한다. 기록은 기기에 있어서
-- 서버가 모른다 → 신청할 때 앱이 센 값(0~60)을 같이 넣고, 운영자 목록에 보여 준다.
-- shortcut: 앱이 센 값이라 조작할 수 있다. 선정 순서 참고용이며 경품 판정에는 쓰지 않는다.
begin;

alter table public.benefit_applications
  add column if not exists care_streak smallint not null default 0 check (care_streak between 0 and 60);

drop function if exists public.admin_applications();
create function public.admin_applications()
returns table (id uuid, trial_key text, nickname text, region text, name_masked text, contact_masked text, address_masked text, purge_after date, created_at timestamptz, care_streak smallint)
language sql stable security definer set search_path = public as $fn$
  select a.id, a.trial_key, a.nickname, a.region, public.mask_name(p.recipient_name), public.mask_contact(p.contact), public.mask_address(p.address), p.purge_after, a.created_at, a.care_streak
    from public.benefit_applications a
    left join public.benefit_applications_pii p on p.application_id = a.id
   where public.is_admin()
   order by (a.care_streak >= 7) desc, a.created_at asc;
$fn$;
revoke all on function public.admin_applications() from public, anon;
grant execute on function public.admin_applications() to authenticated;

notify pgrst, 'reload schema';
commit;
