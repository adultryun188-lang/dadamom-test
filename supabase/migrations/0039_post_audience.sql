-- 0039: 글 공개 범위에 '회원만' (경쟁 조사 8번 — 부모 75%가 아이 사진 공개를 꺼린 적 있음)
-- audience = 'all'(누구나) | 'members'(로그인한 회원만). 글과 그 글의 사진 모두 서버가 막는다.
-- '가족만'은 가족 공유(0016)가 운영에 들어간 뒤에 붙인다.
begin;
alter table public.community_posts add column if not exists audience text not null default 'all'
  check (audience in ('all', 'members'));

drop policy if exists cp_select on public.community_posts;
create policy cp_select on public.community_posts for select
  using (((status = 'approved' and (audience = 'all' or (select auth.uid()) is not null))
          or owner_id = (select auth.uid()) or (select public.is_admin()))
         and not public.is_blocked(owner_id));

create or replace function public.media_can_read(obj_name text, uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.community_posts
     where media_path = obj_name
       and ((status = 'approved' and (audience = 'all' or uid is not null)) or (uid is not null and owner_id = uid) or public.is_admin())
  ) or exists (
    select 1 from public.challenge_entries
     where media_path = obj_name
       and (status = 'approved' or (uid is not null and owner_id = uid) or public.is_admin())
  );
$function$;

notify pgrst, 'reload schema';
commit;
select audience, count(*) from public.community_posts group by 1;
