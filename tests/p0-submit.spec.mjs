// 실제 소스 핸들러에 지연/실패를 주입한다. 네트워크·DB를 사용하지 않는다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../community.html', import.meta.url), 'utf8');
function handler(name, next, context){
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  async function '+name+'('), source.indexOf('  '+next, source.indexOf('  async function '+name+'('))), context);
  return context[name];
}
let passed=0;
const check=(name, ok)=>{assert(ok,name);passed++;console.log('PASS '+name);};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const event={preventDefault(){}};
{
  let calls=0, closed=0, task=deferred();
  const btn={disabled:false}, form={querySelector:()=>btn}, hint={textContent:''};
  const els={'login-form':form,'l-hint':hint,'l-email':{value:' test@example.test '},'l-pw':{value:'test-only'}};
  const ctx={$:id=>els[id],closeModal:()=>closed++,sb:{auth:{signInWithPassword:()=>{calls++;return task.promise;}}}};
  const login=handler('submitLogin','var reportTarget',ctx);
  const a=login({...event,target:form}); await login({...event,target:form});
  check('로그인 중복 요청 차단',calls===1 && btn.disabled);
  task.resolve({error:{}}); await a;
  check('로그인 실패 안내·재시도',!btn.disabled && hint.textContent.includes('확인') && closed===0);
  ctx.sb.auth.signInWithPassword=async()=>{throw Error('offline');};
  await login({...event,target:form});
  check('로그인 예외 안내·버튼 복구',!btn.disabled && hint.textContent.includes('연결'));
  task=deferred();ctx.sb.auth.signInWithPassword=()=>task.promise;
  const stale=login({...event,target:form});els['login-form']={};task.resolve({});await stale;
  check('이전 요청이 새 로그인창 닫지 않음',closed===0);
  els['login-form']=form;ctx.sb.auth.signInWithPassword=async()=>({});
  await login({...event,target:form});check('로그인 성공 닫힘',closed===1);
}
{
  let calls=0, refreshed=0, loaded=0, opened=0, notices=[], task=deferred();
  const btn={disabled:false}, ta={value:'가상 테스트 댓글'}, post={id:'test-post'};
  const ctx={user:{id:'test-user'},current:post,$:id=>id==='cmt-submit'?btn:ta,myName:()=> '가상부모',toast:s=>notices.push(s),openLogin:()=>opened++,refreshPostCounts:async()=>refreshed++,loadComments:()=>loaded++,sb:{from:()=>({insert:()=>{calls++;return task.promise;}})}};
  const submit=handler('submitComment','async function deletePost',ctx);
  const a=submit(event);await submit(event);
  check('댓글 중복 제출 차단',calls===1 && btn.disabled);
  task.resolve({error:{}});await a;
  check('댓글 실패 시 입력 보존',!btn.disabled && ta.value==='가상 테스트 댓글' && notices.length===1);
  ctx.sb.from=()=>({insert:async()=>{throw Error('offline');}});await submit(event);
  check('댓글 예외 후 재시도 가능',!btn.disabled && notices.length===2 && ta.value.length>0);
  ctx.sb.from=()=>({insert:async()=>({})});await submit(event);
  check('댓글 성공 시 입력 초기화·집계 갱신',ta.value==='' && refreshed===1 && loaded===1);
  ctx.user=null;await submit(event);check('비로그인 댓글은 로그인 안내',opened===1);
}
console.log(`P0 전송 실패/중복/복구 ${passed}개 통과`);
