-- ════════════════════════════════════════════════════════════════════
--  운영 SQL 마무리 — 이 파일 하나를 통째로 붙여넣고 Run 한 번
--
--  어디서:  Supabase → adultryun188-lang's Project (주소창 hjqchbpxwviengdzvado)
--           → SQL Editor
--
--  하는 일 (한 트랜잭션):
--    1) 0012  — 가입 동의 종류 4개(signup_*) 를 동의 원장에 허용
--    2) P0-05 단계 C — 체험단 본문 표의 contact·address 컬럼 삭제
--                      (개인정보는 이미 분리 표로 옮겨져 있음)
--
--  안전장치 — 아래 경우엔 빨간 오류가 나고 **아무것도 바뀌지 않습니다**:
--    · 운영 DB 가 아닐 때 (테스트 DB 에서 실수로 돌린 경우)
--    · 분리 표로 안 옮겨진 개인정보가 하나라도 남아 있을 때
--
--  화면에는 맨 마지막 결과 한 줄만 나옵니다:
--    가입동의종류 = true · 남은개인정보컬럼 = 0  이면 끝.
--
--  작성: 클라우드 세션 2026-10-06. 0012 본문은 supabase/migrations/0012 와 동일,
--  단계 C 는 docs/운영이관_P0-05/C_컬럼삭제.sql 과 동일.
-- ════════════════════════════════════════════════════════════════════

begin;

-- 0) 운영 DB 인지 확인
--    테스트 DB 에는 P0-03 의 entry_votes 가 있고 운영에는 없습니다.
--    운영에는 P0-05 단계 A 로 consent_records 가 있어야 합니다.
do $where$
begin
  if to_regclass('public.entry_votes') is not null then
    raise exception '중단: 테스트 DB 입니다. adultryun188-lang''s Project 에서 실행하세요.'
      using errcode = '42501';
  end if;
  if to_regclass('public.consent_records') is null
     or to_regclass('public.benefit_applications_pii') is null then
    raise exception '중단: P0-05 단계 A 가 안 된 DB 입니다.'
      using errcode = '42501';
  end if;
end $where$;

-- 1) 0012 — 가입 시점 동의 종류
alter table public.consent_records
  drop constraint if exists consent_records_kind_chk;

alter table public.consent_records
  add constraint consent_records_kind_chk check (kind in (
    'signup_terms', 'signup_privacy', 'signup_age14', 'signup_marketing',
    'trial_shipping', 'trial_brand_use',
    'entry_photo', 'entry_brand_use', 'post_visibility'
  ));

comment on constraint consent_records_kind_chk on public.consent_records is
  'signup_* 는 가입 시점 동의. 나머지는 행위 시점 동의.';

-- 2) P0-05 단계 C — 컬럼이 아직 있을 때만
do $c$
declare n integer;
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='benefit_applications'
                and column_name in ('contact','address')) then

    -- 남은 신청분 이전 (여러 번 돌려도 안전)
    execute $q$
      insert into public.benefit_applications_pii (application_id, owner_id, contact, address)
      select a.id, a.owner_id, a.contact, a.address
        from public.benefit_applications a
       where (coalesce(a.contact,'') <> '' or coalesce(a.address,'') <> '')
      on conflict (application_id) do nothing
    $q$;

    -- 안 옮겨진 게 있으면 전부 취소
    execute $q$
      select count(*)
        from public.benefit_applications a
       where (coalesce(a.contact,'') <> '' or coalesce(a.address,'') <> '')
         and not exists (select 1 from public.benefit_applications_pii p
                          where p.application_id = a.id)
    $q$ into n;
    if n > 0 then
      raise exception '중단: 분리 표로 안 옮겨진 신청이 %건 있습니다. 아무것도 바뀌지 않았습니다.', n
        using errcode = '42501';
    end if;

    execute 'alter table public.benefit_applications drop column if exists contact';
    execute 'alter table public.benefit_applications drop column if exists address';
  end if;
end $c$;

notify pgrst, 'reload schema';

commit;

-- 결과 (한 줄)
select
  (select pg_get_constraintdef(oid) like '%signup_terms%'
     from pg_constraint where conname = 'consent_records_kind_chk')             as 가입동의종류,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='benefit_applications'
      and column_name in ('contact','address'))                                  as 남은개인정보컬럼,
  (select count(*) from public.benefit_applications_pii)                         as pii행수;
