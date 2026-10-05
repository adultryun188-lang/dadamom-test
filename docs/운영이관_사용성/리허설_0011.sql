-- ════════════════════════════════════════════════════════════════════
--  0011 운영 리허설 — begin ... rollback. 아무것도 남지 않습니다.
--  운영 Supabase(hjqchbpxwviengdzvado) SQL Editor 에 이 파일 전체를 붙여
--  한 번 실행하고, 맨 끝 표 3개 결과를 알려주세요.
--
--  begin;/commit; 은 미리 벗겨 두었습니다. 손으로 고칠 것 없습니다.
--
--  0011 은 함수 2개만 추가하고 기존 표·정책·데이터를 건드리지 않습니다.
--  운영 기준선(0001)의 컬럼만 쓰므로 0005~0010 이 없어도 안전합니다.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────── 0011_edit_own_content.sql 본문 ───────────────────

-- ───────────────────────────── 커뮤니티 글 ──
create or replace function public.edit_my_post(post_id uuid, new_text text)
returns text language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(btrim(new_text), '') = '' then
    raise exception '내용을 입력해주세요' using errcode = '22023';
  end if;
  if length(new_text) > 2000 then
    raise exception '내용이 너무 길어요' using errcode = '22023';
  end if;

  -- 본문만 바꾼다. status 는 서버가 정하고, 카운터·소유자는 건드리지 않는다.
  update public.community_posts
     set text = btrim(new_text),
         status = 'pending'
   where id = post_id
     and owner_id = auth.uid();

  get diagnostics n = row_count;
  if n = 0 then
    raise exception '내 글이 아니에요' using errcode = '42501';
  end if;
  return 'pending';
end $fn$;

revoke all on function public.edit_my_post(uuid, text) from public, anon;
grant execute on function public.edit_my_post(uuid, text) to authenticated;

-- ───────────────────────────── 챌린지 참가작 ──
-- 참가작은 한 줄 기록(note)만 고칠 수 있습니다. 아이 이름·월령은 심사 기준이라
-- 바꾸려면 다시 올리는 쪽이 맞습니다.
create or replace function public.edit_my_entry(entry_id uuid, new_note text)
returns text language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(btrim(new_note), '') = '' then
    raise exception '내용을 입력해주세요' using errcode = '22023';
  end if;
  if length(new_note) > 500 then
    raise exception '내용이 너무 길어요' using errcode = '22023';
  end if;

  update public.challenge_entries
     set note = btrim(new_note),
         status = 'pending'
   where id = entry_id
     and owner_id = auth.uid();

  get diagnostics n = row_count;
  if n = 0 then
    raise exception '내 참가작이 아니에요' using errcode = '42501';
  end if;
  return 'pending';
end $fn$;

revoke all on function public.edit_my_entry(uuid, text) from public, anon;
grant execute on function public.edit_my_entry(uuid, text) to authenticated;

comment on function public.edit_my_post(uuid, text) is
  '본인 글의 본문만 수정. 수정하면 status 가 pending 으로 돌아가 다시 검수를 받는다.';
comment on function public.edit_my_entry(uuid, text) is
  '본인 참가작의 한 줄 기록만 수정. 수정하면 status 가 pending 으로 돌아간다.';

notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════
--  확인 — 표 3개
-- ════════════════════════════════════════════════════════════════════

-- [표 1] 함수가 만들어졌나 — 기대: 2행
--        인자가 'post_id uuid, new_text text' / 'entry_id uuid, new_note text' 여야
--        앱의 sb.rpc 파라미터 이름과 맞습니다 (틀리면 조용히 404 로 실패합니다).
select p.proname                                        as 함수,
       pg_get_function_identity_arguments(p.oid)        as 인자,
       p.prosecdef                                      as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('edit_my_post','edit_my_entry')
 order by p.proname;

-- [표 2] 권한 — 기대: anon = false, authenticated = true (4행)
--        anon 이 true 로 나오면 PUBLIC 상속을 못 끊은 것입니다
--        (CLAUDE.md 지뢰 목록: revoke 를 public 과 같이 해야 합니다).
select p.proname                                            as 함수,
       r.rolname                                            as 역할,
       has_function_privilege(r.rolname, p.oid, 'execute')   as 실행가능
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       (values ('anon'),('authenticated')) as r(rolname)
 where n.nspname = 'public' and p.proname in ('edit_my_post','edit_my_entry')
 order by p.proname, r.rolname;

-- [표 3] 함수가 건드리는 컬럼이 운영에 실제로 있나 — 기대: 네 칸 모두 1
--        plpgsql 본문은 만들 때 검사되지 않아, 리허설이 통과해도
--        실제 호출에서 42P01/42703 으로 터질 수 있습니다.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='community_posts'   and column_name='text')     as cp_text,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='community_posts'   and column_name='status')   as cp_status,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='challenge_entries' and column_name='note')     as ce_note,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='challenge_entries' and column_name='status')   as ce_status;

-- ════════════════════════════════════════════════════════════════════
rollback;
-- ════════════════════════════════════════════════════════════════════
-- 되돌렸습니다. 운영에 남은 변경은 없습니다.
