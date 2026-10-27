-- 0037: 경품을 챌린지마다 한 달 1명 (사장님 2026-10-27 "챌린지별 한 달 1명으로 바꿔")
-- 이달의 주인공(challenge_hall)을 챌린지별로 센다: 그 달 그 챌린지에서 응원을 가장 많이 받은 참가작이 1위.
-- 돌려주는 모양은 0026 과 같다 (rnk 가 '챌린지 안에서의 순위'로 바뀜). 이미 주인공이 된 참가작은 다음 달에서 빠진다.
-- 첫걸음도 다른 챌린지처럼 상시·매달 (11/30 마감·추첨 4명 → 매달 1명).
begin;

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
begin
  select date_trunc('month', min(v.created_at at time zone 'Asia/Seoul'))::date into first_m from entry_votes v;
  if first_m is null then return; end if;
  first_m := greatest(first_m, (this_m - make_interval(months => least(greatest(p_months, 1), 36)))::date);
  m := first_m;
  while m <= this_m loop
    for r in
      select * from (
        select e.id, e.name, e.age, e.note, e.media_path, e.challenge_key, count(*)::int as c,
               row_number() over (partition by e.challenge_key order by count(*) desc, min(e.created_at) asc)::int as rn
          from entry_votes v join challenge_entries e on e.id = v.entry_id
         where e.status = 'approved'
           and (v.created_at at time zone 'Asia/Seoul') >= m
           and (v.created_at at time zone 'Asia/Seoul') < (m + interval '1 month')
           and not (e.id = any(winners))
         group by e.id, e.name, e.age, e.note, e.media_path, e.challenge_key
      ) t where t.rn <= 3
      order by t.challenge_key, t.rn
    loop
      month := to_char(m, 'YYYY-MM'); rnk := r.rn; entry_id := r.id; name := r.name; age := r.age; note := r.note;
      media_path := r.media_path; challenge_key := r.challenge_key; month_votes := r.c;
      return next;
      if r.rn = 1 and m < this_m then winners := winners || r.id; end if;   -- 끝난 달의 챌린지별 1위만 확정
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
end $$;
revoke all on function public.challenge_hall(int) from public;
grant execute on function public.challenge_hall(int) to anon, authenticated;

update public.challenges set prize = '챌린지마다 매달 응원을 가장 많이 받은 1명에게 육아용품을 드려요.';
update public.challenges set ends_on = null, announce_on = null where id = 'firststep';

notify pgrst, 'reload schema';
commit;
select id, ends_on, prize from public.challenges order by sort_order;
