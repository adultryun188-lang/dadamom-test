-- =============================================================================
-- 0034_auto_moderation.sql — 사장님이 하나하나 검수하지 않아도 되게 (검수 1단계, 2026-10-27)
--
-- 글·참가작이 들어올 때 서버가 정한다 (0029 의 force_review_on_insert 를 넓힘):
--   커뮤니티 글: 금지어·연락처·링크가 없고, (사진·영상이 없거나 믿을 만한 회원이면) → 바로 공개
--   챌린지 참가작: 믿을 만한 회원이고 메모에 금지어가 없으면 → 바로 공개 (아이 사진이라 새 회원은 검수)
--   그 밖은 지금처럼 검수 대기(pending)
-- 믿을 만한 회원: 공개된 글·참가작이 3개 이상이고, 기각되지 않은 신고를 받은 적이 없는 사람.
-- 신고: 서로 다른 3명이 같은 글·참가작을 신고하면 바로 검수 대기로 내린다 (관리자가 다시 판단).
-- 금지어는 표 mod_words 에 있다. 관리자만 읽고 고칠 수 있다.
-- 2단계(정식 출시 후 회원 100명 이상): 서버 AI 검수를 다시 논의.
-- =============================================================================
begin;

create table if not exists public.mod_words (
  word text primary key,
  kind text not null default 'word' check (kind in ('word', 'regex'))
);
alter table public.mod_words enable row level security;
drop policy if exists mod_words_admin on public.mod_words;
create policy mod_words_admin on public.mod_words for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.mod_words from anon;

insert into public.mod_words (word, kind) values
  -- 욕설
  ('씨발','word'),('시발','word'),('ㅅㅂ','word'),('병신','word'),('ㅂㅅ','word'),('개새','word'),('좆','word'),
  ('존나','word'),('지랄','word'),('미친년','word'),('미친놈','word'),('썅','word'),('꺼져','word'),
  -- 광고·유도
  ('오픈채팅','word'),('오픈톡','word'),('open.kakao','word'),('텔레그램','word'),('카톡아이디','word'),('카톡 아이디','word'),
  ('부업','word'),('재택알바','word'),('고수익','word'),('도박','word'),('불법토토','word'),('카지노','word'),
  ('바카라','word'),('조건만남','word'),('성인방송','word'),('코인 리딩','word'),('리딩방','word'),
  -- 연락처·계좌·링크 (정규식)
  ('01[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}','regex'),
  ('[0-9]{3,6}-[0-9]{2,6}-[0-9]{4,8}','regex'),
  ('https?://','regex'),
  ('www\.','regex')
on conflict (word) do nothing;

-- 글에 금지어·연락처·링크가 있나
create or replace function public.mod_hold_text(t text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(t, '') <> '' and exists (
    select 1 from public.mod_words w
     where (w.kind = 'word'  and position(lower(w.word) in lower(t)) > 0)
        or (w.kind = 'regex' and t ~* w.word));
$$;

-- 믿을 만한 회원인가
create or replace function public.mod_trusted(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select u is not null
    and ((select count(*) from public.community_posts   where owner_id = u and status = 'approved')
       + (select count(*) from public.challenge_entries where owner_id = u and status = 'approved')) >= 3
    and not exists (select 1 from public.reports r where r.target_owner = u and r.status <> 'dismissed');
$$;
revoke all on function public.mod_hold_text(text) from public, anon, authenticated;
revoke all on function public.mod_trusted(uuid)   from public, anon, authenticated;

create or replace function public.force_review_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not coalesce(public.is_admin(), false) then
    new.status := 'pending';
    new.created_at := now();
    if tg_table_name = 'challenge_entries' then
      new.votes := 0;
      if public.mod_trusted(auth.uid()) and not public.mod_hold_text(new.note) then new.status := 'approved'; end if;
    end if;
    if tg_table_name = 'community_posts' then
      new.likes := 0; new.comments := 0;
      if not public.mod_hold_text(new.text)
         and ((new.media_path is null and coalesce(new.media_url, '') = '') or public.mod_trusted(auth.uid())) then
        new.status := 'approved';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.force_review_on_insert() from public, anon, authenticated;

-- 신고 3명 → 검수 대기로 내리기
create or replace function public.mod_report_autohide()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.target_type in ('post', 'entry') and (
       select count(distinct reporter_id) from public.reports
        where target_type = new.target_type and target_id = new.target_id and status = 'open') >= 3 then
    if new.target_type = 'post' then
      update public.community_posts set status = 'pending' where id = new.target_id and status = 'approved';
    else
      update public.challenge_entries set status = 'pending' where id = new.target_id and status = 'approved';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.mod_report_autohide() from public, anon, authenticated;
drop trigger if exists reports_autohide on public.reports;
create trigger reports_autohide after insert on public.reports
  for each row execute function public.mod_report_autohide();

commit;
