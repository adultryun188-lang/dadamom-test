-- =============================================================================
-- 0023_banner_placement.sql  —  배너를 앱 홈에도 (2026-10-23)
--
-- mall_banners 에 '어디에 보일지'를 더한다: brand(브랜드관, 기존 그대로) / home(앱 홈 위 넘기기) / both.
-- 기존 배너는 모두 brand 로 남는다. 읽기·쓰기 정책은 0021 그대로(공개 읽기, 관리자 쓰기).
-- 앱 홈은 home·both 배너가 하나도 없으면 코드에 적어 둔 기본 배너를 보여준다.
-- 적용: 테스트 먼저. 운영은 사장님 승인 후 (SQL Editor).
-- =============================================================================
begin;

alter table public.mall_banners
  add column if not exists placement text not null default 'brand';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mall_banners_placement_check') then
    alter table public.mall_banners
      add constraint mall_banners_placement_check check (placement in ('brand','home','both'));
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
