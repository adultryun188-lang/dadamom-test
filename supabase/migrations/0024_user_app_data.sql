-- =============================================================================
-- 0024_user_app_data.sql  —  내 기록 서버 보관 (2026-10-23 사장님 결정: "전부 서버에 저장")
--
-- 지금까지 기기에만 있던 내 기록을 계정에 보관해 기기를 바꿔도 이어지게 한다.
--   돌봄기록(수유·수면), 키·몸무게, 예방접종 체크, 출산 준비물 체크, 선물 장부(보낸 분·선물·금액),
--   찜한 상품, '나만 보기' 글(글자만, 기기 안 사진 데이터는 빼고)
-- 한 사람에 한 행(data jsonb). 앱이 통째로 올리고 받는다.
-- 본인만 읽고 쓴다(RLS). 다른 사람·비로그인·운영자 화면에서 안 보인다.
-- 회원 탈퇴(delete_my_account → auth.users 삭제) 때 on delete cascade 로 함께 지워진다.
-- 크기 상한 500KB — 앱이 잘못 커진 값을 올리지 못하게.
-- 적용: 테스트 먼저. 운영은 사장님 승인 후 (SQL Editor). 개인정보처리방침·Play 데이터 보안도 함께 바꾼다.
-- =============================================================================
begin;

create table if not exists public.user_app_data (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint user_app_data_size check (octet_length(data::text) <= 512000)
);

-- 시각은 서버가 찍는다 (기기 시계가 틀려도 순서가 맞게)
create or replace function public.user_app_data_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists user_app_data_stamp on public.user_app_data;
create trigger user_app_data_stamp before insert or update on public.user_app_data
  for each row execute function public.user_app_data_stamp();
revoke all on function public.user_app_data_stamp() from public, anon, authenticated;

alter table public.user_app_data enable row level security;

drop policy if exists uad_select on public.user_app_data;
create policy uad_select on public.user_app_data for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists uad_insert on public.user_app_data;
create policy uad_insert on public.user_app_data for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists uad_update on public.user_app_data;
create policy uad_update on public.user_app_data for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists uad_delete on public.user_app_data;
create policy uad_delete on public.user_app_data for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_app_data from anon;
grant select, insert, update, delete on public.user_app_data to authenticated;

notify pgrst, 'reload schema';
commit;
