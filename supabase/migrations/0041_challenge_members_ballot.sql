-- 0041: 챌린지는 회원만 보기 + 심사를 '응원 + 투표'로 (사장님 2026-10-27
--   "챌린지는 로그인없으면 못 보게해줘", "응원하기+투표로 … 응원하기면 가계정만들어서 할수도있으니까")
--
-- 1) 로그인하지 않으면 참가작·참가작 사진·이달의 주인공을 못 본다. 챌린지 안내(제목·경품)는 그대로 보인다.
-- 2) 투표: 회원 한 명이 챌린지마다 한 달에 한 표. 가입 7일이 지나야 하고, 내 참가작에는 못 한다.
--    같은 참가작을 다시 누르면 취소, 다른 참가작을 누르면 옮겨 간다. 표는 cast_ballot() 으로만 넣는다.
-- 3) 점수 = 응원 1점 + 투표 5점. 가짜 계정을 막으려고 가입 7일이 안 된 계정의 응원·투표,
--    자기 참가작에 누른 응원은 점수에 넣지 않는다. 화면의 💛 숫자는 그대로 모든 응원 수.
begin;

-- 1) 회원만 보기
drop policy if exists ce_select on public.challenge_entries;
create policy ce_select on public.challenge_entries for select
  using ((((status = 'approved') and (select auth.uid()) is not null)
          or owner_id = (select auth.uid()) or (select public.is_admin()))
         and not public.is_blocked(owner_id));

create or replace function public.media_can_read(obj_name text, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_posts
     where media_path = obj_name
       and ((status = 'approved' and (audience = 'all' or uid is not null)) or (uid is not null and owner_id = uid) or public.is_admin())
  ) or exists (
    select 1 from public.challenge_entries
     where media_path = obj_name
       and ((status = 'approved' and uid is not null) or (uid is not null and owner_id = uid) or public.is_admin())
  );
$$;

-- 2) 투표
create table if not exists public.entry_ballots (
  voter_id      uuid not null references auth.users(id) on delete cascade,
  challenge_key text not null references public.challenges(id) on update cascade on delete cascade,
  month         text not null check (month ~ '^\d{4}-\d{2}$'),
  entry_id      uuid not null references public.challenge_entries(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (voter_id, challenge_key, month)
);
create index if not exists entry_ballots_entry_idx on public.entry_ballots (entry_id, month);
alter table public.entry_ballots enable row level security;
drop policy if exists eb_select on public.entry_ballots;
create policy eb_select on public.entry_ballots for select to authenticated
  using (voter_id = (select auth.uid()) or (select public.is_admin()));
revoke all on public.entry_ballots from anon, authenticated;
grant select on public.entry_ballots to authenticated;

create or replace function public.cast_ballot(p_entry uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e record;
  m text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
begin
  if uid is null then raise exception 'LOGIN_REQUIRED' using errcode = '42501'; end if;
  if (select u.created_at from auth.users u where u.id = uid) > now() - interval '7 days' then
    raise exception 'NEW_ACCOUNT' using errcode = 'P0001', hint = '가입 7일이 지나면 투표할 수 있어요';
  end if;
  select id, owner_id, challenge_key into e from public.challenge_entries
   where id = p_entry and status = 'approved' and not public.is_blocked(owner_id);
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if e.owner_id = uid then raise exception 'OWN_ENTRY' using errcode = 'P0001', hint = '내 참가작에는 투표할 수 없어요'; end if;
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

-- 3) 이달의 주인공: 점수 = 응원 1 + 투표 5 (가입 7일 지난 다른 회원 것만)
drop function if exists public.challenge_hall(int);
create function public.challenge_hall(p_months int default 12)
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
          from entry_ballots b join auth.users u on u.id = b.voter_id
         where b.month = to_char(m, 'YYYY-MM')
           and u.created_at <= b.created_at - interval '7 days'
      ), agg as (
        select e.id, e.name, e.age, e.note, e.media_path, e.challenge_key, e.created_at,
               sum(p.cheer)::int as c, sum(p.ballot)::int as b, (sum(p.cheer) + 5 * sum(p.ballot))::int as s
          from pts p join challenge_entries e on e.id = p.eid
         where e.status = 'approved'
           and not (e.id = any(winners))
         group by e.id, e.name, e.age, e.note, e.media_path, e.challenge_key, e.created_at
      )
      select * from (
        select agg.*, row_number() over (partition by agg.challenge_key order by agg.s desc, agg.b desc, agg.created_at asc)::int as rn
          from agg where agg.s > 0
      ) t where t.rn <= 3
      order by t.challenge_key, t.rn
    loop
      month := to_char(m, 'YYYY-MM'); rnk := r.rn; entry_id := r.id; name := r.name; age := r.age; note := r.note;
      media_path := r.media_path; challenge_key := r.challenge_key; month_votes := r.c; month_ballots := r.b; score := r.s;
      return next;
      if r.rn = 1 and m < this_m then winners := winners || r.id; end if;   -- 끝난 달의 챌린지별 1위만 확정
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
end $$;
revoke all on function public.challenge_hall(int) from public, anon;
grant execute on function public.challenge_hall(int) to authenticated;

update public.challenges set prize = '챌린지마다 매달 점수(응원+투표)가 가장 높은 1명에게 육아용품을 드려요.';

notify pgrst, 'reload schema';
commit;
