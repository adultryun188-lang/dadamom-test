// 만료 시각 조작은 로컬 PGlite에서만 한다. 원격 DB 접속 없음.
import assert from 'node:assert/strict';
import {fixture,A,B} from './family_privacy_fixture.mjs';
const f=await fixture();let passed=0;
const check=(name,value)=>{assert(value,name);passed++;console.log('PASS '+name);};
try{
  const family=await f.create();await f.consent(B);
  await f.db.query("update families set invite_expires_at=now()-interval '1 second' where id=$1",[family.family_id]);
  await assert.rejects(f.user(B,'select join_family($1)',[family.invite_code]),/invalid_code/);check('만료된 초대 참여 거부',true);
  const current=(await f.user(A,'select my_family() as value'))[0].value;
  check('만료된 초대는 구성원에게도 코드·만료시각 미노출',current.invite_code===null&&current.invite_expires_at===null);
  const renewed=(await f.user(A,'select new_family_invite() as value'))[0].value;
  await assert.rejects(f.user(B,'select join_family($1)',[family.invite_code]),/invalid_code/);check('재발급 뒤 옛 코드 거부',true);
  await f.user(B,'select join_family($1)',[renewed.invite_code]);check('새 코드 참여 성공',true);
  await f.write(A,family.family_id,'expiry-test');
  await f.user(B,'select leave_family()');
  const rows=await f.user(B,'select * from family_records where family_id=$1',[family.family_id]);
  check('동의 철회 뒤 기록 조회 불가',rows.length===0);
  await assert.rejects(f.user(B,'select join_family($1)',[renewed.invite_code]),/consent_required/);check('철회 뒤 새 동의 없이 재가입 불가',true);
}finally{await f.db.close();}
console.log(`가족 초대 만료·철회 ${passed}개 통과 (로컬 DB)`);
