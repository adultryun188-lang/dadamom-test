-- 0055 레드팀 점검(docs/보안점검_레드팀_2026-11-02.md) 고치기
-- 1) [높음] 글·댓글 작성자 이름(author)을 아무거나 넣을 수 있었다 → '운영자' 사칭 글이 바로 공개됐다.
--    넣을 때 서버가 내 프로필 닉네임으로 덮어쓴다. 닉네임 자체에도 운영자·관리자·다다맘 같은 말은 못 쓴다(운영자 본인 제외).
-- 2) [중간] 글 본문 길이 상한이 없었다 → 2000자 (화면은 500자).
-- 3) [낮음] '그 후 이야기'를 글 넣을 때 같이 넣으면 링크·전화 검사를 건너뛰었다 → 넣을 때는 비운다(후기는 set_post_outcome 으로만).
-- 4) [낮음] 내 참가작에 내가 응원할 수 있었다 → 막는다.
begin;

-- 운영자인 척하는 이름
create or replace function public._reserved_name(n text)
returns boolean language sql immutable as $$
  select coalesce(n, '') ~* '(운영자|관리자|운영진|다다맘|다다란|admin)';
$$;

-- 1) 글·댓글 작성자 = 내 닉네임, 3) 글 넣을 때 후기는 비움
create or replace function public.stamp_author_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare nick text;
begin
  if coalesce(auth.role(), '') = 'authenticated' and not coalesce(public.is_admin(), false) then
    select nickname into nick from public.profiles where id = auth.uid();
    new.author := left(coalesce(nullif(btrim(nick), ''), '회원'), 30);
    if public._reserved_name(new.author) then new.author := '회원'; end if;
    if tg_table_name = 'community_posts' then new.outcome := null; new.outcome_at := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists community_posts_stamp_author on public.community_posts;
create trigger community_posts_stamp_author before insert on public.community_posts for each row execute function public.stamp_author_on_insert();
drop trigger if exists post_comments_stamp_author on public.post_comments;
create trigger post_comments_stamp_author before insert on public.post_comments for each row execute function public.stamp_author_on_insert();

-- 닉네임에 운영자 사칭 말 금지 (운영자 본인은 괜찮음)
create or replace function public.guard_profile_nickname()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not coalesce(public.is_admin(), false)
     and public._reserved_name(new.nickname)
     and (tg_op = 'INSERT' or new.nickname is distinct from old.nickname) then
    raise exception 'RESERVED_NAME' using errcode = '22023', hint = '운영자·관리자·다다맘 같은 이름은 쓸 수 없어요';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_nickname on public.profiles;
create trigger profiles_guard_nickname before insert or update of nickname on public.profiles for each row execute function public.guard_profile_nickname();

-- 2) 글 본문 길이
alter table public.community_posts add constraint cp_text_len check (char_length(text) <= 2000) not valid;

-- 4) 내 참가작에는 응원 못 함 (다른 표를 참조하므로 security definer 로 감싼다 — CLAUDE.md 4절)
create or replace function public._owns_entry(p_entry uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.challenge_entries where id = p_entry and owner_id = auth.uid());
$$;
revoke all on function public._owns_entry(uuid) from public, anon;
grant execute on function public._owns_entry(uuid) to authenticated;
drop policy if exists ev_insert on public.entry_votes;
create policy ev_insert on public.entry_votes for insert to authenticated
  with check (voter_id = (select auth.uid()) and not public._owns_entry(entry_id));

commit;
