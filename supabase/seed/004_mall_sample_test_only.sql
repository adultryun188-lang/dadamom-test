-- 브랜드관 화면 확인용 예시 (테스트 DB 전용 — 운영에 넣지 않는다). 2026-10-22 테스트에 적용함.
with b as (
  insert into public.mall_brands (name, intro, store_url, is_new, is_featured, sort_order) values
   ('예시 순한로션', '신생아부터 쓰는 순한 보습 (테스트용 예시 브랜드)', 'https://dadamom.co.kr/', true, true, 1),
   ('예시 맘마키친', '재료 그대로 만든 이유식 (테스트용 예시 브랜드)', 'https://dadamom.co.kr/', true, true, 2),
   ('예시 꼬물놀이', '월령별 감각 장난감 (테스트용 예시 브랜드)', 'https://dadamom.co.kr/', false, true, 3)
  returning id, name)
insert into public.mall_products (brand_id, name, price, sale_price, buy_url, is_deal, deal_until, sort_order)
select b.id, v.pname, v.price, v.sale, 'https://dadamom.co.kr/', v.deal, case when v.deal then current_date + 7 end, v.ord
from b join (values
  ('예시 순한로션', '베이비 보습 로션 300ml', 29000, 17400, true, 1),
  ('예시 순한로션', '베이비 워시 500ml', 18000, null, false, 2),
  ('예시 맘마키친', '중기 이유식 7종 세트', 42000, 33600, true, 1),
  ('예시 맘마키친', '아기 쌀과자 10봉', 12000, null, false, 2),
  ('예시 꼬물놀이', '헝겊 촉감책', 15500, 12400, false, 1),
  ('예시 꼬물놀이', '실리콘 치발기', 9900, null, false, 2)
) as v(bname, pname, price, sale, deal, ord) on v.bname = b.name;
insert into public.mall_banners (title, subtitle, link_url, bg, sort_order) values
 ('다다맘 브랜드관 오픈', '엄마 아빠가 고른 육아템을 한곳에 (테스트 예시)', '#/brand', '#FFE3D6', 1),
 ('이번 주 특가', '기간 한정 할인 상품 모아보기 (테스트 예시)', '#/brand?tab=deal', '#FFF1C9', 2);
