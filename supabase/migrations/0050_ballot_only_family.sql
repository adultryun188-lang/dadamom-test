-- 0050 대회 심사를 '투표 수'로만 + 가족 공유로 연결된 가족은 바로 투표 (2026-10-30 사장님)
--   "한 계정당 한 개의 챌린지에 1번 투표할 수 있게 해. 다만 가족 공유로 투표도 가능하게"
--
-- 1) 1위 = 그달 투표를 가장 많이 받은 참가작. 표가 같으면 응원이 많은 쪽, 그다음 먼저 올린 쪽.
--    응원은 반응으로만 남고 점수에 안 들어간다. 투표는 0041 그대로 회원 한 명이 챌린지마다 한 달에 한 표.
-- 2) 가입 7일 규칙의 예외: 투표하는 사람과 참가작 주인이 같은 가족(family_members)이면 바로 투표할 수 있다.
--    가족은 최대 4명(join_family)이라 바로 늘어나는 표는 한 집에 최대 3표.
--    표의 유효성은 cast_ballot 이 넣을 때 판단하므로, 집계(challenge_hall)는 들어간 표를 모두 센다.
begin;

create or replace function public._same_family(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members x join public.family_members y on y.family_id = x.family_id
                  where x.user_id = a and y.user_id = b);
$$;
revoke all on function public._same_family(uuid, uuid) from public, anon, authenticated;

create or replace function public.cast_ballot(p_entry uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e record;
  m text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
begin
  if uid is null then raise exception 'LOGIN_REQUIRED' using errcode = '42501'; end if;
  select id, owner_id, challenge_key into e from public.challenge_entries
   where id = p_entry and status = 'approved' and not public.is_blocked(owner_id);
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if e.owner_id = uid then raise exception 'OWN_ENTRY' using errcode = 'P0001', hint = '내 참가작에는 투표할 수 없어요'; end if;
  if (select u.created_at from auth.users u where u.id = uid) > now() - interval '7 days'
     and not public._same_family(uid, e.owner_id) then
    raise exception 'NEW_ACCOUNT' using errcode = 'P0001', hint = '가입 7일이 지나면 투표할 수 있어요';
  end if;
  if exists (select 1 from public.entry_ballots b where b.voter_id = uid and b.challenge_key = e.challenge_key and b.month = m and b.entry_id = p_entry) then
    delete from public.entry_ballots b where b.voter_id = uid and b.challenge_key = e.challenge_key and b.month = m;
    return 'removed';
  end if;
  insert into public.entry_ballots (voter_id, challenge_key, month, entry_id) values (uid, e.challenge_key, m, p_entry)
    on conflict (voter_id, challenge_key, month) do update set entry_id = excluded.entry_id, created_at = now();
  return 'voted';
end $$;
revoke all on function public.cast_ballot(uuid) from public, anon;
grant execute on function public.cast_ballot(uuid) to authenticated;

-- 이달의 주인공: score = 투표 수. month_votes 는 순위 동점 처리용 응원 수(가입 7일 지난 다른 회원 것).
create or replace function public.challenge_hall(p_months int default 12)
returns table (month text, rnk int, entry_id uuid, name text, age text, note text, media_path text, challenge_key text,
               month_votes int, month_ballots int, score int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  winners uuid[] := '{}';
  m date;
  first_m date;
  this_m date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  r record;
begin
  if auth.uid() is null then return; end if;   -- 회원만
  select least(
           (select date_trunc('month', min(v.created_at at time zone 'Asia/Seoul'))::date from entry_votes v),
           (select to_date(min(b.month), 'YYYY-MM') from entry_ballots b)) into first_m;
  if first_m is null then return; end if;
  first_m := greatest(first_m, (this_m - make_interval(months => least(greatest(p_months, 1), 36)))::date);
  m := first_m;
  while m <= this_m loop
    for r in
      with pts as (
        select v.entry_id as eid, 1 as cheer, 0 as ballot
          from entry_votes v join auth.users u on u.id = v.voter_id
         where (v.created_at at time zone 'Asia/Seoul') >= m
           and (v.created_at at time zone 'Asia/Seoul') < (m + interval '1 month')
           and u.created_at <= v.created_at - interval '7 days'
        union all
        select b.entry_id, 0, 1
          from entry_ballots b
         where b.month = to_char(m, 'YYYY-MM')
      ), agg as (
        select e.id, e.name, e.age, e.note, e.media_path, e.challenge_key, e.created_at,
               sum(p.cheer)::int as c, sum(p.ballot)::int as b
          from pts p join challenge_entries e on e.id = p.eid
         where e.status = 'approved'
           and not (e.id = any(winners))
         group by e.id, e.name, e.age, e.note, e.media_path, e.challenge_key, e.created_at
      )
      select * from (
        select agg.*, row_number() over (partition by agg.challenge_key order by agg.b desc, agg.c desc, agg.created_at asc)::int as rn
          from agg where agg.b > 0 or agg.c > 0
      ) t where t.rn <= 3
      order by t.challenge_key, t.rn
    loop
      month := to_char(m, 'YYYY-MM'); rnk := r.rn; entry_id := r.id; name := r.name; age := r.age; note := r.note;
      media_path := r.media_path; challenge_key := r.challenge_key; month_votes := r.c; month_ballots := r.b; score := r.b;
      return next;
      if r.rn = 1 and m < this_m then winners := winners || r.id; end if;   -- 끝난 달의 챌린지별 1위만 확정
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
end $$;
revoke all on function public.challenge_hall(int) from public, anon;
grant execute on function public.challenge_hall(int) to authenticated;

update public.challenges set prize = replace(prize, '점수(응원+투표)가 가장 높은', '투표를 가장 많이 받은');

notify pgrst, 'reload schema';
commit;
