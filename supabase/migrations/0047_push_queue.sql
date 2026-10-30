-- 0047 푸시 알림 보낼 목록 + 자동 발송 (2026-10-30, 차별화 ③ 재방문 2단계)
--
-- 흐름: 일이 생기면 push_queue 에 한 줄 쌓는다 → 2분마다 pg_cron 이 Edge Function send-push 를 부른다
--       → 함수가 push_tokens 를 읽어 Firebase 로 보내고 sent_at 을 채운다.
-- 알림 세 가지 (push_tokens.prefs 키와 같다)
--   comment : 내 글에 다른 사람이 댓글을 달았을 때
--   cheer   : 내 챌린지 참가작에 응원이 왔을 때 (안 보낸 알림이 이미 있으면 더 쌓지 않는다 — 폭탄 방지)
--   ask     : [질문]/[고민] 글을 쓴 지 7일 됐는데 '그 후 이야기'가 없을 때 (매일 오전 11시, 한 번만)
-- 이 표는 서버(서비스 키)만 읽고 쓴다. 일반 사용자는 못 본다.
--
-- 환경마다 한 번: vault 에 send-push 주소와 anon 키를 넣는다 (anon 키는 공개값).
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_fn_url');
--   select vault.create_secret('<anon key>', 'push_fn_anon');

create extension if not exists pg_net;

create table if not exists public.push_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('ask','comment','cheer')),
  title      text not null,
  body       text not null,
  link       text not null default '#home',
  ref_id     uuid,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists push_queue_unsent_idx on public.push_queue (id) where sent_at is null;
create unique index if not exists push_queue_ask_once on public.push_queue (ref_id) where kind = 'ask';
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- 댓글 → 글쓴이
create or replace function public.push_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select owner_id into owner from public.community_posts where id = new.post_id;
  if owner is not null and owner is distinct from new.owner_id then
    insert into public.push_queue (user_id, kind, title, body, link, ref_id)
    values (owner, 'comment', '내 글에 새 댓글', '다른 엄마 아빠가 댓글을 남겼어요. 확인해 보세요.', '#community', new.post_id);
  end if;
  return null;
end; $$;
drop trigger if exists push_on_comment on public.post_comments;
create trigger push_on_comment after insert on public.post_comments for each row execute function public.push_on_comment();

-- 응원 → 참가작 주인 (안 보낸 게 있으면 건너뜀)
create or replace function public.push_on_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select owner_id into owner from public.challenge_entries where id = new.entry_id;
  if owner is not null and owner is distinct from new.voter_id
     and not exists (select 1 from public.push_queue where ref_id = new.entry_id and kind = 'cheer' and sent_at is null) then
    insert into public.push_queue (user_id, kind, title, body, link, ref_id)
    values (owner, 'cheer', '내 참가작에 응원이 왔어요', '누군가 내 챌린지 참가작을 응원했어요.', '#challenge', new.entry_id);
  end if;
  return null;
end; $$;
drop trigger if exists push_on_vote on public.entry_votes;
create trigger push_on_vote after insert on public.entry_votes for each row execute function public.push_on_vote();

-- 7일 지난 질문 → '그 후 이야기' 부탁 (글마다 한 번: push_queue_ask_once)
create or replace function public.push_enqueue_ask()
returns void language sql security definer set search_path = public as $$
  insert into public.push_queue (user_id, kind, title, body, link, ref_id)
  select p.owner_id, 'ask', '그때 고민, 어떻게 됐어요?', '일주일 전 질문의 그 후 이야기를 남겨 주면 같은 고민인 분들께 큰 도움이 돼요.', '#community', p.id
  from public.community_posts p
  where p.owner_id is not null and p.outcome is null
    and p.text ~ '^\[(질문|고민)\]'
    and p.created_at between now() - interval '8 days' and now() - interval '7 days'
  on conflict do nothing;
$$;

revoke all on function public.push_on_comment(), public.push_on_vote(), public.push_enqueue_ask() from public, anon, authenticated;

-- send-push 부르기 (vault 에 주소가 없으면 아무것도 안 한다)
create or replace function public.push_kick()
returns void language plpgsql security definer set search_path = public as $$
declare u text; k text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'push_fn_url';
  select decrypted_secret into k from vault.decrypted_secrets where name = 'push_fn_anon';
  if u is null or k is null then return; end if;
  if not exists (select 1 from public.push_queue where sent_at is null) then return; end if;
  perform net.http_post(url := u, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || k), body := '{}'::jsonb);
end; $$;
revoke all on function public.push_kick() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('push-kick','push-ask');
select cron.schedule('push-kick', '*/2 * * * *', 'select public.push_kick()');
select cron.schedule('push-ask', '0 2 * * *', 'select public.push_enqueue_ask()');   -- 매일 11:00 KST
