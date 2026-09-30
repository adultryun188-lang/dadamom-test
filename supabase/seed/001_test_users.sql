-- =============================================================================
-- 테스트 계정 (테스트 프로젝트에서만 실행)
--
-- 전부 지어낸 값입니다. 운영 데이터는 한 줄도 들어 있지 않습니다.
-- 비밀번호는 모두  dadamom-test-1234
--
-- 계정
--   admin@dadamom.test   운영자 (콘텐츠 검수, 공지, 나들이, 체험단 관리)
--   momA@dadamom.test    육아 15개월 · 인천
--   momB@dadamom.test    임신 28주 · 서울
--   dadC@dadamom.test    육아 7개월 · 경기  (차단·신고 테스트 상대역)
-- =============================================================================
begin;

create or replace function pg_temp.mk_user(uid uuid, mail text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    -- 아래 토큰 컬럼을 NULL 로 두면 Supabase 인증 서버가 읽다가 실패해 로그인이 안 된다.
    -- 반드시 빈 문자열로 채운다.
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, phone_change,
    phone_change_token, reauthentication_token
  ) values (
    uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', mail,
    crypt('dadamom-test-1234', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(),
    '', '', '', '', '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, 'email',
          json_build_object('sub', uid::text, 'email', mail)::jsonb, now(), now())
  on conflict do nothing;
end $$;

create extension if not exists pgcrypto;

select pg_temp.mk_user('11111111-1111-1111-1111-111111111111', 'admin@dadamom.test');
select pg_temp.mk_user('22222222-2222-2222-2222-222222222222', 'momA@dadamom.test');
select pg_temp.mk_user('33333333-3333-3333-3333-333333333333', 'momB@dadamom.test');
select pg_temp.mk_user('44444444-4444-4444-4444-444444444444', 'dadC@dadamom.test');

-- 운영자 지정
insert into public.admin_emails (email) values ('admin@dadamom.test') on conflict do nothing;

-- 프로필
insert into public.profiles (id, nickname, kid_type, parent_role, birth_month, due_date, region, interests, onboarded) values
  ('22222222-2222-2222-2222-222222222222', '하람이',  'parenting', 'mom',      '2025-06', null,        '인천', '["이유식","수면교육"]'::jsonb, true),
  ('33333333-3333-3333-3333-333333333333', '콩이',    'pregnant',  'mom',      null,      '2026-12-10','서울', '["출산준비"]'::jsonb,          true),
  ('44444444-4444-4444-4444-444444444444', '도윤이',  'parenting', 'dad',      '2026-02', null,        '경기', '["놀이","외출"]'::jsonb,       true)
on conflict (id) do update set
  nickname = excluded.nickname, kid_type = excluded.kid_type, parent_role = excluded.parent_role,
  birth_month = excluded.birth_month, due_date = excluded.due_date, region = excluded.region,
  interests = excluded.interests, onboarded = true;

commit;

-- 확인
select email, id from auth.users where email like '%@dadamom.test' order by email;
