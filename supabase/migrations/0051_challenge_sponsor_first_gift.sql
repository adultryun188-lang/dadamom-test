-- 0051 대회 개편 (2026-10-30, 홍보전략 4판 09·10)
-- 1) challenges.sponsor: 경품을 함께 주는 브랜드 이름. 비어 있으면 화면에 안 보인다.
-- 2) admin_first_gift(): 이번 달 처음 참가해 승인된 회원 30명 (한 사람 한 번) — 메가커피 보낼 명단.
--    이메일은 운영자만, 쿠폰 보낼 때만 본다.
begin;

alter table public.challenges add column if not exists sponsor text check (sponsor is null or char_length(sponsor) between 1 and 40);

create or replace function public.admin_first_gift(p_month text default to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'))
returns table (rn int, entry_id uuid, challenge_key text, name text, owner_id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with firsts as (
      select distinct on (e.owner_id) e.id, e.challenge_key, e.name, e.owner_id, e.created_at
        from public.challenge_entries e
       where e.status = 'approved'
         and to_char(e.created_at at time zone 'Asia/Seoul', 'YYYY-MM') = p_month
       order by e.owner_id, e.created_at
    )
    , ok as (
      select f.*, u.email::text as em
        from firsts f join auth.users u on u.id = f.owner_id
       where not exists (select 1 from public.admin_emails a where lower(a.email) = lower(u.email))   -- 운영자 제외
    )
    select (row_number() over (order by ok.created_at))::int, ok.id, ok.challenge_key, ok.name, ok.owner_id, ok.em, ok.created_at
      from ok
     order by ok.created_at
     limit 30;
end $$;
revoke all on function public.admin_first_gift(text) from public, anon;
grant execute on function public.admin_first_gift(text) to authenticated;

notify pgrst, 'reload schema';
commit;
