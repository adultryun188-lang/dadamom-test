-- 0046 휴대폰 푸시 알림 받을 기기 (2026-10-30, 차별화 ③ 재방문)
--
-- 앱(안드로이드 1.1.2~, Firebase)·웹(브라우저 알림)이 알림 받을 주소(token)를 저장한다.
-- 알림 보내기는 Edge Function(send-push, 서비스 계정 키는 Supabase 비밀값)이 이 표를 읽어서 한다 — 다음 단계.
-- - 본인 것만 넣고·읽고·지운다 (RLS). 토큰 하나는 한 사람만 (같은 폰을 다른 계정이 쓰면 넘어간다).
-- - 알림 종류별 끄기: prefs jsonb ({"ask":true,"comment":true,"cheer":true}) — 기본 모두 켬.
-- - 탈퇴하면 cascade 로 지워진다.

create table if not exists public.push_tokens (
  token      text primary key check (char_length(token) between 20 and 4096),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  platform   text not null check (platform in ('android','ios','web')),
  prefs      jsonb not null default '{"ask":true,"comment":true,"cheer":true}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

drop policy if exists pt_select on public.push_tokens;
drop policy if exists pt_insert on public.push_tokens;
drop policy if exists pt_update on public.push_tokens;
drop policy if exists pt_delete on public.push_tokens;
create policy pt_select on public.push_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy pt_insert on public.push_tokens for insert to authenticated with check (user_id = (select auth.uid()));
create policy pt_update on public.push_tokens for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy pt_delete on public.push_tokens for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_tokens from anon;
grant select, insert, update, delete on public.push_tokens to authenticated;

-- 같은 기기(토큰)를 다른 계정이 로그인해 쓰면 그 계정으로 옮긴다. upsert 가 남의 행을 못 건드리므로 함수로.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode = '28000'; end if;
  if p_platform not in ('android','ios','web') then raise exception 'BAD_PLATFORM' using errcode = '22023'; end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
