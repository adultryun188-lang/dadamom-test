-- 0035: 챌린지마다 영상만 또는 사진만 (사장님 결정 2026-10-27 — "영상은 영상, 사진은 사진, 그래야 객관성이 있다")
-- 첫걸음·배밀이 = 영상만 (0033), 할로윈·만삭·볼살 = 사진만. 영상은 30초 → 1분.
-- 서버도 실제 올라간 파일 종류(mimetype)로 막는다.
begin;

alter table public.challenges drop constraint if exists challenges_media_rule_check;
alter table public.challenges add constraint challenges_media_rule_check check (media_rule in ('any', 'video', 'photo'));
alter table public.challenges alter column media_rule set default 'photo';
update public.challenges set media_rule = 'photo' where id in ('halloween', 'bump', 'cheeks');

create or replace function public.challenge_media_ok(k text, p text)
returns boolean language sql stable security definer set search_path = public as $$
  with r as (select coalesce((select media_rule from public.challenges where id = k), 'any') as rule)
  select case
    when (select rule from r) = 'any' then true
    else p is not null and exists (
      select 1 from storage.objects o
       where o.bucket_id = 'media' and o.name = p
         and o.owner_id = (select auth.uid())::text
         and o.metadata->>'mimetype' = any (case (select rule from r)
               when 'video' then array['video/mp4', 'video/quicktime']
               else array['image/jpeg', 'image/png', 'image/webp'] end))
  end;
$$;
revoke all on function public.challenge_media_ok(text, text) from public, anon;
grant execute on function public.challenge_media_ok(text, text) to authenticated;

update public.challenges set guide[1] = '혼자 걷는 모습을 1분 이내 영상으로 올려 주세요 (사진은 받지 않아요)' where id = 'firststep';
update public.challenges set guide[1] = '뒤집거나 배밀이로 나아가는 모습을 1분 이내 영상으로 올려 주세요 (사진은 받지 않아요)' where id = 'crawl';
update public.challenges set guide[1] = '코스튬·모자·소품을 걸친 사진 1장으로 참가해요 (영상은 받지 않아요)' where id = 'halloween';
update public.challenges set guide[1] = '배가 나온 모습 사진 1장으로 참가해요 (옷 위로 찍어도 좋아요)' where id = 'bump';
update public.challenges set guide[1] = '볼살이나 발바닥이 잘 보이는 사진 1장으로 참가해요' where id = 'cheeks';

notify pgrst, 'reload schema';
commit;
select id, media_rule, guide[1] as guide1 from public.challenges order by id;
