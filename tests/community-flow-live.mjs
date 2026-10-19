// 실제 테스트 DB + UI. 운영 주소 차단, 일반 테스트 계정만 사용, 생성 데이터/반응 원상복구.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
assert.equal(process.env.LIVE,'1','LIVE=1을 명시해야 실제 테스트 DB 검증을 실행합니다');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=fs.readFileSync(path.join(root,'config/env.staging.js'),'utf8');
const DB=env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], KEY=env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(DB).hostname,'srxdtddrtnhtlbbviyvs.supabase.co');
const pw=fs.readFileSync(path.join(root,'CLAUDE.md'),'utf8').match(/비밀번호 전부 `([^`]+)`/)[1];
const email='momA@dadamom.test', tag='[복구검증 20261019 '+randomUUID().slice(0,8)+']';
let passed=0;
function check(name,ok){assert(ok,name);console.log('PASS '+name);passed++;}
async function request(route,method='GET',body,token){
  const res=await fetch(DB+route,{method,signal:AbortSignal.timeout(15000),headers:{apikey:KEY,Authorization:'Bearer '+(token||KEY),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await res.text();
  if(!res.ok) throw Error(method+' '+route.split('?')[0]+' HTTP '+res.status);
  return text?JSON.parse(text):null;
}
const auth=await request('/auth/v1/token?grant_type=password','POST',{email,password:pw});
const token=auth.access_token, uid=auth.user.id;
const own=(route,method='GET',body)=>request(route,method,body,token);
const posts=await request('/rest/v1/community_posts?select=id,owner_id,status&status=eq.approved&owner_id=neq.'+uid+'&order=created_at.desc&limit=10');
assert(posts.length,'공개 테스트 글이 없어 관리자 승인 없이 진행할 수 없음');
const post=posts[0];
const likes='/rest/v1/post_likes?post_id=eq.'+post.id+'&liker_id=eq.'+uid;
const marks='/rest/v1/post_bookmarks?post_id=eq.'+post.id+'&user_id=eq.'+uid;
const wasLike=(await own(likes)).length>0, wasMark=(await own(marks)).length>0;
const pendingId=randomUUID(); let pendingCreated=false;
let server;
if(!process.env.BASE_URL){
  server=http.createServer((req,res)=>{
    let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(file===root)file=path.join(root,'index.html');
    if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git')||file.includes(path.sep+'node_modules')){res.writeHead(403).end();return;}
    if(path.basename(file)==='env.js'){res.writeHead(200,{'Content-Type':'application/javascript'}).end(env.replaceAll('__BUILD__','flow-live'));return;}
    const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};
    fs.readFile(file,(err,data)=>res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(err?'':data));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
}
const BASE=process.env.BASE_URL||'http://127.0.0.1:'+server.address().port+'/';
const base=new URL(BASE);
assert(['localhost','127.0.0.1'].includes(base.hostname)||(base.origin==='https://adultryun188-lang.github.io'&&base.pathname==='/dadamom-test/'),'STOP: 테스트 주소만 허용');
const APP=new URL('index.html',BASE).href, WEB=new URL('community.html',BASE).href;
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const errors=[],blocked=[];
await ctx.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if((u.hostname.endsWith('.supabase.co')&&u.origin!==DB)||(u.hostname==='adultryun188-lang.github.io'&&!u.pathname.startsWith('/dadamom-test/'))){blocked.push(u.origin+u.pathname);return r.abort();}
  if(u.hostname.includes('fonts.'))return r.fulfill({contentType:'text/css',body:''});
  await r.continue();
});
await ctx.addInitScript(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{window.__copied=t;}}});});
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
try{
  await page.goto(WEB+'#/p/'+post.id);
  await page.locator('#main [data-login]').click(); await page.locator('#modal a').click();
  await page.fill('#auth-email',email); await page.fill('#auth-password',pw); await page.click('#auth-password-submit');
  await page.waitForURL(u=>u.pathname.endsWith('community.html')&&u.hash==='#/p/'+post.id);
  await page.locator('#cmt-form').waitFor();check('실제 이메일 로그인 후 원글 복귀',true);
  const before=await own('/rest/v1/community_posts?select=comments&id=eq.'+post.id);
  await page.fill('#cmt-text',tag+' 가상 댓글, 검증 후 삭제'); await page.click('#cmt-submit');
  await page.waitForFunction(()=>document.getElementById('cmt-text').value==='');
  const comments=await own('/rest/v1/post_comments?select=id,content&post_id=eq.'+post.id+'&owner_id=eq.'+uid);
  check('실제 댓글 DB 저장',comments.some(c=>c.content.startsWith(tag)));
  await page.waitForFunction(n=>document.getElementById('cmt-n').textContent===String(n),before[0].comments+1);
  check('상세 상단/댓글 숫자 일치',await page.locator('[data-post-comments]').textContent()===await page.locator('#cmt-n').textContent());
  await page.click('#like-btn'); await page.waitForFunction(v=>document.getElementById('like-btn').getAttribute('aria-pressed')===String(v),!wasLike);
  check('실제 좋아요 DB 토글',(await own(likes)).length===(wasLike?0:1));
  const count=await own('/rest/v1/community_posts?select=likes&id=eq.'+post.id);
  check('좋아요 상단/하단/DB 일치',await page.locator('#like-n').textContent()===String(count[0].likes)&&await page.locator('[data-post-likes]').textContent()===String(count[0].likes));
  await page.click('#save-btn');await page.waitForFunction(v=>document.getElementById('save-btn').getAttribute('aria-pressed')===String(v),!wasMark);
  check('실제 북마크 DB 토글',(await own(marks)).length===(wasMark?0:1));
  await page.goto(APP+'#community');await page.locator('#screen-community [data-peer-toggle="all"]').click();
  await page.locator('#screen-community [data-share-post="'+post.id+'"]').waitFor();
  await page.click('#screen-community [data-share-post="'+post.id+'"]');await page.click('[data-share-copy]');
  await page.waitForFunction(()=>window.__copied.includes('#/p/'));
  check('실제 공개 글 공유 호출의 정확한 목적지',(await page.evaluate(()=>window.__copied)).endsWith(WEB+'#/p/'+post.id));
  await page.click('[data-close-modal]');
  // 검수 상태 확인용 텍스트 fixture. 승인 상태를 조작하거나 관리자 계정을 쓰지 않는다.
  await own('/rest/v1/community_posts','POST',{id:pendingId,author:'검증용 가상부모',text:tag+' 가상 글, 검증 후 삭제',stage:'parenting',age_value:16});pendingCreated=true;
  await page.goto(APP+'#home');await page.locator('#screen-home [data-goto="community"]').click();
  await page.locator('#screen-community [data-peer-toggle="all"]').click();
  await page.locator('#screen-community [data-share-post="'+pendingId+'"]').click();
  check('대기 글 공유창 열리지 않음',await page.locator('#modal-backdrop').isHidden());
  check('대기 글 공유 제한 안내', (await page.locator('#toast').textContent()).includes('공개 승인'));
  check('대기 글 비로그인 DB 접근 차단',(await request('/rest/v1/community_posts?select=id&id=eq.'+pendingId)).length===0);
  await page.goto(APP+'#home');await page.locator('#home-bell').click();
  const other=await ctx.newPage(); await other.goto(WEB+'#/p/'+post.id);await other.locator('[data-logout]').first().click();
  await page.waitForFunction(()=>document.getElementById('modal-backdrop').hidden);
  check('다른 화면 로그아웃 시 앱 알림창 닫힘',true);await other.close();
  check('실제 UI JS 오류 없음',errors.length===0);
  check('운영/다른 DB 요청 없음',blocked.length===0);
}finally{
  const leftover=await own('/rest/v1/post_comments?select=id,content&post_id=eq.'+post.id+'&owner_id=eq.'+uid);
  for(const c of leftover.filter(c=>c.content.startsWith(tag)))await own('/rest/v1/post_comments?id=eq.'+c.id+'&owner_id=eq.'+uid,'DELETE');
  if(wasLike){if(!(await own(likes)).length)await own('/rest/v1/post_likes','POST',{post_id:post.id,liker_id:uid});}else await own(likes,'DELETE');
  if(wasMark){if(!(await own(marks)).length)await own('/rest/v1/post_bookmarks','POST',{post_id:post.id,user_id:uid});}else await own(marks,'DELETE');
  if(pendingCreated)await own('/rest/v1/community_posts?id=eq.'+pendingId+'&owner_id=eq.'+uid,'DELETE');
  const comments=await own('/rest/v1/post_comments?select=content&post_id=eq.'+post.id+'&owner_id=eq.'+uid);
  check('검증 댓글 정리',!comments.some(c=>c.content.startsWith(tag)));
  check('좋아요 원상복구',(await own(likes)).length===(wasLike?1:0));
  check('북마크 원상복구',(await own(marks)).length===(wasMark?1:0));
  check('검증 글 정리',(await own('/rest/v1/community_posts?select=id&id=eq.'+pendingId)).length===0);
  await browser.close();if(server)await new Promise(r=>server.close(r));
}
console.log(`실제 테스트 DB/UI ${passed}개 통과. 관리자·스키마·운영 변경 없음. 신규 가입/소셜/아이폰 실기기는 미검증.`);
