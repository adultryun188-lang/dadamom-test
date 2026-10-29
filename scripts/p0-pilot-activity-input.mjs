// 로컬 전용: SQL 최소 내보내기 → 파일럿 참여 후 재행동 집계. 원격 연결 없음.
// --input은 식별자 없는 보고서, --cli-input은 기존 p0-retention-report.mjs용 최소 입력.
// joined_at은 가입 기준 참고값이며 관찰 시작은 enrolled_at이다. 등록 전 자료는 복원하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {summarize}=createRequire(import.meta.url)('../retention-metrics.cjs');
const DAY=86400000;
const fail=()=>{throw Error('파일럿 최소 입력 형식 또는 관찰 기간이 유효하지 않습니다.');};
const keys=(row,expected)=>{
  if(!row||typeof row!=='object'||Array.isArray(row))fail();
  const found=Object.keys(row).sort();
  if(found.length!==expected.length||found.some((k,i)=>k!==[...expected].sort()[i]))fail();
};
const stamp=value=>{
  if(typeof value!=='string')fail();
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/);
  if(!m)fail();
  const [y,mo,d,h,mi,s]=m.slice(1,7).map(Number), calendar=new Date(Date.UTC(y,mo-1,d));
  if(y<1000||calendar.getUTCFullYear()!==y||calendar.getUTCMonth()!==mo-1||calendar.getUTCDate()!==d||h>23||mi>59||s>59)fail();
  if(m[7]!=='Z'){
    const [oh,om]=m[7].slice(1).split(':').map(Number);
    if(oh>14||om>59||(oh===14&&om!==0))fail();
  }
  const n=Date.parse(value);if(!Number.isFinite(n))fail();return n;
};
const kst=n=>new Date(n+9*3600000).toISOString().slice(0,10);
const identifier=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))fail();return value.toLowerCase();};
function validated(source){
  keys(source,['asOf','cohort','days']);
  const now=stamp(source.asOf);
  if(!Array.isArray(source.cohort)||!Array.isArray(source.days))fail();
  const cohort=new Map();
  for(const row of source.cohort){
    keys(row,['user_id','joined_at','enrolled_at','expires_at']);
    const id=identifier(row.user_id),joined=stamp(row.joined_at),start=stamp(row.enrolled_at),end=stamp(row.expires_at);
    if(cohort.has(id)||joined>start||start>now||end<=start||end>start+30*DAY)fail();
    cohort.set(id,{id,start,end});
  }
  const actions=new Map();
  for(const row of source.days){
    keys(row,['user_id','activity_day','kind','first_at']);
    const user=identifier(row.user_id),at=stamp(row.first_at),member=cohort.get(user);
    if(!member||!['post','comment'].includes(row.kind)||typeof row.activity_day!=='string'||row.activity_day!==kst(at)||at<member.start||at>=member.end)fail();
    if(at>now)continue;
    const id=user+':'+row.activity_day+':'+row.kind,previous=actions.get(id);
    if(!previous||at<stamp(previous.at))actions.set(id,{id,user_id:user,kind:row.kind,at:new Date(at).toISOString()});
  }
  return {now,cohort:[...cohort.values()],actions:[...actions.values()]};
}
const input=(data,members)=>({asOf:new Date(data.now).toISOString(),coverage:'pilot-activity-days',
  cohort:members.map(r=>({id:r.id,joined_at:new Date(r.start).toISOString()})),
  actions:data.actions.filter(a=>members.some(r=>r.id===a.user_id))});
export function toRetentionInput(source){
  const data=validated(source);
  // 기존 CLI에는 expires_at 필드가 없으므로 7일 수집을 끝내기 전에 중단한 코호트는 제외한다.
  return input(data,data.cohort.filter(r=>r.end>=r.start+7*DAY));
}
export function summarizePilot(source){
  const data=validated(source),all=summarize(input(data,data.cohort));
  const complete=data.cohort.filter(r=>r.start+7*DAY<=data.now&&r.end>=r.start+7*DAY);
  const observed=summarize(input(data,complete));
  const incomplete=data.cohort.filter(r=>r.end<r.start+7*DAY).length;
  return {...all,metric:'파일럿 참여 후 재행동',cohort_basis:'enrolled_at',
    eligible_7d:observed.eligible_7d,returned_7d:observed.returned_7d,returned_7d_percent:observed.returned_7d_percent,
    not_yet_eligible_7d:data.cohort.length-complete.length-incomplete,
    incomplete_7d_due_to_collection_end:incomplete,
    pre_enrollment_activity:'등록 전 활동 미관찰; 가입 기준 재방문으로 해석하지 않음',
    limitations:[
      '관찰 시작은 enrolled_at이며 실제 가입 시각 joined_at과 다르다. 가입 후 재방문 지표가 아니다.',
      '등록 이후 글·댓글 일별 최초 활동만 포함한다. 원본 삭제 뒤에도 최소 활동은 남지만 등록 전 활동·돌봄기록·초대열람·접속은 포함하지 않는다.',
      '7일 관찰이 끝나고 그 기간 내 수집이 유지된 참여자만 분모에 포함한다. 조기 중단자는 별도로 표시한다.',
      '명시적으로 허용한 코호트의 최소 추출만 입력한다. 실제 지표에서 테스트·운영자·시드 제외는 추출 전에 처리한다.'
    ]};
}
const main=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
  try{
    const [mode,file,...rest]=process.argv.slice(2);
    if(!['--input','--cli-input'].includes(mode)||!file||rest.length)throw Error('사용법: node scripts/p0-pilot-activity-input.mjs --input 최소필드.json | --cli-input 최소필드.json');
    const source=JSON.parse(fs.readFileSync(file,'utf8'));
    console.log(JSON.stringify(mode==='--cli-input'?toRetentionInput(source):summarizePilot(source),null,2));
  }catch{
    console.error('파일럿 최소 입력 검증 실패. 필드·시각·수집 기간을 확인하세요.');process.exitCode=1;
  }
}