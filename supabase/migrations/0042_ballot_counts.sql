-- 0042: 참가작마다 이번 달 투표 수 보이기 (사장님 2026-10-27 "투표 수도 참가작마다 보이게 해줘")
-- entry_ballots 는 내 표만 읽히므로, 이번 달(한국 시간) 참가작별 표 수만 돌려주는 함수를 둔다. 누가 투표했는지는 안 보인다.
-- 회원만 (0041 과 같이 챌린지는 로그인해야 보임).
begin;

create or replace function public.entry_ballot_counts()
returns table (entry_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select b.entry_id, count(*)::int
    from public.entry_ballots b
   where auth.uid() is not null
     and b.month = to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')
   group by b.entry_id;
$$;
revoke all on function public.entry_ballot_counts() from public, anon;
grant execute on function public.entry_ballot_counts() to authenticated;

notify pgrst, 'reload schema';
commit;
