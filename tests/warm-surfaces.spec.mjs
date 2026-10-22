// 상세 화면·앱까지 밝은 테마가 이어지는지 검증한다. 외부 통신·실제 DB는 모두 차단한다.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=(await fs.readFile(path.join(root,'config/env.staging.js'),'utf8')).replaceAll('__BUILD__','warm-surfaces-test');
assert(env.includes('srxdtddrtnhtlbbviyvs.supabase.co'));
let stub=(await fs.readFile(path.join(root,'tests/supabase-stub.js'),'utf8')).replace(/\r\n/g,'\n');
stub=stub.replace('var api = {',`var api = {
  range:function(){return api;}, lt:function(c,v){filters.push(r=>r[c]<v);return api;},
  gt:function(c,v){filters.push(r=>r[c]>v);return api;}, lte:function(){return api;},
  ilike:function(){return api;}, like:function(){return api;},`);
stub+=`\n(function(){
  const S=window.__SBSTUB,F=window.__warmFixture;
  Object.assign(S.store,F.store);S.setSession(F.session);S.curId=F.session&&F.session.user.id;
  const create=window.supabase.createClient;
  window.supabase.createClient=function(){const c=create(),on=c.auth.onAuthStateChange;
    c.auth.onAuthStateChange=function(f){const r=on(f);queueMicrotask(()=>f('INITIAL_SESSION',F.session));return r;};return c;};
})();`;
const server=http.createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname==='/env.js'){res.writeHead(200,{'Content-Type':'application/javascript'}).end(env);return;}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git')||file.includes(path.sep+'node_modules')){res.writeHead(403).end();return;}
  try{const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'application/javascript','.png':'image/png','.ico':'image/x-icon'})[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const out=path.join(root,'test-results','warm-surfaces');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();const errors=[],blocked=[];let passed=0;
const check=(name,value)=>{assert(value,name);passed++;};
function lum(color){const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function setup(width,loggedIn=true){
  const ctx=await browser.newContext({viewport:{width,height:width<=430?720:900},serviceWorkers:'block',colorScheme:'dark'});
  const now=new Date().toISOString();
  await ctx.addInitScript(f=>{window.__warmFixture=f;}, {
    session:loggedIn?{user:{id:'warm-user',email:'warm@dadamom.test'}}:null,
    store:{profiles:[{id:'warm-user',nickname:'햇살부모',onboarded:true,kid_type:'parenting',parent_role:'mom',birth_month:'2026-01',region:'서울'}],
      community_posts:[{id:'warm-post',owner_id:'other-user',author:'가상부모',text:'[질문] 아이와 따뜻한 하루를 보내는 방법이 궁금해요\n처음 맞는 작은 순간들을 함께 이야기하고 싶어요.',status:'approved',created_at:now,likes:0,comments:1,media_path:'other-user/test.png'}],
      post_comments:[{id:'warm-cmt',post_id:'warm-post',owner_id:'other-user',author:'봄빛부모',content:'오늘도 작은 한 걸음, 함께 응원해요.',created_at:now}],
      post_bookmarks:[],post_likes:[],entry_votes:[],challenge_entries:[],notices:[],
      outings:[{id:'warm-outing',title:'아이와 천천히 걷는 봄빛 공원',category:'spot',region:'서울',place:'가상 공원',description:'가족이 함께 산책하기 좋은 곳입니다.',sort_order:0}],
      mall_brands:[{id:'warm-brand',name:'햇살 브랜드',intro:'가족의 따뜻한 일상을 위한 물건들',is_featured:true,is_new:true,visible:true,store_url:'',sort_order:0}],
      mall_products:[{id:'warm-product',brand_id:'warm-brand',name:'포근한 하루를 위한 아이 담요',price:25000,sale_price:20000,is_deal:true,visible:true,sort_order:0}],
      mall_banners:[{id:'warm-banner',title:'따뜻한 일상을 만나요',subtitle:'가족을 위한 작은 발견',bg:'#FFF3E4',link_url:'#/brand/warm-brand',visible:true}]
    }
  });
  await ctx.route('**/*',async r=>{
    const u=new URL(r.request().url());
    if(u.href.includes('supabase-js@2'))return r.fulfill({contentType:'application/javascript',body:stub});
    if(u.hostname==='cdn.jsdelivr.net'||u.hostname.startsWith('fonts.'))return r.fulfill({contentType:'text/css',body:''});
    if(u.origin!==base){blocked.push(u.origin+u.pathname);return r.abort();}
    return r.continue();
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page};
}
async function noOverflow(page,label){
  const v=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth,bg:getComputedStyle(document.body).backgroundColor}));
  check(label+' 가로 넘침 없음',v.s<=v.w);check(label+' 밝은 바탕',lum(v.bg)>.85);
}
async function brightButton(page,selector,label){
  const s=await page.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,ink:s.color};});
  check(label+' 밝은 버튼',lum(s.bg)>.6);check(label+' 버튼 대비 4.5 이상',contrast(s.bg,s.ink)>=4.5);
}
try{
  for(const width of [320,360,390,430,768,1024,1440]){
    const {ctx,page}=await setup(width);
    for(const hash of ['#/p/warm-post','#/write','#/my','#/brand','#/brand/warm-brand','#/outing']){
      await page.goto(base+'/community.html'+hash);await page.locator('#main h1').first().waitFor();
      await noOverflow(page,width+' 웹 '+hash);
      if(hash==='#/p/warm-post'){
        await page.locator('#cmt-form').waitFor();
        check(width+' 댓글 입력 16px',await page.locator('#cmt-text').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
        check(width+' 상세 도구 44px',await page.locator('.post-act .link-btn').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)));
        await page.locator('[data-zoom]').click();await page.locator('.lightbox').waitFor();
        check(width+' 사진 확대 밝은 표면',lum(await page.locator('.lightbox').evaluate(el=>getComputedStyle(el).backgroundColor))>.9);
        await page.locator('[data-close]').click();
      }
      if(hash==='#/write'){
        await page.locator('#write-form').waitFor();await brightButton(page,'#w-submit',width+' 글쓰기');
        await page.locator('#w-title').focus();
        check(width+' 입력 초점 표시',await page.locator('#w-title').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
      }
      if(hash==='#/brand'){
        await page.locator('.prod').first().waitFor();
        check(width+' 브랜드 상품 존재',await page.locator('.prod').count()>0);
      }
      if(hash==='#/brand/warm-brand')await page.locator('.brand-head h1').waitFor();
      if(width===390&&hash==='#/write')await page.screenshot({path:path.join(out,'write-390.png'),fullPage:true});
    }
    // 연결되는 앱 화면도 동일한 팔레트와 선택 상태를 유지해야 한다.
    for(const hash of ['#home','#challenge','#community','#benefit','#outing','#growth','#my']){
      await page.goto(base+'/index.html'+hash);
      // 초기 HTML에는 여러 screen이 있다. 인증/프로필 초기화 후 목적 화면 하나만 남을 때 검사한다.
      await page.waitForFunction(id=>{const visible=[...document.querySelectorAll('.screen:not([hidden])')];return visible.length===1&&visible[0].id===id;},'screen-'+hash.slice(1));
      await noOverflow(page,width+' 앱 '+hash);
      check(width+' 앱 TEST 표시',await page.locator('#test-banner').isVisible());
      const nav=page.locator('.screen:not([hidden]) .navbar button.active');
      if(await nav.count()){
        const s=await nav.first().evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,ink:s.color};});
        check(width+' '+hash+' 선택 메뉴 밝음',lum(s.bg)>.85);
        check(width+' '+hash+' 선택 메뉴 대비',contrast(s.bg,s.ink)>=4.5);
      }
      if(hash==='#challenge'){
        await brightButton(page,'[data-open-challenge-modal]',width+' 앱 참여');
        await page.locator('[data-open-challenge-modal]').click();await page.locator('#modal-backdrop:not([hidden])').waitFor();
        check(width+' 앱 참여 창 밝음',lum(await page.locator('.modal-card').evaluate(el=>getComputedStyle(el).backgroundColor))>.9);
        await page.locator('[data-close-modal]').first().click();
      }
      if(width===390&&hash==='#challenge')await page.screenshot({path:path.join(out,'app-challenge-390.png'),fullPage:true});
    }
    await ctx.close();
    // 가입·로그인 창은 작은 높이에서도 닫기 버튼까지 내부 스크롤로 도달할 수 있다.
    const guest=await setup(width,false);await guest.page.setViewportSize({width,height:600});
    await guest.page.goto(base+'/community.html#/write');
    await guest.page.locator('#main [data-login]').click();await guest.page.locator('#l-email').waitFor();
    const modal=await guest.page.locator('#modal-card').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {top:r.top,bottom:r.bottom,height:innerHeight,overflow:s.overflowY,bg:s.backgroundColor};});
    check(width+' 로그인 창 화면 안',modal.top>=0&&modal.bottom<=modal.height+1);
    check(width+' 로그인 창 스크롤',modal.overflow==='auto');
    check(width+' 로그인 창 밝은 표면',lum(modal.bg)>.9);
    await guest.page.locator('#modal-card [data-close]').click();check(width+' 로그인 창 닫기',await guest.page.locator('#modal').isHidden());
    await guest.page.goto(base+'/index.html#onboarding');await guest.page.locator('#auth-email').waitFor();
    check(width+' 앱 가입 입력 16px',await guest.page.locator('#auth-email').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
    await guest.ctx.close();
    console.log('PASS '+width+'px 웹 상세·글쓰기·마이·브랜드·나들이 / 앱 7화면 / 로그인');
  }
  const {ctx,page}=await setup(320,false);
  for(const file of ['404.html','offline.html','delete-account.html']){
    await page.goto(base+'/'+file);await noOverflow(page,file);await brightButton(page,file==='404.html'?'a.primary':file==='offline.html'?'button':'a.btn',file);
  }
  await page.goto(base+'/index.html#onboarding');await page.locator('#auth-email').waitFor();
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  check('남은 다크 테마 속성도 밝게 유지',await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme==='light'));
  await ctx.close();check('런타임 오류 없음',errors.length===0);check('외부 DB·운영 요청 없음',blocked.length===0);
  console.log('완료: '+passed+'개 검증 통과. 실제 DB·회원 데이터 변경 없음.');
  console.log('화면: '+out);
}finally{if(errors.length)console.error(errors);if(blocked.length)console.error(blocked);await browser.close();await new Promise(r=>server.close(r));}
