// 공유·가입 복귀·계정 정리·카드 회귀. Supabase 스텁만 사용하며 외부 DB 요청은 차단한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const flow = require('../community-flow.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function check(name, value){ assert(value, name); console.log('PASS ' + name); passed++; }
const base = 'https://example.test/dadamom-test/';
for(const sub of ['', 'nested/']){
  const b = base + sub;
  check('환경 상대 게시글 링크 ' + sub, flow.postUrl('post-123', b + 'index.html?from=ig-01#home') === b + 'community.html?from=ig-01#/p/post-123');
  const entry = flow.authEntry(b + 'community.html?from=ig-01#/p/post-123');
  check('가입 진입 원글 보존 ' + sub, new URL(entry).searchParams.get('returnTo') === '#/p/post-123');
  check('인증 콜백 복귀 보존 ' + sub, flow.returnUrl(flow.callbackUrl(entry)) === b + 'community.html?from=ig-01#/p/post-123');
}
for(const bad of ['https://evil.test','//evil.test','#/p/../x','javascript:alert(1)','%23%2Fp%2Ffoo','#/p/a?x=1','#/p/a%2fb','\\evil.test','#/p/<svg>']){
  check('외부/우회 복귀 차단 ' + bad, flow.returnUrl(base + 'index.html?returnTo=' + encodeURIComponent(bad)) === '');
}
check('중복 복귀 파라미터 차단', !flow.returnUrl(base + 'index.html?returnTo=%23%2Fp%2Fa&returnTo=%23%2Fp%2Fb'));
check('유효하지 않은 출처 제거', !new URL(flow.postUrl('a', base + '?from=bad_value')).search);
check('중복 출처 제거', !new URL(flow.postUrl('a', base + '?from=one&from=two')).search);
check('인증 code/token 전달 금지', !/code=|token=/.test(flow.callbackUrl(base + 'index.html?code=secret&token=secret&returnTo=%23%2Fp%2Fa')));
check('커뮤니티 첫 화면 복귀 허용 (PC 소셜 로그인)', flow.returnUrl(base + 'index.html?returnTo=%23%2F').endsWith('community.html#/'));
check('글쓰기 복귀 허용',flow.returnUrl(base + 'index.html?returnTo=%23%2Fwrite').endsWith('community.html#/write'));
check('앱 챌린지 복귀 허용', flow.returnUrl(base + 'index.html?returnTo=%23challenge&from=meta-a') === base + 'index.html?from=meta-a#challenge');
check('앱 혜택 복귀 허용', flow.returnUrl(base + 'index.html?returnTo=%23benefit') === base + 'index.html#benefit');
check('그 밖의 앱 화면 복귀 차단', flow.returnUrl(base + 'index.html?returnTo=%23home') === '' && flow.returnUrl(base + 'index.html?returnTo=%23admin') === '');
check('챌린지에서 복귀 표시 남김', new URL(flow.keepReturn(base + 'index.html?from=meta-a#challenge')).searchParams.get('returnTo') === '#challenge');
check('다른 화면은 복귀 표시 안 남김', flow.keepReturn(base + 'index.html#home') === '' && flow.keepReturn(base + 'community.html#/p/a') === '');
for(const id of ['', '../a', 'a/b', 'a?b', 'a#b']) check('잘못된 글 ID 차단 ' + id, !flow.postUrl(id, base));

// 캔버스 줄바꿈은 실제 소스 함수를 읽어 경계값을 검증한다.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const shareSandbox = { sb:{}, window:{DadamomCommunityFlow:flow}, location:{href:base+'index.html#community'} };
vm.createContext(shareSandbox);
vm.runInContext(html.slice(html.indexOf('  function sharePostUrlFor('),html.indexOf('  function openShareModal(')),shareSandbox);
for(const post of [{id:'p',status:'pending'},{id:'p',status:'rejected'},{id:'p',status:'approved',visibility:'private'}]){
  check('미공개 글 공유 차단 '+post.status+'/'+post.visibility,!shareSandbox.sharePostUrlFor(post));
}
check('승인 공개 글 공유 허용',!!shareSandbox.sharePostUrlFor({id:'p',status:'approved'}));
const wrapSource = html.slice(html.indexOf('  function wrapCanvasText('), html.indexOf('  function buildShareCard('));
const sandbox = { Intl, Array, String }; vm.createContext(sandbox); vm.runInContext(wrapSource, sandbox);
for(const text of ['', '짧은 글', '한글공백없는아주긴문장'.repeat(10), '👨‍👩‍👧‍👦'.repeat(20), '첫째\n둘째\n셋째']){
  const drawn = [], ctx = { measureText:t => ({ width:Array.from(t).length * 10 }), fillText:(t,x,y) => drawn.push({t,x,y}) };
  sandbox.wrapCanvasText(ctx, text, 32, 714, 536, 30, 2);
  check('본문 최대 2줄/가로 범위 ' + text.slice(0,8), drawn.length <= 2 && drawn.every(r => ctx.measureText(r.t).width <= 536));
  if(text.length > 100 || text.includes('셋째')) check('넘치는 본문 말줄임', drawn.at(-1).t.endsWith('…'));
}

const env = fs.readFileSync(path.join(root,'config/env.staging.js'),'utf8').replaceAll('__BUILD__','flow-regression');
assert(env.includes('srxdtddrtnhtlbbviyvs.supabase.co'));
const server = http.createServer((req,res) => {
  let file;
  try{ file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname)); }catch{ res.writeHead(400).end(); return; }
  if(!file.startsWith(root + path.sep) && file !== root){ res.writeHead(403).end(); return; }
  if(file === root) file = path.join(root,'index.html');
  if(file.includes(path.sep + '.git') || file.includes(path.sep + 'node_modules')){ res.writeHead(403).end(); return; }
  if(path.basename(file) === 'env.js'){ res.writeHead(200,{'Content-Type':'application/javascript'}).end(env); return; }
  const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json'};
  fs.readFile(file,(error,data) => { res.writeHead(error ? 404 : 200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(error ? '' : data); });
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const LOCAL = 'http://127.0.0.1:' + server.address().port + '/';
const target = process.env.BASE_URL || LOCAL;
const targetUrl = new URL(target);
assert(['localhost','127.0.0.1'].includes(targetUrl.hostname) || (targetUrl.origin === 'https://adultryun188-lang.github.io' && targetUrl.pathname === '/dadamom-test/'), 'STOP: 테스트 앱 주소만 허용');
const APP = new URL('index.html',target).href, WEB = new URL('community.html',target).href;
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(),'dadamom-flow-'));
let stub = fs.readFileSync(path.join(root,'tests/supabase-stub.js'),'utf8').replace(/\r\n/g,'\n');
// 기존 앱 전용 스텁에 이 테스트에서 필요한 웹 조회 메서드만 덧붙인다.
stub = stub.replace('var api = {', `var api = {
  lt:function(c,v){filters.push(r=>r[c]<v);return api;}, gt:function(c,v){filters.push(r=>r[c]>v);return api;},
  lte:function(c,v){filters.push(r=>r[c]<=v);return api;}, range:function(){return api;},
  like:function(c,v){filters.push(r=>String(r[c]||'').startsWith(v.replace(/%$/,'')));return api;},
  ilike:function(){return api;},`);
stub = stub.replace('function tbl(name){', `function tbl(name){
  (store.community_posts||[]).forEach(p=>{p.likes=(store.post_likes||[]).filter(r=>r.post_id===p.id).length;p.comments=(store.post_comments||[]).filter(r=>r.post_id===p.id).length;});`);
stub = stub.replace('var keep = rows.filter', 'var removed = rows.filter(match); var keep = rows.filter');
stub = stub.replace('rows.length = 0; Array.prototype.push.apply(rows, keep);\n        return { data:null, error:null };', 'rows.length = 0; Array.prototype.push.apply(rows, keep);\n        return { data:removed, error:null };');
stub = stub.replace("if(!r.created_at)", "if(name === 'post_comments' && !r.owner_id) r.owner_id = window.__SBSTUB.curId; if(!r.created_at)");
stub += `\n(function(){
  const S=window.__SBSTUB,F=window.__fixture;
  let saved;try{saved=JSON.parse(sessionStorage.getItem('__flowStore'));}catch(e){}
  Object.assign(S.store,saved||F.store);
  let session=F.session;try{const raw=sessionStorage.getItem('__flowSession');if(raw!==null)session=JSON.parse(raw);}catch(e){}
  S.setSession(session); S.curId=session&&session.user.id;
  const signIn=S.signIn,signOut=S.signOut;
  S.signIn=function(id,email){session={user:{id,email}};sessionStorage.setItem('__flowSession',JSON.stringify(session));signIn(id,email);};
  S.signOut=function(){session=null;sessionStorage.setItem('__flowSession','null');signOut();};
  addEventListener('pagehide',()=>sessionStorage.setItem('__flowStore',JSON.stringify(S.store)));
  const create=window.supabase.createClient;
  window.supabase.createClient=function(){const c=create();const on=c.auth.onAuthStateChange;
    c.auth.onAuthStateChange=function(f){const r=on(f);queueMicrotask(()=>f('INITIAL_SESSION',session));return r;};
    c.auth.signInWithPassword=async function(args){S.lastAuth=args;S.signIn('u-flow','flow@dadamom.test');return {data:{session},error:null};};
    c.auth.signInWithOtp=async function(args){S.otpArgs=args;return {data:{},error:null};};c.auth.signUp=async function(args){S.signupArgs=args;return {data:{user:{id:'u-flow',identities:[{}]},session:null},error:null};};
    c.auth.signInWithOAuth=async function(args){S.oauthArgs=args;return {error:null};};
    const upsert=c.from;
    c.from=function(name){const q=upsert(name);if(name==='profiles'&&F.failProfile)q.upsert=async()=>{S.upsertFailure=true;return {error:{message:'test save failure'}};};return q;};
    return c;
  };
})();`;
const now = new Date().toISOString();
function fixture(session=true,onboarded=true){ return {
  session:session ? {user:{id:'u-flow',email:'flow@dadamom.test'}} : null,
  store:{profiles:[{id:'u-flow',nickname:'검증',onboarded,kid_type:'parenting',parent_role:'mom',birth_month:'2026-01',region:'서울'}],
    community_posts:[{id:'p-public',owner_id:'u-other',author:'가상부모',text:'[자랑] 작은 자랑\n가상 본문',status:'approved',likes:0,comments:0,created_at:now},
      {id:'p-card',owner_id:'u-flow',author:'검증',text:'공백없는긴한글문장과👨‍👩‍👧‍👦'.repeat(40),status:'approved',media_path:'u-flow/test.png',likes:0,comments:0,created_at:now}],
    post_comments:[],post_likes:[],post_bookmarks:[],notices:[],outings:[],challenge_entries:[]}
}; }
const browser = await chromium.launch();
async function run(name, f, fn){
  const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
  const page=await ctx.newPage(), errors=[], blocked=[];
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(f=>{
    window.__fixture=f; window.__copied='';
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{window.__copied=t;}}});
    window.__drawn=[]; const fill=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(t,x,y){window.__drawn.push({text:t,x,y,font:this.font,width:this.measureText(t).width,canvasHeight:this.canvas.height});return fill.apply(this,arguments);};
  },f);
  await ctx.route('**/*',async r=>{
    const u=new URL(r.request().url());
    if(u.href.includes('/supabase-js@2')) return r.fulfill({contentType:'application/javascript',body:stub});
    if(u.hostname.includes('fonts.') || u.pathname.includes('/pretendard')) return r.fulfill({contentType:'text/css',body:''});
    if(u.origin !== targetUrl.origin || (targetUrl.hostname==='adultryun188-lang.github.io' && !u.pathname.startsWith('/dadamom-test/'))){blocked.push(u.origin+u.pathname);return r.abort();}
    await r.continue();
  });
  page.on('dialog',d=>d.accept());
  try{ await fn(page); check(name+' JS 오류 없음',errors.length===0); check(name+' 외부 DB/운영 요청 없음',blocked.length===0); }
  catch(e){console.error(name,errors);throw e;}
  finally{await ctx.close();}
}
try{
  await run('공유',fixture(),async p=>{
    await p.goto(APP+'?from=ig-01#community');
    await p.locator('#screen-community [data-share-post="p-public"]').waitFor({state:'visible'});
    await p.click('#screen-community [data-share-post="p-public"]'); await p.click('[data-share-copy]');
    await p.waitForFunction(()=>window.__copied.includes('#/p/p-public'));
    check('복사 문자열이 같은 환경의 원글', (await p.evaluate(()=>window.__copied)).includes(WEB+'?from=ig-01#/p/p-public'));
    await p.click('[data-close-modal]'); await p.goto(APP+'#my');
    await p.click('[data-share-app]'); await p.click('[data-share-copy]');
    check('앱 자체 공유 회귀', !(await p.evaluate(()=>window.__copied)).includes('#/p/'));
    await p.click('[data-close-modal]');
  });
  await run('기존 회원 로그인 복귀',fixture(false),async p=>{
    await p.goto(WEB+'?from=ig-01#/p/p-public'); await p.locator('#main [data-login]').click();
    const href=await p.locator('#modal a').first().getAttribute('href');
    check('웹 가입 링크에 원글 전달',new URL(href).searchParams.get('returnTo')==='#/p/p-public');
    await p.locator('#modal a').first().click(); await p.fill('#auth-email','flow@dadamom.test'); await p.fill('#auth-password','test-password');
    await p.click('#auth-password-submit'); await p.waitForURL(u=>u.pathname.endsWith('community.html')&&u.hash==='#/p/p-public');
    await p.locator('#cmt-form').waitFor(); check('로그인 후 원글 댓글 참여 가능',true);
  });
  await run('PC 소셜 로그인 복귀',fixture(false),async p=>{
    // 운영처럼 카카오·구글·네이버가 다 켜진 환경
    await p.route('**/env.js',r=>r.fulfill({contentType:'application/javascript',body:'window.DADAMOM_ENV={SUPABASE_URL:"https://example.invalid",SUPABASE_ANON_KEY:"k",NAVER_LOGIN:true};'}));
    await p.goto(WEB+'?from=ig-01#/p/p-public'); await p.locator('#main [data-login]').click();
    check('PC 로그인 창에 카카오·구글·네이버 + 이메일', (await p.$$eval('#modal [data-social]',a=>a.map(x=>x.dataset.social).join(',')))==='kakao,google,custom:naver' && await p.locator('#modal a', { hasText: '인증번호' }).isVisible());
    await p.click('#modal [data-social="custom:naver"]'); await p.waitForFunction(()=>window.__SBSTUB.oauthArgs);
    const a=await p.evaluate(()=>window.__SBSTUB.oauthArgs), u=new URL(a.options.redirectTo);
    check('소셜 로그인 뒤 앱을 거쳐 원글로 복귀', a.provider==='custom:naver' && u.pathname.endsWith('/index.html') && u.searchParams.get('returnTo')==='#/p/p-public' && u.searchParams.get('from')==='ig-01');
  });
  for(const admin of [false, true]) await run('PC 작성자 바꾸기 ' + (admin ? '관리자' : '일반'),fixture(true),async p=>{
    p.removeAllListeners('dialog'); p.on('dialog',d=>d.type()==='prompt' ? d.accept('바뀐이름') : d.accept());
    await p.goto(WEB+'#/p/p-public'); await p.locator('#nav-posts').waitFor({state:'attached'});
    if(admin){ await p.evaluate(()=>{ window.__SBSTUB.admin=true; window.__SBSTUB.signIn('u-flow','flow@dadamom.test'); }); }
    await p.waitForTimeout(800);
    const n=await p.locator('[data-admin-author]').count();
    if(!admin){ check('일반 회원에게는 작성자 버튼 없음', n===0); return; }
    check('관리자에게 작성자 버튼', n===1);
    await p.click('[data-admin-author]');
    await p.waitForFunction(()=>window.__SBSTUB.store.community_posts.find(x=>x.id==='p-public').author==='바뀐이름');
    await p.waitForFunction(()=>document.querySelector('.post-meta .who').textContent.includes('바뀐이름'));
    check('관리자 작성자 바꾸기 → DB·화면 반영', true);
  });
  await run('팝업 배너',fixture(false),async p=>{
    await p.goto(WEB+'#/'); await p.locator('#popup-title').waitFor({state:'visible'});
    check('첫 화면에 팝업', (await p.textContent('#popup-title')).includes('첫걸음 챌린지') && await p.getAttribute('#modal-card','aria-labelledby')==='popup-title');
    await p.click('[data-popup-today]'); check('오늘 하루 보지 않기 → 닫힘', await p.locator('#modal').isHidden());
    await p.reload(); await p.waitForTimeout(1500); check('같은 날 다시 와도 안 뜸', await p.locator('#modal').isHidden());
    await p.evaluate(()=>localStorage.clear()); await p.goto(WEB+'#/p/p-public'); await p.reload(); await p.waitForTimeout(1500);
    check('공유받은 글에서는 안 뜸', await p.locator('#modal').isHidden());
    await p.goto(WEB+'#/'); await p.reload(); await p.locator('#popup-title').waitFor({state:'visible'});
    await p.click('#modal-card a.btn.primary'); await p.waitForURL(u=>u.hash==='#/challenge');
    check('참여하러 가기 → 챌린지, 팝업 닫힘', await p.locator('#modal').isHidden() && !(await p.getAttribute('#modal-card','aria-labelledby')));
  });
  await run('미완성 프로필 복귀',fixture(true,false),async p=>{
    await p.goto(APP+'?returnTo=%23%2Fp%2Fp-public#onboarding');
    await p.locator('[data-type-pick="parenting"]').waitFor({state:'visible'});
    await p.click('[data-type-pick="parenting"]'); await p.locator('[data-role-pick]').first().click();
    await p.fill('#birth-month','2026-01'); await p.click('[data-region="서울"]'); await p.fill('#nickname-input','검증');
    await p.click('#start-btn'); await p.waitForURL(u=>u.pathname.endsWith('community.html')&&u.hash==='#/p/p-public');
    check('프로필 저장 후 원글 복귀',true);
  });
  await run('가입 인증 콜백',fixture(false,false),async p=>{
    await p.goto(APP+'?returnTo=%23%2Fp%2Fp-public&from=ig-01#onboarding');
    await p.click('[data-auth-view="signup"]');
    await p.fill('#auth-email','new@dadamom.test'); await p.fill('#auth-password','abc12345'); await p.fill('#auth-password2','abc12345'); await p.check('#consent-quick');
    await p.click('#join-send'); await p.waitForFunction(()=>!!window.__SBSTUB.signupArgs);
    const callback=await p.evaluate(()=>window.__SBSTUB.signupArgs.options.emailRedirectTo);
    check('가입 인증 메일 복귀 경로 보존',new URL(callback).searchParams.get('returnTo')==='#/p/p-public');
    check('가입 인증 대기 중 임의 복귀 안 함',new URL(p.url()).pathname.endsWith('index.html'));
  });
  await run('프로필 실패 시 복귀 차단',{...fixture(true,false),failProfile:true},async p=>{
    await p.goto(APP+'?returnTo=%23%2Fp%2Fp-public#onboarding');
    await p.locator('[data-type-pick="parenting"]').waitFor({state:'visible'});
    await p.click('[data-type-pick="parenting"]'); await p.locator('[data-role-pick]').first().click();
    await p.fill('#birth-month','2026-01'); await p.click('[data-region="서울"]'); await p.click('#start-btn');
    await p.waitForFunction(()=>window.__SBSTUB.upsertFailure);
    check('저장 실패를 성공 복귀로 처리하지 않음',new URL(p.url()).pathname.endsWith('index.html'));
    check('저장 실패 시 온보딩 유지',new URL(p.url()).hash==='#onboarding');
    check('저장 실패 재시도 안내', (await p.locator('#toast').textContent()).includes('다시 시도'));
  });
  await run('계정/화면 갱신',fixture(),async p=>{
    await p.goto(APP+'#home'); await p.locator('#home-bell').waitFor({state:'visible'}); await p.click('#home-bell');
    await p.evaluate(()=>window.__SBSTUB.signOut());
    await p.waitForFunction(()=>document.getElementById('modal-backdrop').hidden);
    check('로그아웃 시 알림창 닫힘',true);
    await p.evaluate(()=>window.__SBSTUB.signIn('u-flow','flow@dadamom.test'));
    await p.goto(APP+'#community'); await p.locator('#screen-community [data-share-post="p-public"]').waitFor();
    await p.evaluate(()=>{window.__SBSTUB.store.post_likes.push({post_id:'p-public',liker_id:'u-other'});window.dispatchEvent(new Event('focus'));});
    await p.waitForFunction(()=>document.querySelector('[data-like="p-public"]')?.textContent.includes('1') || document.querySelector('[data-postlike="p-public"]')?.textContent.includes('1'));
    check('앱 복귀 시 외부 반응 수 갱신',true);
    await p.goto(WEB+'#/p/p-public'); await p.locator('#cmt-text').fill('작성 중인 댓글');
    await p.evaluate(()=>{window.__SBSTUB.store.post_comments.push({id:'c-flow',post_id:'p-public',content:'다른 댓글',author:'가상',owner_id:'other',created_at:new Date().toISOString()});window.dispatchEvent(new Event('focus'));});
    await p.waitForFunction(()=>document.getElementById('cmt-n').textContent==='1');
    check('웹 머리말/댓글 숫자 동기화',await p.locator('[data-post-comments]').textContent()==='1');
    check('복귀 갱신 시 작성 중 댓글 보존',await p.locator('#cmt-text').inputValue()==='작성 중인 댓글');
  });
  await run('사진 카드',fixture(),async p=>{
    await p.goto(APP+'#home'); await p.locator('#screen-home [data-share-post="p-card"]').waitFor({state:'visible'});
    await p.click('#screen-home [data-goto="growth"]'); await p.locator('[data-share-card]').first().click();
    await p.locator('#share-card-preview img').waitFor();
    const size=await p.locator('#share-card-preview img').evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight}));
    check('카드 실제 출력 크기',size.w===600&&size.h===820);
    const drawn=await p.evaluate(()=>window.__drawn);
    check('카드 본문과 브랜드 세로 분리',drawn.filter(r=>r.y===714||r.y===744).every(r=>r.y+30<786));
    check('카드 긴 글 가로 잘림 방지',drawn.filter(r=>r.y===714||r.y===744).every(r=>r.width<=536));
    const downloadPromise=p.waitForEvent('download'); await p.click('#share-card-download');
    const download=await downloadPromise; await download.saveAs(path.join(artifactDir,'card-long.png'));
    check('실제 PNG 다운로드',fs.statSync(path.join(artifactDir,'card-long.png')).size>1000);
  });
  if(process.env.RUN_BASELINE==='1'){
    const exit=await new Promise(r=>{const c=spawn(process.execPath,[path.join(root,'tests/e2e.spec.js')],{env:{...process.env,BASE_URL:LOCAL,STUB:'1'},stdio:'inherit'});c.on('exit',r);});
    check('기존 E2E 회귀',exit===0);
  }
  console.log(`완료: ${passed}개 통과. 스텁 검증이며 실제 DB/소셜/실기기 검증 아님. PNG: ${artifactDir}`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
