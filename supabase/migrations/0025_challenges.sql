-- =============================================================================
-- 0025_challenges.sql — 챌린지 여러 개 (2026-10-26 사장님: "챌린지를 더 활성화", 3개로 시작, 경품은 한 달에 한 명)
--
-- 지금까지 챌린지는 코드에 박힌 '첫걸음' 하나였다. 운영자가 관리 화면에서 챌린지를 만들고
-- 앱·웹이 그 목록을 그대로 보여주게 한다. 참가작에는 어느 챌린지 것인지(challenge_key)를 남긴다.
-- 기존 참가작은 모두 'firststep'.
-- 참가는 공개(visible)이고 마감 전인 챌린지에만 된다 (서버가 막는다).
-- 적용: 테스트 먼저. 운영은 사장님 SQL Editor.
-- =============================================================================
begin;

create table if not exists public.challenges (
  id           text primary key check (id ~ '^[a-z0-9_-]{2,32}$'),
  title        text not null check (char_length(title) between 1 and 40),
  emoji        text not null default '🏆' check (char_length(emoji) <= 8),
  description  text not null default '' check (char_length(description) <= 300),
  guide        text[] not null default '{}',
  placeholder  text not null default '' check (char_length(placeholder) <= 80),
  target_label text not null default '전체' check (char_length(target_label) <= 30),
  stage        text not null default 'all' check (stage in ('all', 'pregnant', 'parenting')),
  age_min_m    int check (age_min_m is null or age_min_m between 0 and 120),
  age_max_m    int check (age_max_m is null or age_max_m between 0 and 120),
  ends_on      date,                 -- 비우면 상시
  announce_on  date,
  prize        text not null default '' check (char_length(prize) <= 200),
  visible      boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.challenges enable row level security;
drop policy if exists challenges_read on public.challenges;
create policy challenges_read on public.challenges for select
  using (visible or (select public.is_admin()));
drop policy if exists challenges_admin_write on public.challenges;
create policy challenges_admin_write on public.challenges for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.challenges from anon, authenticated;
grant select on public.challenges to anon, authenticated;
grant insert, update, delete on public.challenges to authenticated;

-- 처음 넷: 진행 중이던 첫걸음(약속한 경품 그대로) + 새 셋(경품은 모든 챌린지를 합쳐 한 달에 한 명)
insert into public.challenges (id, title, emoji, description, guide, placeholder, target_label, stage, age_min_m, age_max_m, ends_on, announce_on, prize, sort_order) values
 ('firststep', '첫걸음 챌린지', '👣', '걸음마 사진 한 장과 짧은 메모로 참여해요. 10~24개월 아이가 대상이에요.',
  array['걷는 모습이 담긴 사진 1장', '아직 걷지 못해도 걸음을 시도하는 모습이면 됩니다', '아이 얼굴이 부담되면 뒷모습이나 발만 담아도 돼요'],
  '예: 오늘 처음으로 세 발짝 걸었어요!', '10~24개월', 'parenting', 10, 24, '2026-11-30', '2026-12-03',
  '참가하면 추첨으로 4명에게 2만 원 상당 육아용품을 드려요.', 10),
 ('halloween', '할로윈 코스튬 챌린지', '🎃', '우리 아이 할로윈 변신! 코스튬이나 소품 사진 한 장으로 참여해요.',
  array['코스튬·모자·소품을 걸친 사진 1장', '집에 있는 옷이나 담요로 꾸며도 좋아요', '얼굴이 부담되면 소품이나 뒷모습만 담아도 돼요'],
  '예: 호박 모자 쓰고 한참 웃었어요 🎃', '전체', 'parenting', null, null, '2026-11-09', null,
  '매달 모든 챌린지에서 응원을 가장 많이 받은 1명에게 육아용품을 드려요.', 20),
 ('crawl', '뒤집기·배밀이 대회', '🐛', '처음 뒤집은 날, 처음 앞으로 나아간 날! 그 순간을 사진 한 장으로 남겨요.',
  array['뒤집거나 배밀이하는 모습 사진 1장', '아직이면 엎드려 고개 드는 모습도 좋아요', '바닥이 안전한 곳에서 찍어 주세요'],
  '예: 오늘 처음으로 장난감까지 배밀이로 갔어요!', '4~10개월', 'parenting', 4, 10, null, null,
  '매달 모든 챌린지에서 응원을 가장 많이 받은 1명에게 육아용품을 드려요.', 30),
 ('cheeks', '포동포동 볼살 자랑', '🍑', '말랑말랑 볼살, 꼬물꼬물 발바닥! 우리 아이 귀여운 순간을 자랑해요.',
  array['볼살이나 발바닥이 잘 보이는 사진 1장', '몸무게·키 비교가 아니라 귀여움 자랑이에요', '얼굴이 부담되면 손·발만 담아도 돼요'],
  '예: 볼이 찹쌀떡 같아요 🍑', '전체', 'parenting', null, null, null, null,
  '매달 모든 챌린지에서 응원을 가장 많이 받은 1명에게 육아용품을 드려요.', 40)
on conflict (id) do nothing;

-- 참가작에 챌린지 표시. 기존 것은 모두 첫걸음.
alter table public.challenge_entries add column if not exists challenge_key text not null default 'firststep'
  references public.challenges(id) on update cascade;
create index if not exists challenge_entries_key_status_idx on public.challenge_entries (challenge_key, status, created_at desc);

-- 열려 있는(공개 + 마감 전) 챌린지에만 참가. 다른 표를 정책에서 직접 읽지 않게 security definer 로 감싼다.
create or replace function public.challenge_open(k text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.challenges c
                 where c.id = k and c.visible and (c.ends_on is null or c.ends_on >= (now() at time zone 'Asia/Seoul')::date));
$$;
revoke all on function public.challenge_open(text) from public, anon;
grant execute on function public.challenge_open(text) to authenticated;

drop policy if exists ce_insert on public.challenge_entries;
create policy ce_insert on public.challenge_entries for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.challenge_open(challenge_key));

notify pgrst, 'reload schema';
commit;
