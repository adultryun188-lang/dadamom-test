-- =============================================================================
-- 0021_brand_mall.sql  —  브랜드관 1단계 (2026-10-22 사장님 결정)
--
-- 다다맘 안에서 결제하지 않는다. 브랜드·상품·배너를 보여주고 "구매하기"는 브랜드 스토어로 보낸다.
-- 나들이(outings)와 같은 구조: 누구나 보이는 것만 읽고, 등록·수정·삭제는 관리자(is_admin)만.
--   · mall_brands    브랜드 (로고, 소개, 신규·추천 표시, 브랜드 스토어 주소)
--   · mall_products  상품 (사진, 정가, 할인가, 구매 링크, 특가 마감일)
--   · mall_banners   맨 위 기획전 배너 (기간이 있으면 그 기간에만)
--   · storage 'mall' 버킷: 로고·상품·배너 그림. 공개 읽기(가게 진열용 그림이라 서명 URL 불필요), 쓰기는 관리자만.
-- 숨김(visible=false)인 것은 관리자에게만 보인다 — 등록해 두고 나중에 공개할 수 있게.
-- 링크는 https 만 받는다 (앱이 javascript: 같은 주소를 열지 않게).
-- 적용: 테스트 먼저. 운영은 사장님 승인 후.
-- =============================================================================
begin;

create table if not exists public.mall_brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  logo_url    text check (logo_url is null or logo_url ~ '^https://'),
  intro       text check (intro is null or char_length(intro) <= 300),
  store_url   text check (store_url is null or store_url ~ '^https://'),
  is_new      boolean not null default false,
  is_featured boolean not null default false,
  visible     boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.mall_products (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.mall_brands(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  image_url   text check (image_url is null or image_url ~ '^https://'),
  price       int  check (price is null or price >= 0),
  sale_price  int  check (sale_price is null or sale_price >= 0),
  buy_url     text not null check (buy_url ~ '^https://'),
  is_deal     boolean not null default false,
  deal_until  date,
  visible     boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists mall_products_brand_idx on public.mall_products (brand_id, sort_order);

create table if not exists public.mall_banners (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 40),
  subtitle    text check (subtitle is null or char_length(subtitle) <= 80),
  image_url   text check (image_url is null or image_url ~ '^https://'),
  link_url    text check (link_url is null or link_url ~ '^(https://|#/)'),
  bg          text check (bg is null or bg ~ '^#[0-9A-Fa-f]{6}$'),
  starts_on   date,
  ends_on     date,
  visible     boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.mall_brands   enable row level security;
alter table public.mall_products enable row level security;
alter table public.mall_banners  enable row level security;

-- 읽기: 보이는 것만, 관리자는 전부. 상품은 브랜드도 보여야 한다.
drop policy if exists mb_select on public.mall_brands;
create policy mb_select on public.mall_brands for select
  using (visible or (select public.is_admin()));
drop policy if exists mp_select on public.mall_products;
create policy mp_select on public.mall_products for select
  using ((visible and exists (select 1 from public.mall_brands b where b.id = brand_id and b.visible)) or (select public.is_admin()));
drop policy if exists mn_select on public.mall_banners;
create policy mn_select on public.mall_banners for select
  using ((visible and (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date)) or (select public.is_admin()));

-- 쓰기: 관리자만
do $$ declare t text; begin
  foreach t in array array['mall_brands','mall_products','mall_banners'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_write', t);
  end loop;
end $$;

grant select on public.mall_brands, public.mall_products, public.mall_banners to anon, authenticated;
grant insert, update, delete on public.mall_brands, public.mall_products, public.mall_banners to authenticated;

-- 그림 저장소: 공개 읽기, 관리자만 올리기·지우기. 그림만, 5MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mall', 'mall', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "mall admin upload" on storage.objects;
create policy "mall admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'mall' and (select public.is_admin()));
drop policy if exists "mall admin delete" on storage.objects;
create policy "mall admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'mall' and (select public.is_admin()));

notify pgrst, 'reload schema';
commit;
