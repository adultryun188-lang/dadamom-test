-- =============================================================================
-- 0015_signup_from_last_seen.sql  —  홍보 효과 측정용 최소 기록 두 가지
--
-- 배경
--   앱에 분석 도구가 없고(플레이스토어 데이터 보안 설문에도 '분석 도구 없음'),
--   GA 대신 가장 가벼운 방식으로 두 가지만 남긴다.
--     · signup_from : 처음 들어온 주소의 ?from= 값 (시설별 QR 구분). 없으면 null.
--     · last_seen   : 마지막으로 앱을 연 날짜 (하루 단위, 시각은 남기지 않는다)
--   지표: 채널별 가입 수, 가입 후 7일 안에 다시 온 비율 → docs/홍보_측정.md
--
-- 규칙
--   · signup_from 은 프로필이 처음 만들어질 때만 들어간다. 앱의 프로필 저장은
--     upsert 라 매번 값을 보내므로, 수정(UPDATE) 때는 트리거가 옛 값으로 되돌린다.
--     (기존 회원이 나중에 QR 로 들어와도 가입 경로가 바뀌지 않는다)
--   · last_seen 은 기존 행을 null 로 둔다 — 기본값을 add column 에 붙이면
--     기존 회원 전부가 '오늘 접속'으로 채워진다. 새 행만 가입일(한국 날짜)로 시작.
--   · 권한은 그대로: pf_update 가 본인 행만 고치게 한다. anon 은 권한 없음.
--
-- 추가만 하는 변경. 적용 순서: 0014 다음. DB 가 코드보다 먼저다 —
--   새 코드가 signup_from 을 보내는데 컬럼이 없으면 프로필 저장이 실패한다.
-- 적용: 테스트(srxdtddrtnhtlbbviyvs)·운영 2026-10-16 (각각 begin…rollback 리허설 후)
-- =============================================================================
begin;

alter table public.profiles
  add column if not exists signup_from text
    constraint profiles_signup_from_chk check (signup_from ~ '^[A-Za-z0-9-]{1,32}$'),
  add column if not exists last_seen date;

alter table public.profiles
  alter column last_seen set default (now() at time zone 'Asia/Seoul')::date;

create or replace function public.keep_signup_from()
returns trigger language plpgsql set search_path = public as $fn$
begin new.signup_from := old.signup_from; return new; end $fn$;

drop trigger if exists profiles_keep_signup_from on public.profiles;
create trigger profiles_keep_signup_from before update of signup_from on public.profiles
  for each row execute function public.keep_signup_from();

comment on column public.profiles.signup_from is '가입 경로(?from=). 처음 만들 때만 저장, 이후 고정';
comment on column public.profiles.last_seen   is '마지막 접속일(한국 날짜). 앱이 하루 한 번 갱신';

notify pgrst, 'reload schema';
commit;

-- 확인
-- select column_name, column_default from information_schema.columns
--  where table_name='profiles' and column_name in ('signup_from','last_seen');   -- 2행

-- 되돌리기
-- begin;
-- drop trigger if exists profiles_keep_signup_from on public.profiles;
-- drop function if exists public.keep_signup_from();
-- alter table public.profiles drop column if exists signup_from, drop column if exists last_seen;
-- notify pgrst, 'reload schema';
-- commit;
