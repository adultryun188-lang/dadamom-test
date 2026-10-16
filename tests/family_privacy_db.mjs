// node tests/family_privacy_db.mjs — 로컬 PostgreSQL에서 실제 마이그레이션·RLS·트리거 실행.
import assert from 'node:assert/strict';
import { fixture, migration, A, B } from './family_privacy_fixture.mjs';
const f = await fixture(false);
const { db, user, create, join, write } = f;
let count = 0;
function check(name, condition) { assert(condition, name); console.log('PASS ' + name); count++; }
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const latest = async uid => (await rows("select granted,scope from public.consent_records where owner_id=$1 and kind='family_share' order by created_at desc,granted limit 1", [uid]))[0];
const falseCount = async uid => Number((await rows("select count(*) as n from public.consent_records where owner_id=$1 and kind='family_share' and not granted", [uid]))[0].n);
try {
  const family = await create();
  const fid = family.family_id;
  await join(B, family.invite_code);
  await write(A, fid, 'owner'); await write(B, fid, 'old-member', true);
  const before = (await rows("select * from public.family_records where rid='old-member'"))[0];
  await user(B, 'select public.leave_family()');
  check('0016에서 나간 계정 연결이 남는 문제 재현', (await rows("select updated_by from public.family_records where rid='old-member'"))[0].updated_by === B);
  await db.exec(await migration('0017_family_consent_withdrawal.sql'));
  const corrected = (await rows("select * from public.family_records where rid='old-member'"))[0];
  check('0017이 과거 탈퇴 구성원의 잔존 계정 연결 해제', corrected.updated_by === null);
  check('보정은 기록 본문·삭제 표시·시각을 보존', JSON.stringify(corrected.body) === JSON.stringify(before.body) && corrected.deleted && +new Date(corrected.updated_at) === +new Date(before.updated_at));
  check('남아 있는 구성원의 계정 연결은 유지', (await rows("select updated_by from public.family_records where rid='owner'"))[0].updated_by === A);
  check('새 내부 함수는 authenticated에서 직접 실행 불가', (await rows("select not has_function_privilege('authenticated','public._record_family_end(uuid,uuid)','execute') as ok"))[0].ok);
  check('버전 함수는 anon에서 실행 불가', (await rows("select not has_function_privilege('anon','public.family_privacy_version()','execute') as ok"))[0].ok);
  await join(B, family.invite_code); await write(B, fid, 'new-member');
  await user(A, "update public.family_records set updated_by=null where rid='owner'");
  check('일반 클라이언트가 계정 연결을 임의로 비우면 서버가 본인으로 기록', (await rows("select updated_by from public.family_records where rid='owner'"))[0].updated_by === A);

  await db.exec(`create function public.test_consent_fail() returns trigger language plpgsql as $$
    begin if not new.granted then raise exception 'test_consent_failure'; end if; return new; end $$;
    create trigger test_consent_fail before insert on public.consent_records for each row execute function public.test_consent_fail();`);
  await assert.rejects(user(B, 'select public.leave_family()'), /test_consent_failure/);
  check('철회 기록 저장 실패 시 가족 나가기도 rollback', (await rows('select 1 from public.family_members where user_id=$1', [B])).length === 1);
  check('철회 실패 시 작성자 연결과 기존 동의 유지', (await rows("select updated_by from public.family_records where rid='new-member'"))[0].updated_by === B && (await latest(B)).granted);
  await db.exec('drop trigger test_consent_fail on public.consent_records; drop function public.test_consent_fail();');
  await db.exec(`create function public.test_author_fail() returns trigger language plpgsql as $$
    begin if new.updated_by is null then raise exception 'test_author_failure'; end if; return new; end $$;
    create trigger zz_test_author_fail before update on public.family_records for each row execute function public.test_author_fail();`);
  await assert.rejects(user(B, 'select public.leave_family()'), /test_author_failure/);
  check('계정 연결 해제 실패 시 철회 기록·나가기 모두 rollback', (await latest(B)).granted && (await rows('select 1 from public.family_members where user_id=$1', [B])).length === 1);
  await db.exec('drop trigger zz_test_author_fail on public.family_records; drop function public.test_author_fail();');
  const result = (await user(B, 'select public.leave_family() as value'))[0].value;
  check('성공 응답은 철회 완료를 함께 확인', result.ok && result.consent_revoked && result.privacy_version === 17);
  check('나가기 성공 시 철회 이력이 false', (await latest(B)).granted === false);
  check('나간 사람의 계정 연결만 해제하고 기록은 유지', (await rows("select updated_by,body from public.family_records where rid='new-member'"))[0].updated_by === null && (await rows("select body from public.family_records where rid='new-member'"))[0].body.ts === 123);
  check('나간 계정은 RLS로 가족 기록 조회 불가', (await user(B, 'select * from public.family_records')).length === 0);
  const n = await falseCount(B);
  await user(B, 'select public.leave_family()');
  check('응답 유실 후 재시도해도 종료 이력 중복 없음', await falseCount(B) === n);
  await assert.rejects(user(B, 'select public.join_family($1)', [family.invite_code]), /consent_required/);
  check('재참여는 새 동의가 있어야 가능', true);
  await join(B, family.invite_code); await write(B, fid, 'removed-member');
  await user(A, 'select public.remove_family_member($1)', [B]);
  check('구성원 빼기도 계정 연결 해제', (await rows("select updated_by from public.family_records where rid='removed-member'"))[0].updated_by === null);
  check('강제 제거는 자발적 철회라고 단정하지 않는 종료 사유로 기록', (await latest(B)).granted === false && (await latest(B)).scope === 'family_membership_end');
  const code = (await user(A, 'select public.new_family_invite() as value'))[0].value.invite_code;
  await join(B, code);
  await user(A, 'select public.delete_my_account()');
  check('회원 탈퇴 후 남은 가족 기록의 계정 연결 제거', (await rows("select updated_by from public.family_records where rid='owner'"))[0].updated_by === null);
  check('회원 탈퇴 시 동의 이력은 계정과 함께 삭제', (await rows('select 1 from public.consent_records where owner_id=$1', [A])).length === 0);
  check('탈퇴한 방장 다음으로 남은 구성원이 방장', (await user(B, 'select public.my_family() as value'))[0].value.is_owner);
  await user(B, 'select public.leave_family()');
  check('마지막 구성원 나가기 시 실제 가족·기록 모두 삭제', (await rows('select 1 from public.families')).length === 0 && (await rows('select 1 from public.family_records')).length === 0);
  check('마지막 구성원의 철회 이력은 유지', (await latest(B)).granted === false);
  await f.consent(B); await user(B, 'select public.leave_family()');
  check('가족 없이 동의만 남은 계정도 종료 기록 보장', (await latest(B)).granted === false);
  await db.exec(await migration('0017_family_consent_withdrawal.sql'));
  check('마이그레이션 재실행 가능', (await user(B, 'select public.family_privacy_version() as value'))[0].value === 17);
  console.log(`${count}개 검증 통과 (로컬 PostgreSQL, 원격 DB 미접속)`);
} finally { await db.close(); }
