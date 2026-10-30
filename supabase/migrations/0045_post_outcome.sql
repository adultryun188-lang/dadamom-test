-- 0045 질문의 '그래서 어떻게 됐어요?' 해결 후기 (2026-10-30, 차별화 전략 ③)
--
-- 질문·고민 글을 쓴 사람이 나중에 '이렇게 해결했어요' 후기를 한 번 남긴다.
-- 같은 개월 수 부모들이 '실제로 통한 방법'을 모아 볼 수 있게 하는 것이 목적.
-- - 글 표에 outcome(후기 글)·outcome_at(남긴 시각) 두 칸.
-- - 쓰기는 set_post_outcome() 로만: 본인 글, [질문]/[고민] 말머리, 5~500자, 링크·전화번호 금지(광고 막기).
--   직접 UPDATE 로는 못 바꾼다 (기존 update 권한은 관리자 정책만 통과).
-- - 후기를 다시 고칠 수 있다(같은 함수). 지우려면 빈 문자열 대신 null 을 넘긴다.

alter table public.community_posts add column if not exists outcome text;
alter table public.community_posts add column if not exists outcome_at timestamptz;
alter table public.community_posts drop constraint if exists community_posts_outcome_len;
alter table public.community_posts add constraint community_posts_outcome_len check (outcome is null or char_length(outcome) between 5 and 500);
create index if not exists community_posts_outcome_idx on public.community_posts (outcome_at desc) where outcome is not null;

create or replace function public.set_post_outcome(p_post uuid, p_outcome text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text := nullif(btrim(coalesce(p_outcome, '')), '');
  body text;
  stamp timestamptz;
begin
  if uid is null then raise exception 'LOGIN_REQUIRED' using errcode = '28000'; end if;
  select text into body from public.community_posts where id = p_post and owner_id = uid;
  if body is null then raise exception 'NOT_FOUND' using errcode = 'P0002', hint = '내 글에만 후기를 남길 수 있어요'; end if;
  if body !~ '^\[(질문|고민)\]' then raise exception 'NOT_QUESTION' using errcode = '22023', hint = '질문·고민 글에만 후기를 남길 수 있어요'; end if;
  if t is not null then
    if char_length(t) < 5 or char_length(t) > 500 then raise exception 'BAD_LENGTH' using errcode = '22023', hint = '5~500자로 적어 주세요'; end if;
    if t ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|kr|co|shop|me|io)\b)' or t ~ '0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}' then
      raise exception 'NO_LINK' using errcode = '22023', hint = '후기에는 링크·전화번호를 넣을 수 없어요';
    end if;
  end if;
  stamp := case when t is null then null else now() end;
  update public.community_posts set outcome = t, outcome_at = stamp where id = p_post and owner_id = uid;
  return stamp;
end;
$$;

revoke all on function public.set_post_outcome(uuid, text) from public, anon;
grant execute on function public.set_post_outcome(uuid, text) to authenticated;
