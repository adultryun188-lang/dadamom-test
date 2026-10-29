'use strict';
// 본문/이메일/아이 정보 없이 명시한 코호트와 서버 작성시각만 집계한다.
const DAY=86400000;
const stamp=value=>{const n=Date.parse(value);if(!Number.isFinite(n))throw Error('유효하지 않은 시각');return n;};
const kst=n=>new Date(n+9*3600000).toISOString().slice(0,10);
function summarize({cohort,actions,asOf,coverage='retained-posts-comments'}){
  const now=stamp(asOf), users=new Map();
  for(const row of cohort){
    if(typeof row.id!=='string'||!row.id||users.has(row.id))throw Error('코호트 ID 누락/중복');
    const joined=stamp(row.joined_at);if(joined>now)throw Error('관찰 시점보다 늦은 가입');
    users.set(row.id,{joined,eligible:joined+7*DAY<=now,first:false,returned:false});
  }
  const seen=new Set();
  for(const action of actions){
    if(!['post','comment'].includes(action.kind))continue;
    const u=users.get(action.user_id);if(!u)continue;
    if(typeof action.id!=='string'||!action.id)throw Error('행위 ID 필요');
    const key=action.kind+':'+action.id;if(seen.has(key))continue;seen.add(key);
    const at=stamp(action.at);if(at<u.joined||at>now)continue;
    u.first=true;
    if(at<=u.joined+7*DAY && kst(at)>kst(u.joined))u.returned=true;
  }
  const all=[...users.values()], eligible=all.filter(u=>u.eligible);
  const numerator=eligible.filter(u=>u.returned).length;
  return {as_of:new Date(now).toISOString(),coverage,cohort_size:all.length,
    first_action_users:all.filter(u=>u.first).length,eligible_7d:eligible.length,
    not_yet_eligible_7d:all.length-eligible.length,returned_7d:numerator,
    returned_7d_percent:eligible.length?Math.round(1000*numerator/eligible.length)/10:null,
    limitations:['기준 시각은 입력 코호트의 joined_at이다. 프로필 생성·이메일 계정 생성·파일럿 참여 시작은 구분해야 한다.',
      '기존 글·댓글 기반 수치는 삭제된 활동을 놓치는 하한치다. 돌봄기록·초대열람·접속은 포함하지 않는다.',
      '테스트·운영자·시드 제외는 집계 전 명시한 코호트와 행위 목록에서 처리해야 한다.']};
}
module.exports={summarize};
