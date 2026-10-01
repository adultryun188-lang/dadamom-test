-- =============================================================================
-- 0011_edit_own_content.sql  —  작성자가 자기 글·참가작을 고칠 수 있게
--
-- 배경
--   사장님이 "글 삭제·수정이 없다" 고 알려주셨습니다. 삭제는 만들었고 이건 수정입니다.
--
--   실측해보니 community_posts / challenge_entries 에 **UPDATE 정책이 아예 없습니다.**
--   본인 글도 못 고칩니다. (PostgREST 는 RLS 가 0행으로 막아도 204 를 주므로
--   오류 없이 조용히 실패합니다 — CLAUDE.md 지뢰 목록의 그 항목입니다.)
--
-- 왜 UPDATE 정책을 열지 않고 함수로 하는가
--   이 표에는 status(검수 상태)와 likes/votes/comments(카운터)가 같이 있습니다.
--   행 단위 UPDATE 정책을 열면 **작성자가 자기 글을 스스로 approved 로 바꿀 수**
--   있습니다. 검수가 통째로 무력화됩니다. 컬럼 단위 권한으로 막을 수도 있지만,
--   "고치면 다시 검수 대기로" 라는 규칙까지 서버가 강제하려면 함수가 맞습니다.
--
--   (지금 막혀 있는 것 실측: 자가 승인 ✅차단 · 좋아요 조작 ✅차단 · 남의 글 수정 ✅차단.
--    이 상태를 그대로 유지한 채 '내 본문만' 고치는 길을 하나 냅니다.)
--
-- 고치면 다시 검수 대기가 되는 이유
--   승인된 글을 아무 때나 바꿀 수 있으면, 무해한 글로 승인받고 나중에 내용을
--   갈아끼우는 길이 생깁니다. 아이 사진이 오가는 커뮤니티에서는 특히 위험합니다.
--   그래서 수정하면 status 를 pending 으로 되돌립니다. 작성자 본인에게는 계속
--   보이고(0010 이후 자기 글은 상태와 무관하게 피드에 옵니다) 다른 사람에게만 가려집니다.
--
-- 적용 순서: 0010 다음
-- =============================================================================
begin;

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

commit;

-- =============================================================================
-- 되돌리기
-- =============================================================================
-- drop function if exists public.edit_my_post(uuid, text);
-- drop function if exists public.edit_my_entry(uuid, text);
