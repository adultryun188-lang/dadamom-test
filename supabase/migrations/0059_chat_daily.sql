-- 0059 채팅은 하루마다 사라진다 (2026-11-02 사장님). 0057 의 30일 보관을 바꾼다.
--   한국 시간 자정(0시)이 지나면 전날까지의 채팅은 회원에게 안 보이고(읽기 규칙), 매일 0시 5분에 지운다.
--   운영자는 지우기 전까지 신고된 옛 글을 볼 수 있다.
begin;

create or replace function public._chat_today_start()
returns timestamptz language sql stable set search_path = public as $$
  select (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
$$;

drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages for select to authenticated
  using (((not hidden and created_at >= public._chat_today_start()) or (select public.is_admin()))
         and not public.is_blocked(user_id));

create or replace function public._purge_old_chat()
returns void language sql security definer set search_path = public as $$
  delete from public.chat_messages where created_at < public._chat_today_start();
$$;
revoke all on function public._purge_old_chat() from public, anon, authenticated;

-- 운영자 글 표시: 보낼 때 서버가 운영자 계정(admin_emails)인지 보고 직접 단다. 회원은 흉내 낼 수 없다.
alter table public.chat_messages add column if not exists is_master boolean not null default false;

create or replace function public.chat_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nick text;
  last record;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = '42501', hint = '로그인하면 채팅할 수 있어요';
  end if;
  new.user_id := auth.uid();
  new.room := coalesce(new.room, 'all');
  new.hidden := false;
  new.created_at := now();
  new.body := btrim(coalesce(new.body, ''));
  new.is_master := coalesce(public.is_admin(), false);

  select nickname into nick from public.profiles where id = auth.uid();
  new.nickname := left(coalesce(nullif(btrim(nick), ''), '회원'), 30);
  if not new.is_master and public._reserved_name(new.nickname) then new.nickname := '회원'; end if;

  if char_length(new.body) < 1 then
    raise exception 'CHAT_EMPTY' using errcode = 'P0001', hint = '내용을 입력해 주세요';
  end if;
  if char_length(new.body) > 200 then
    raise exception 'CHAT_TOO_LONG' using errcode = 'P0001', hint = '200자까지 보낼 수 있어요';
  end if;
  if public.mod_hold_text(new.body) then
    raise exception 'CHAT_BLOCKED_WORD' using errcode = 'P0001', hint = '욕설·광고·연락처·링크가 들어간 글은 보낼 수 없어요';
  end if;

  perform pg_advisory_xact_lock(hashtext('chat:' || auth.uid()::text));
  select body, created_at into last from public.chat_messages
   where user_id = auth.uid() order by created_at desc limit 1;
  if found then
    if last.created_at > now() - interval '3 seconds' then
      raise exception 'CHAT_TOO_FAST' using errcode = 'P0001', hint = '조금 천천히 보내 주세요 (3초에 한 번)';
    end if;
    if last.body = new.body then
      raise exception 'CHAT_REPEAT' using errcode = 'P0001', hint = '방금 보낸 글과 같은 내용이에요';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.chat_before_insert() from public, anon, authenticated;

select cron.unschedule('chat-purge-daily');
select cron.schedule('chat-purge-daily', '5 15 * * *', 'select public._purge_old_chat()');   -- 매일 00:05 KST

notify pgrst, 'reload schema';
commit;
