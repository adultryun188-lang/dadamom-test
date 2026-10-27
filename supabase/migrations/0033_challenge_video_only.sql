-- 0033: 움직임을 보는 챌린지(첫걸음·배밀이)는 영상만 참가
-- 사진으로는 "혼자 걸었는지"를 판단할 수 없어 심사 기준이 흔들린다. 그래서 서버에서 막는다.
-- 판단은 파일 이름이 아니라 실제로 올라간 파일의 종류(storage.objects 의 mimetype)로 한다.
begin;

alter table public.challenges add column if not exists media_rule text not null default 'any'
  check (media_rule in ('any', 'video'));
update public.challenges set media_rule = 'video' where id in ('firststep', 'crawl');

-- 참가작 파일이 그 챌린지 규칙에 맞는지. 다른 표(storage.objects)를 읽으므로 security definer.
create or replace function public.challenge_media_ok(k text, p text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select media_rule from public.challenges where id = k), 'any') <> 'video' then true
    else p is not null and exists (
      select 1 from storage.objects o
       where o.bucket_id = 'media' and o.name = p
         and o.owner_id = (select auth.uid())::text
         and o.metadata->>'mimetype' in ('video/mp4', 'video/quicktime'))
  end;
$$;
revoke all on function public.challenge_media_ok(text, text) from public, anon;
grant execute on function public.challenge_media_ok(text, text) to authenticated;

drop policy if exists ce_insert on public.challenge_entries;
create policy ce_insert on public.challenge_entries for insert to authenticated
  with check (owner_id = (select auth.uid())
              and public.challenge_open(challenge_key)
              and public.challenge_media_ok(challenge_key, media_path));

-- 안내 문구: 사진도 받는다는 말 빼기
update public.challenges set guide = array[
  '혼자 걷는 모습을 30초 이내 영상으로 올려 주세요 (사진은 받지 않아요)',
  '어른 손을 잡지 않고 한두 걸음이라도 혼자 내딛는 순간이 담겨야 해요',
  '얼굴이 부담되면 발만 나오게 찍어도 돼요'
] where id = 'firststep';
update public.challenges set guide = array[
  '뒤집거나 배밀이로 나아가는 모습을 30초 이내 영상으로 올려 주세요 (사진은 받지 않아요)',
  '어른 손 도움 없이 아이 혼자 움직이는 모습이 담겨야 해요',
  '바닥이 안전한 곳에서 찍어 주세요'
] where id = 'crawl';

notify pgrst, 'reload schema';
commit;
