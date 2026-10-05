-- =============================================================================
-- 0012_signup_consents.sql  —  가입 시점 동의를 원장에 남길 수 있게
--
-- 배경
--   글을 쓸 때·체험단을 신청할 때는 동의를 받아 consent_records 에 남기는데,
--   정작 **가입할 때는 아무 동의도 받지 않고 있었습니다.** 이메일과 비밀번호만
--   넣으면 계정이 생깁니다.
--
--   국내 서비스는 가입 시점에 이용약관·개인정보 수집이용 동의를 받아야 하고,
--   만 14세 미만은 받지 않는다는 확인도 필요합니다(개인정보처리방침에 이미
--   "만 14세 미만 아동의 개인정보는 수집하지 않습니다" 라고 써 두었는데,
--   정작 확인하는 절차가 없었습니다). 앱 심사에서도 보는 항목입니다.
--
--   표와 정책은 그대로 두고 kind 목록만 넓힙니다.
--
-- 적용 순서: 0011 다음 (테스트 환경 기준. 운영은 0011 까지 올라가 있습니다)
-- =============================================================================
begin;

alter table public.consent_records
  drop constraint if exists consent_records_kind_chk;

alter table public.consent_records
  add constraint consent_records_kind_chk check (kind in (
    -- 가입 시점
    'signup_terms',      -- 서비스 이용약관 (필수)
    'signup_privacy',    -- 개인정보 수집·이용 (필수)
    'signup_age14',      -- 만 14세 이상 확인 (필수)
    'signup_marketing',  -- 마케팅 정보 수신 (선택)
    -- 기존
    'trial_shipping',    -- 배송을 위한 연락처·주소 제공 (필수)
    'trial_brand_use',   -- 브랜드의 후기 광고 활용 (선택)
    'entry_photo',       -- 아이 사진 챌린지 게시 (필수)
    'entry_brand_use',   -- 브랜드의 참가작 광고 활용 (선택)
    'post_visibility'    -- 게시글 공개범위 확인
  ));

comment on constraint consent_records_kind_chk on public.consent_records is
  'signup_* 는 가입 시점 동의. 나머지는 행위 시점 동의.';

commit;

-- =============================================================================
-- 되돌리기 — kind 목록을 0006 상태로
-- =============================================================================
-- begin;
-- delete from public.consent_records where kind like 'signup%';
-- alter table public.consent_records drop constraint if exists consent_records_kind_chk;
-- alter table public.consent_records add constraint consent_records_kind_chk check (kind in (
--   'trial_shipping','trial_brand_use','entry_photo','entry_brand_use','post_visibility'));
-- commit;
