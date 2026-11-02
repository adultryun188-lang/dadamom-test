-- 0057 앱 전용 실시간 채팅 (docs/실시간채팅_앱전용_지시서_2026-11-02.md)
--   들어와 있는 사람끼리 짧은 글을 주고받는 공개 방 하나. 화면은 앱(index.html, Capacitor)에서만 연다.
--   기존 것을 그대로 쓴다: mod_hold_text(금지어·연락처·링크), reports(+'chat'), is_blocked, is_admin, pg_cron.
--
-- 1) chat_messages: id 는 클라이언트가 만든다(INSERT ... RETURNING 지뢰). user_id·nickname 은 서버가 채운다.
-- 2) 보내기 전 검사(트리거): 1~200자, 금지어 → 거절(채팅은 검수 대기가 없다), 3초 안 연속·직전과 같은 내용 → 거절.
--    거절 이유는 hint 로 돌려준다(화면이 그대로 보여 준다).
-- 3) RLS: 읽기 = 로그인 + 숨김 아님(관리자는 다 봄) + 내가 차단한 사람 아님. 쓰기 = 로그인 본인. 고치기·지우기 = 관리자만.
-- 4) 실시간: supabase_realtime 에 표를 넣는다. postgres_changes 는 읽기 RLS 를 그대로 따른다.
-- 5) 신고: reports.target_type 에 'chat'. 서로 다른 3명이 신고하면 hidden = true.
-- 6) 보관: 30일 지난 채팅은 매일 지운다(pg_cron).
begin;

create table if not exists public.chat_messages (
  id         uuid primary key,
  room       text not null default 'all' check (room in ('all')),   -- 지금은 방 하나. 나중에 출산 예정월·지역별 방을 열 때 넓힌다
  user_id    uuid references auth.users(id) on delete cascade,
  nickname   text not null default '회원' check (char_length(nickname) <= 30),
  body       text not null check (char_length(body) between 1 and 200),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_time_idx on public.chat_messages (room, created_at desc);
create index if not exists chat_messages_user_time_idx on public.chat_messages (user_id, created_at desc);

-- 보내기 전 검사 + 작성자 채우기 (0055 stamp_author_on_insert 와 같은 방식)
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

  select nickname into nick from public.profiles where id = auth.uid();
  new.nickname := left(coalesce(nullif(btrim(nick), ''), '회원'), 30);
  if not coalesce(public.is_admin(), false) and public._reserved_name(new.nickname) then new.nickname := '회원'; end if;

  if char_length(new.body) < 1 then
    raise exception 'CHAT_EMPTY' using errcode = 'P0001', hint = '내용을 입력해 주세요';
  end if;
  if char_length(new.body) > 200 then
    raise exception 'CHAT_TOO_LONG' using errcode = 'P0001', hint = '200자까지 보낼 수 있어요';
  end if;
  if public.mod_hold_text(new.body) then
    raise exception 'CHAT_BLOCKED_WORD' using errcode = 'P0001', hint = '욕설·광고·연락처·링크가 들어간 글은 보낼 수 없어요';
  end if;

  -- 같은 사람이 동시에 두 번 보내도 한 번씩 차례로 검사한다
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
drop trigger if exists chat_messages_before_insert on public.chat_messages;
create trigger chat_messages_before_insert before insert on public.chat_messages
  for each row execute function public.chat_before_insert();

-- RLS (다른 표는 is_blocked·is_admin 같은 security definer 함수로만 읽는다 — CLAUDE.md 4절)
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon;
grant select, insert on public.chat_messages to authenticated;
grant update, delete on public.chat_messages to authenticated;   -- 실제로는 아래 정책이 관리자만 허용

drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages for select to authenticated
  using ((not hidden or (select public.is_admin())) and not public.is_blocked(user_id));

drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists chat_update_admin on public.chat_messages;
create policy chat_update_admin on public.chat_messages for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists chat_delete_admin on public.chat_messages;
create policy chat_delete_admin on public.chat_messages for delete to authenticated
  using ((select public.is_admin()));

-- 실시간
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- 신고: 'chat' 추가, 3명이면 숨김
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('post', 'comment', 'entry', 'chat'));

create or replace function public.mod_report_autohide()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.target_type in ('post', 'entry', 'chat') and (
       select count(distinct reporter_id) from public.reports
        where target_type = new.target_type and target_id = new.target_id and status = 'open') >= 3 then
    if new.target_type = 'post' then
      update public.community_posts set status = 'pending' where id = new.target_id and status = 'approved';
    elsif new.target_type = 'entry' then
      update public.challenge_entries set status = 'pending' where id = new.target_id and status = 'approved';
    else
      update public.chat_messages set hidden = true where id = new.target_id and not hidden;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.mod_report_autohide() from public, anon, authenticated;

-- 보관 30일
create or replace function public._purge_old_chat()
returns void language sql security definer set search_path = public as $$
  delete from public.chat_messages where created_at < now() - interval '30 days';
$$;
revoke all on function public._purge_old_chat() from public, anon, authenticated;
select cron.schedule('chat-purge-daily', '20 18 * * *', 'select public._purge_old_chat()');   -- 매일 03:20 KST

notify pgrst, 'reload schema';
commit;
