// 밝은 커뮤니티 디자인 회귀. 모든 외부 통신을 가로채므로 실제 DB를 읽거나 수정하지 않는다.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=(await fs.readFile(path.join(root,'config/env.staging.js'),'utf8')).replaceAll('__BUILD__','warm-ui-test');
assert(env.includes('srxdtddrtnhtlbbviyvs.supabase.co'));
let stub=await fs.readFile(path.join(root,'tests/supabase-stub.js'),'utf8');
stub=stub.replace('var api = {',`var api = {
  range:function(){return api;}, lt:function(){return api;}, gt:function(){return api;}, lte:function(){return api;},
  ilike:function(){return api;}, like:function(){return api;},`);
stub+=`\n(function(){
  Object.assign(window.__SBSTUB.store,window.__warmFixture);
  const create=window.supabase.createClient;
  window.supabase.createClient=function(){const client=create();const on=client.auth.onAuthStateChange;
    client.auth.onAuthStateChange=function(fn){const result=on(fn);queueMicrotask(()=>fn('INITIAL_SESSION',null));return result;};return client;};
})();`;
const server=http.createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname==='/env.js'){res.writeHead(200,{'Content-Type':'application/javascript'}).end(env);return;}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git')||file.includes(path.sep+'node_modules')){res.writeHead(403).end();return;}
  try{const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.ico':'image/x-icon'})[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const out=path.join(root,'test-results','warm-ui');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();let passed=0;const errors=[],network=[];
const check=(name,value)=>{assert(value,name);passed++;};
function luminance(color){const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
try{
  for(const width of [320,360,390,430,768,1024,1440]){
    const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    await ctx.addInitScript(()=>{
      window.__warmFixture={community_posts:[{id:'warm-post',author:'가상부모',text:'[질문] 작은 일상의 이야기\n부모들과 나누는 테스트 이야기입니다.',status:'approved',created_at:new Date().toISOString(),likes:0,comments:0}],
        challenge_entries:[{id:'warm-entry',name:'우리 아이',status:'approved',created_at:new Date().toISOString(),votes:0}],notices:[],outings:[],post_comments:[],mall_products:[],mall_brands:[],mall_banners:[]};
    });
    await ctx.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.href.includes('supabase-js@2'))return route.fulfill({contentType:'application/javascript',body:stub});
      if(u.origin!==base){network.push(u.origin);return route.fulfill({contentType:'text/css',body:''});}
      return route.continue();
    });
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    for(const hash of ['#/','#/b/all','#/challenge','#/brand','#/outing']){
      await page.goto(base+'/community.html'+hash);
      await page.locator('#main h1, #main h2').first().waitFor();
      if(hash==='#/') await page.locator('.fc-invite').waitFor();
      await page.evaluate(async()=>{await document.fonts.ready;});
      const data=await page.evaluate(()=>{
        const button=document.querySelector('.btn.primary');const s=button&&getComputedStyle(button);
        const hero=document.querySelector('.feature-ch, .ch-hero');const h=hero&&getComputedStyle(hero);
        return {width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
          bg:getComputedStyle(document.body).backgroundColor,button:s&&s.backgroundColor,ink:s&&s.color,
          hero:h&&h.backgroundImage,testVisible:!document.querySelector('#web-test-label').hidden};
      });
      check(width+' '+hash+' 가로 넘침 없음',data.scroll<=data.width);
      check(width+' '+hash+' 밝은 바탕',luminance(data.bg)>.85);
      check(width+' '+hash+' 밝은 주요 버튼',luminance(data.button)>.6);
      const a=luminance(data.button),b=luminance(data.ink);
      check(width+' '+hash+' 버튼 대비 4.5 이상',(Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
      check(width+' '+hash+' 테스트 환경 표시',data.testVisible);
      check(width+' '+hash+' 실제 둥근 폰트 로드',await page.evaluate(()=>document.fonts.check('700 16px "NanumSquareRound"','따뜻한 우리 아이')&&document.fonts.check('800 25px "NanumSquareRound"','첫걸음 챌린지')&&getComputedStyle(document.body).fontFamily.startsWith('NanumSquareRound')));
      check(width+' '+hash+' 본문 굵기 보강',await page.evaluate(()=>Number(getComputedStyle(document.body).fontWeight)>=700));
      if(data.hero)check(width+' '+hash+' 어두운 히어로 없음',!data.hero.includes('30, 26, 23'));
      if(hash==='#/'){
        check(width+' 빈 칸 채우기용 타일 없음',await page.locator('#home-ch > *').count()===2);
        check(width+' 사진 없는 참가작 제목',await page.locator('.fc-entry-name').textContent()==='우리 아이');
        check(width+' 알약형 참여 버튼',await page.locator('.feature-ch .cta .btn.primary').evaluate(el=>parseFloat(getComputedStyle(el).borderTopLeftRadius)>=24));
        check(width+' 둥근 선택 메뉴',await page.locator('#nav .on').evaluate(el=>parseFloat(getComputedStyle(el).borderTopLeftRadius)>=24));
        if(width<=430){
          const rect=await page.locator('.feature-ch .cta .btn.primary').boundingBox();check(width+' 모바일 참여 버튼 44px',rect.height>=44);
        }
        if(width===390||width===1440)await page.screenshot({path:path.join(out,'home-'+width+'.png'),fullPage:true});
        if(width===1440){
          const btn=page.locator('.feature-ch .cta .btn.primary');await btn.hover();
          await page.waitForFunction(()=>getComputedStyle(document.querySelector('.feature-ch .cta .btn.primary')).transform!=='none');
          check('마우스 올림 반응',await btn.evaluate(el=>getComputedStyle(el).boxShadow!=='none'));
          const r=await btn.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
          await page.waitForFunction(()=>getComputedStyle(document.querySelector('.feature-ch .cta .btn.primary')).transform.match(/matrix\(([^,]+)/)?.[1]<1);
          check('누르면 들어가는 반응',await btn.evaluate(el=>el.matches(':active')));await page.mouse.move(0,0);await page.mouse.up();
        }
        await page.locator('.skip-link').focus();await page.locator('.skip-link').press('Enter');
        check(width+' 본문 이동 시 SPA 경로 유지',new URL(page.url()).hash==='#/');
        check(width+' 본문 키보드 초점',await page.locator('#main').evaluate(el=>el===document.activeElement));
      }
    }
    // 참가작이 없을 때도 빈 그리드 대신 한 개의 안내 카드만 보여준다.
    await page.evaluate(()=>{window.__SBSTUB.store.challenge_entries=[];});
    await page.locator('#nav a[href="#/"]').click();await page.locator('#home-ch.is-empty').waitFor();
    check(width+' 참가작 0개 안내 카드',await page.locator('#home-ch > *').count()===1);
    await page.getByRole('button',{name:'로그인',exact:true}).first().click();
    await page.locator('#l-email').waitFor();
    check(width+' 로그인 창 유지',await page.locator('#login-form').isVisible());
    await ctx.close();console.log('PASS '+width+'px 홈·게시판·챌린지·브랜드관·나들이·로그인');
  }
  check('런타임 오류 없음',errors.length===0);
  check('외부 DB 요청 없음',network.every(u=>u.includes('cdn.jsdelivr.net')));
  console.log('완료: '+passed+'개 검증 통과. 외부 통신은 스텁/차단, 실제 DB 변경 없음.');
  console.log('화면: '+out);
}finally{await browser.close();await new Promise(r=>server.close(r));}
