-- 0056 투표 대기 7일 → 카카오·네이버는 바로, 이메일 가입은 다음 날 (2026-11-02 사장님)
--   "문자는 비용이 드니 이거 말고 하루 만에 가입(투표)이 가능하고 보안도 철저하게"
--
-- 1) 카카오·네이버·애플 계정을 연결한 회원은 바로 투표. 세 곳 모두 가입 때 휴대폰 본인 확인을 해서
--    한 사람이 계정을 여러 개 만들기 어렵다. 연결 여부는 auth.users.raw_app_meta_data->'providers'.
-- 2) 그 밖(이메일·구글)은 가입 24시간 뒤부터. 가족 공유로 연결된 가족은 지금처럼 바로(0050).
-- 3) 이메일 하나로 계정 여러 개 만드는 것 막기:
--    a+1@gmail.com, a.b@gmail.com 처럼 같은 메일함으로 가는 주소는 한 사람으로 보고 챌린지마다 한 달에 한 표만.
--    일회용 메일 주소(10분 메일 등)는 투표 불가.
begin;

-- 같은 메일함으로 가는 주소를 하나로 맞춘다. gmail 은 점과 + 뒤를, 다른 곳은 + 뒤만 뗀다.
create or replace function public._mailbox(p_email text)
returns text language sql immutable set search_path = public as $$
  select case
    when split_part(lower(p_email), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(p_email), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(p_email), '@', 1), '+', 1) || '@' || split_part(lower(p_email), '@', 2)
  end;
$$;
revoke all on function public._mailbox(text) from public, anon, authenticated;

-- shortcut: 일회용 메일 도메인은 자주 쓰이는 것만 적었다. 새로 보이면 이 목록에 더한다.
create or replace function public._throwaway_mail(p_email text)
returns boolean language sql immutable set search_path = public as $$
  select split_part(lower(p_email), '@', 2) = any (array[
    'mailinator.com','guerrillamail.com','guerrillamail.net','sharklasers.com','10minutemail.com','10minutemail.net',
    'temp-mail.org','tempmail.com','tempmail.net','yopmail.com','yopmail.net','trashmail.com','getnada.com','nada.email',
    'dispostable.com','maildrop.cc','mohmal.com','throwawaymail.com','fakeinbox.com','mailnesia.com','emailondeck.com',
    'tmpmail.org','tmpmail.net','minuteinbox.com','spam4.me','grr.la','mail.tm','emltmp.com','tmail.ws','byom.de']);
$$;
revoke all on function public._throwaway_mail(text) from public, anon, authenticated;

create or replace function public.cast_ballot(p_entry uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e record;
  u record;
  m text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  verified boolean;
begin
  if uid is null then raise exception 'LOGIN_REQUIRED' using errcode = '42501'; end if;
  select id, owner_id, challenge_key into e from public.challenge_entries
   where id = p_entry and status = 'approved' and not public.is_blocked(owner_id);
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if e.owner_id = uid then raise exception 'OWN_ENTRY' using errcode = 'P0001', hint = '내 참가작에는 투표할 수 없어요'; end if;

  -- 이미 넣은 표를 다시 누르면 취소 (취소는 조건 없이)
  if exists (select 1 from public.entry_ballots b where b.voter_id = uid and b.challenge_key = e.challenge_key and b.month = m and b.entry_id = p_entry) then
    delete from public.entry_ballots b where b.voter_id = uid and b.challenge_key = e.challenge_key and b.month = m;
    return 'removed';
  end if;

  select x.created_at, coalesce(x.email, '') as email,
         coalesce(x.raw_app_meta_data->'providers', '[]'::jsonb) ?| array['kakao', 'custom:naver', 'apple'] as social
    into u from auth.users x where x.id = uid;
  verified := u.social or public._same_family(uid, e.owner_id);

  if not verified then
    if public._throwaway_mail(u.email) then
      raise exception 'THROWAWAY_MAIL' using errcode = 'P0001', hint = '일회용 메일로 가입한 계정은 투표할 수 없어요';
    end if;
    if u.created_at > now() - interval '1 day' then
      raise exception 'NEW_ACCOUNT' using errcode = 'P0001', hint = '이메일로 가입한 분은 가입 다음 날부터 투표할 수 있어요';
    end if;
    -- 같은 메일함의 다른 계정이 이 챌린지에 이달 이미 투표했으면 막는다
    if u.email <> '' and exists (
      select 1 from public.entry_ballots b join auth.users o on o.id = b.voter_id
       where b.challenge_key = e.challenge_key and b.month = m and b.voter_id <> uid
         and o.email is not null and public._mailbox(o.email) = public._mailbox(u.email)) then
      raise exception 'SAME_MAILBOX' using errcode = 'P0001', hint = '같은 메일 주소로 만든 다른 계정이 이미 투표했어요';
    end if;
  end if;

  insert into public.entry_ballots (voter_id, challenge_key, month, entry_id) values (uid, e.challenge_key, m, p_entry)
    on conflict (voter_id, challenge_key, month) do update set entry_id = excluded.entry_id, created_at = now();
  return 'voted';
end $$;
revoke all on function public.cast_ballot(uuid) from public, anon;
grant execute on function public.cast_ballot(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
