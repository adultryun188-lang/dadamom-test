-- 0043 매거진 자동 업데이트 (2026-10-28, 사장님: "관련 매거진은 매일 오전 12시에 업데이트해. 없으면 냅둬")
--
-- 매일 0시(한국시간)에 보건복지부 보도자료 RSS 를 DB 가 직접 받아,
-- 제목에 육아 관련 낱말이 있는 새 글만 magazine_items 에 넣는다 (하루 최대 3건, 없으면 아무것도 안 함).
-- 저작권: 제목 + 원문 링크 + 출처 이름만 싣는다. 본문·요약·사진은 가져오지 않는다 (기존 매거진 원칙과 같음).
-- 사장님 컴퓨터가 꺼져 있어도 돈다 (pg_cron + http 확장, DB 안에서 실행).

create extension if not exists http with schema extensions;

alter table public.magazine_items add column if not exists auto boolean not null default false;
comment on column public.magazine_items.auto is '자동 수집(0043)으로 들어온 글이면 true. 관리 화면에서 숨기거나 지울 수 있다.';

create or replace function public.magazine_auto_fetch()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- 제목에 이 낱말이 있어야 육아 소식으로 본다. '돌봄'처럼 넓은 말은 넣지 않는다 (노인 돌봄 등이 섞임)
  kw constant text := '(아동|육아|출산|출생|임신|임산부|난임|보육|어린이집|유치원|부모급여|아동수당|첫만남|영유아|신생아|산후|산모|양육|모유|분유|예방접종|소아|분만|아기|어린이)';
  body text;
  it xml;
  t text; l text; d text;
  pub date;
  n int := 0;
begin
  select content into body
    from extensions.http_get('https://www.mohw.go.kr/rss/board.es?mid=a10503010100&bid=0027');
  if body is null or body = '' then return 0; end if;
  body := regexp_replace(body, '^\s*<\?xml[^>]*\?>', '');   -- 선언문의 encoding 때문에 xml 변환이 실패하지 않게

  for it in select unnest(xpath('/rss/channel/item', xmlparse(document body))) loop
    t := btrim((xpath('/item/title/text()', it))[1]::text);
    l := btrim((xpath('/item/link/text()', it))[1]::text);
    d := btrim((xpath('/item/pubDate/text()', it))[1]::text);
    -- RSS 는 제목을 <![CDATA[ ]]> 로 감싸 온다. 벗기고, xml 글자(&amp; 등)는 되돌린다
    t := regexp_replace(t, '^<!\[CDATA\[(.*)\]\]>$', '\1');
    l := regexp_replace(l, '^<!\[CDATA\[(.*)\]\]>$', '\1');
    t := replace(replace(replace(replace(replace(t, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&');
    l := replace(l, '&amp;', '&');
    continue when t is null or l is null or l !~ '^https://';
    continue when t !~ kw;
    continue when exists (select 1 from public.magazine_items m where m.url = l or m.title = t);
    begin
      pub := (to_timestamp(d, 'Dy, DD Mon YYYY HH24:MI:SS') at time zone 'Asia/Seoul')::date;
    exception when others then
      pub := (now() at time zone 'Asia/Seoul')::date;
    end;
    insert into public.magazine_items (kind, title, summary, source_name, url, published_on, visible, sort_order, auto)
    values ('news', left(t, 200), null, '보건복지부', l, pub, true, 0, true);
    n := n + 1;
    exit when n >= 3;
  end loop;
  return n;
exception when others then
  -- 받아오기 실패(사이트 점검 등)는 조용히 넘긴다: 다음 날 다시 시도. 원인은 cron 기록에 남는다
  raise warning 'magazine_auto_fetch 실패: %', sqlerrm;
  return 0;
end;
$$;

revoke all on function public.magazine_auto_fetch() from public, anon, authenticated;

-- 매일 한국시간 0시 = UTC 15시
select cron.unschedule('magazine-auto-daily') where exists (select 1 from cron.job where jobname = 'magazine-auto-daily');
select cron.schedule('magazine-auto-daily', '0 15 * * *', $$select public.magazine_auto_fetch()$$);
