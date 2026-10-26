-- =============================================================================
-- 0026_challenge_hall.sql — 이달의 주인공 · 명예의 전당 (2026-10-26 사장님: "이달의 주인공 자동으로")
--
-- 규칙: 그 달(한국 시간)에 받은 응원 수로 순위. 응원은 entry_votes.created_at 으로 센다.
--       같으면 먼저 올린 참가작이 앞. 이미 주인공이 된 참가작은 다음 달 순위에서 빠진다(다른 아이에게 기회).
--       달이 끝나면 그 달 응원은 더 늘지 않으므로 결과가 굳는다. 응원을 취소하면 그 행이 지워져 그 달 수도 준다.
-- 공개: 공개(approved)된 참가작의 이름·나이·메모·사진 경로만 돌려준다 (원래 누구나 보는 값). 누가 응원했는지는 주지 않는다.
-- 운영자: 주인공에게 연락할 이메일은 관리자만 (admin_challenge_winner_email).
-- 적용: 테스트 먼저. 운영은 사장님 SQL Editor. 0025 다음에.
-- =============================================================================
begin;

create index if not exists entry_votes_created_idx on public.entry_votes (created_at);

create or replace function public.challenge_hall(p_months int default 12)
returns table (month text, rnk int, entry_id uuid, name text, age text, note text, media_path text, challenge_key text, month_votes int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  winners uuid[] := '{}';
  m date;
  first_m date;
  this_m date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  r record;
  n int;
begin
  select date_trunc('month', min(v.created_at at time zone 'Asia/Seoul'))::date into first_m from entry_votes v;
  if first_m is null then return; end if;
  first_m := greatest(first_m, (this_m - make_interval(months => least(greatest(p_months, 1), 36)))::date);
  m := first_m;
  while m <= this_m loop
    n := 0;
    for r in
      select e.id, e.name, e.age, e.note, e.media_path, e.challenge_key, count(*)::int as c, min(e.created_at) as ec
        from entry_votes v join challenge_entries e on e.id = v.entry_id
       where e.status = 'approved'
         and (v.created_at at time zone 'Asia/Seoul') >= m
         and (v.created_at at time zone 'Asia/Seoul') < (m + interval '1 month')
         and not (e.id = any(winners))
       group by e.id, e.name, e.age, e.note, e.media_path, e.challenge_key
       order by c desc, ec asc
       limit 3
    loop
      n := n + 1;
      month := to_char(m, 'YYYY-MM'); rnk := n; entry_id := r.id; name := r.name; age := r.age; note := r.note;
      media_path := r.media_path; challenge_key := r.challenge_key; month_votes := r.c;
      return next;
      if n = 1 and m < this_m then winners := winners || r.id; end if;   -- 끝난 달의 1위만 확정
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
end $$;
revoke all on function public.challenge_hall(int) from public;
grant execute on function public.challenge_hall(int) to anon, authenticated;

-- 운영자가 주인공에게 연락할 이메일 (관리자만)
create or replace function public.admin_challenge_winner_email(p_entry uuid)
returns text language sql stable security definer set search_path = public, auth as $$
  select u.email::text from public.challenge_entries e join auth.users u on u.id = e.owner_id
   where e.id = p_entry and public.is_admin();
$$;
revoke all on function public.admin_challenge_winner_email(uuid) from public, anon;
grant execute on function public.admin_challenge_winner_email(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
