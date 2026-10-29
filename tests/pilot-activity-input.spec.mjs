import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {summarizePilot,toRetentionInput} from '../scripts/p0-pilot-activity-input.mjs';
const {summarize}=createRequire(import.meta.url)('../retention-metrics.cjs');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002';
const member=(user_id=A,changes={})=>({user_id,joined_at:'2026-01-01T00:00:00Z',enrolled_at:'2026-10-01T14:30:00Z',expires_at:'2026-10-31T14:30:00Z',...changes});
const day=(user_id=A,changes={})=>({user_id,activity_day:'2026-10-02',kind:'post',first_at:'2026-10-01T15:00:00Z',...changes});
const source=(changes={})=>({asOf:'2026-10-09T00:00:00Z',cohort:[member()],days:[day()],...changes});
check('두 참여자의 같은 날 같은 종류 활동 ID 충돌 없음',()=>{
 const input=toRetentionInput(source({cohort:[member(),member(B)],days:[day(),day(B)]}));
 assert.notEqual(input.actions[0].id,input.actions[1].id);assert.equal(summarize(input).returned_7d,2);
});
check('기존 CLI 입력에 파일럿 coverage와 참여 시작 시각 전달',()=>{
 const input=toRetentionInput(source());assert.equal(input.coverage,'pilot-activity-days');
 assert.equal(input.cohort[0].joined_at,'2026-10-01T14:30:00.000Z');assert.equal(summarize(input).returned_7d,1);
});
check('가입 후 장기간 경과해도 참여 7일 전에는 분모 제외',()=>{
 const out=summarizePilot(source({asOf:'2026-10-02T00:00:00Z'}));assert.equal(out.eligible_7d,0);assert.equal(out.not_yet_eligible_7d,1);assert.equal(out.returned_7d_percent,null);
});
check('다른 한국 날짜만 재행동',()=>{
 const out=summarizePilot(source({days:[day(A,{activity_day:'2026-10-01',first_at:'2026-10-01T14:59:59Z'})]}));assert.equal(out.returned_7d,0);
});
check('7일 경계 활동 포함',()=>assert.equal(summarizePilot(source({days:[day(A,{activity_day:'2026-10-08',first_at:'2026-10-08T14:30:00Z'})]})).returned_7d,1));
check('7일 경계 이후 재행동 제외',()=>assert.equal(summarizePilot(source({asOf:'2026-10-10T00:00:00Z',days:[day(A,{activity_day:'2026-10-08',first_at:'2026-10-08T14:30:01Z'})]})).returned_7d,0));
check('조기 중단은 완전 관찰 분모와 기존 CLI 입력에서 제외',()=>{
 const data=source({cohort:[member(A,{expires_at:'2026-10-03T00:00:00Z'})]});const out=summarizePilot(data);
 assert.equal(out.cohort_size,1);assert.equal(out.eligible_7d,0);assert.equal(out.incomplete_7d_due_to_collection_end,1);assert.equal(out.not_yet_eligible_7d,0);assert.equal(toRetentionInput(data).cohort.length,0);
});
check('수집 종료 경계 뒤 활동 거부',()=>assert.throws(()=>summarizePilot(source({cohort:[member(A,{expires_at:'2026-10-01T15:00:00Z'})]}))));
check('관찰 시점 미래 활동 제외',()=>assert.equal(summarizePilot(source({asOf:'2026-10-01T14:59:59Z'})).first_action_users,0));
check('미래 참여 시작 거부',()=>assert.throws(()=>summarizePilot(source({asOf:'2026-10-01T00:00:00Z'}))));
check('등록 전 활동 복원 및 포함 금지',()=>assert.throws(()=>summarizePilot(source({days:[day(A,{first_at:'2026-09-30T15:00:00Z',activity_day:'2026-10-01'})]}))));
check('수집 시작보다 늦은 가입 시각 거부',()=>assert.throws(()=>summarizePilot(source({cohort:[member(A,{joined_at:'2026-10-02T00:00:00Z'})]}))));
check('30일 초과 수집 기간 거부',()=>assert.throws(()=>summarizePilot(source({cohort:[member(A,{expires_at:'2026-11-01T00:00:00Z'})]}))));
check('한국 날짜와 최초시각 불일치 거부',()=>assert.throws(()=>summarizePilot(source({days:[day(A,{activity_day:'2026-10-01'})]}))));
check('잘못된 날짜 및 시간대 없는 시각 거부',()=>{
 assert.throws(()=>summarizePilot(source({asOf:'2026-02-30T00:00:00Z'})));assert.throws(()=>summarizePilot(source({asOf:'2026-10-09T00:00:00'})));
});
check('코호트 밖 활동과 중복 코호트 거부',()=>{
 assert.throws(()=>summarizePilot(source({days:[day(B)]})));assert.throws(()=>summarizePilot(source({cohort:[member(),member()]})));
});
check('중복 활동은 하루 종류 최초 시각 하나만',()=>{
 const input=toRetentionInput(source({days:[day(A,{first_at:'2026-10-02T00:00:00Z'}),day(),day()]}));
 assert.equal(input.actions.length,1);assert.equal(input.actions[0].at,'2026-10-01T15:00:00.000Z');
});
check('글과 댓글 분리',()=>assert.equal(toRetentionInput(source({days:[day(),day(A,{kind:'comment'})]})).actions.length,2));
check('투표와 임의 필드 거부하며 오류에 개인정보 값 미출력',()=>{
 const secret='private@example.invalid';
 for(const data of [source({email:secret}),source({cohort:[{...member(),email:secret}]}),source({days:[{...day(),body:secret}]}),source({days:[day(A,{kind:'visit'})]})]){
   assert.throws(()=>summarizePilot(data),error=>!error.message.includes(secret));
 }
});
check('집계 보고에 사용자 식별자·가입시각 미출력 및 관찰 제한 명시',()=>{
 const out=summarizePilot(source()),text=JSON.stringify(out);assert(!text.includes(A));assert(!text.includes('2026-01-01'));assert.equal(out.cohort_basis,'enrolled_at');assert.match(out.metric,/파일럿 참여/);assert.match(out.pre_enrollment_activity,/미관찰/);assert(!text.includes('하한치'));
});
check('분모 없는 입력 안전 처리',()=>assert.equal(summarizePilot(source({cohort:[],days:[]})).returned_7d_percent,null));
check('어댑터 및 기존 CLI 실제 연결과 보고서 개인정보 미출력',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dadamom-pilot-input-'));
 const raw=path.join(dir,'raw.json'),converted=path.join(dir,'cli-input.json');
 const cwd=fileURLToPath(new URL('..',import.meta.url));
 try{
  fs.writeFileSync(raw,JSON.stringify(source({cohort:[member(),member(B)],days:[day(),day(B)]})));
  const run=(script,args)=>spawnSync(process.execPath,[script,...args],{cwd,encoding:'utf8'});
  const conversion=run('scripts/p0-pilot-activity-input.mjs',['--cli-input',raw]);
  assert.equal(conversion.status,0);fs.writeFileSync(converted,conversion.stdout);
  const old=run('scripts/p0-retention-report.mjs',['--input',converted]);
  assert.equal(old.status,0);assert.equal(JSON.parse(old.stdout).returned_7d,2);assert.equal(JSON.parse(old.stdout).coverage,'pilot-activity-days');
  const report=run('scripts/p0-pilot-activity-input.mjs',['--input',raw]);
  assert.equal(report.status,0);assert.equal(JSON.parse(report.stdout).returned_7d,2);assert(!report.stdout.includes(A));assert(!report.stdout.includes(B));
  fs.writeFileSync(raw,JSON.stringify(source({email:'private@example.invalid'})));
  const invalid=run('scripts/p0-pilot-activity-input.mjs',['--input',raw]);
  assert.equal(invalid.status,1);assert.equal(invalid.stdout,'');assert(!invalid.stderr.includes('private@example.invalid'));
 }finally{
  for(const target of [raw,converted])if(fs.existsSync(target))fs.unlinkSync(target);
  fs.rmdirSync(dir);
 }
});
console.log(`파일럿 최소 입력 ${passed}개 통과 (로컬 전용)`);