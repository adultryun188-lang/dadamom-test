// 네이버 연결 전/후 UI와 OAuth 시작 계약 검증. 외부 인증/DB 요청은 전부 차단한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const staging = fs.readFileSync(path.join(root, 'config/env.staging.js'), 'utf8');
assert(staging.includes('srxdtddrtnhtlbbviyvs.supabase.co'));
assert(/NAVER_LOGIN:\s*(?:'preview'|true|false)/.test(staging), '명시적인 네이버 환경 설정 필요');
let passed = 0;
function check(label, ok){ assert(ok, label); console.log('PASS ' + label); passed++; }

// UI를 우회해 핸들러를 호출해도 설정 누락·미완료 상태에서는 OAuth를 호출하지 않는다.
const handler = html.slice(html.indexOf('  var naverSignInPending = false;'), html.indexOf('  async function handlePasswordAuth('));
const labelHtml = html.slice(html.indexOf('  function naverButtonLabelHtml('), html.indexOf('  function authModalHtml('));
for(const mode of [undefined, false, 'preview', 'true']){
  let calls = 0;
  const hint = {textContent:''};
  const box = { ENV:{NAVER_LOGIN:mode}, document:{getElementById:()=>hint}, window:{addEventListener(){}},
    sb:{auth:{signInWithOAuth:async()=>{calls++;return {error:null};}}}, authCallbackUrl:()=>'' };
  vm.createContext(box); vm.runInContext(labelHtml + handler, box);
  await box.handleNaverSignIn();
  check('설정 미완료 OAuth 차단 ' + String(mode), calls === 0 && hint.textContent.includes('준비 중'));
}

const stub = fs.readFileSync(path.join(root, 'tests/supabase-stub.js'), 'utf8') + `
(function(){
  const create=window.supabase.createClient;
  window.supabase.createClient=function(){
    const c=create(); window.__naverCalls=[];
    c.auth.signInWithOAuth=async function(args){
      window.__naverCalls.push(args);
      if(window.__oauthBehavior==='throw') throw Error('SECRET-DO-NOT-SHOW');
      if(window.__oauthBehavior==='error') return {error:{message:'SECRET-DO-NOT-SHOW'}};
      return {error:null};
    };
    return c;
  };
})();`;
const server = http.createServer((req,res)=>{
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = {'/':'index.html','/index.html':'index.html','/community-flow.js':'community-flow.js'}[pathname];
  if(!file){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript'});
  res.end(fs.readFileSync(path.join(root,file)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const local = 'http://127.0.0.1:' + server.address().port + '/';
const base = process.env.BASE_URL || local;
const target = new URL(base);
assert(['127.0.0.1','localhost'].includes(target.hostname) ||
  (target.origin === 'https://adultryun188-lang.github.io' && target.pathname === '/dadamom-test/'), '테스트 앱만 허용');
const browser = await chromium.launch();
async function run(name, mode, test, social=true, width=390){
  const ctx = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  const page = await ctx.newPage(), errors=[], external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/*', async route=>{
    const url = new URL(route.request().url());
    if(url.href.includes('/supabase-js@2')) return route.fulfill({contentType:'application/javascript',body:stub});
    if(url.hostname.includes('fonts.')) return route.fulfill({contentType:'text/css',body:''});
    if(url.origin !== target.origin || (target.hostname==='adultryun188-lang.github.io' && !url.pathname.startsWith('/dadamom-test/'))){
      external.push(url.origin+url.pathname);return route.abort();
    }
    if(url.pathname.endsWith('/env.js')){
      let env = staging.replace(/NAVER_LOGIN:\s*[^,\r\n]+/, 'NAVER_LOGIN: ' + (mode===undefined?'undefined':JSON.stringify(mode)));
      env = env.replace(/SOCIAL_LOGIN: true/, 'SOCIAL_LOGIN: ' + social).replaceAll('__BUILD__','naver-regression');
      return route.fulfill({contentType:'application/javascript',body:env});
    }
    return route.continue();
  });
  try{
    await page.goto(new URL('index.html#onboarding',base).href);
    await page.locator('#auth-email:visible').waitFor();
    await test(page);
    check(name+' JS 오류 없음',errors.length===0);
    check(name+' 운영/외부 DB·인증 호출 없음',external.length===0);
  }finally{await ctx.close();}
}
try{
  for(const mode of [undefined,false,'true']) await run('숨김 '+mode,mode,async p=>{
    check('비활성/누락 시 네이버 버튼 숨김 '+mode,await p.locator('#naver-signin-btn').count()===0);
    check('카카오·구글 유지 '+mode,await p.locator('#kakao-signin-btn').count()===1 && await p.locator('#google-signin-btn').count()===1);
  });
  for(const width of [320,360,390,430]) await run('준비 화면 '+width,'preview',async p=>{
    check('네이버 버튼 연결 전 비활성 '+width,await p.locator('#naver-signin-btn').isDisabled());
    check('연결 준비 안내 '+width,(await p.locator('#naver-login-note').textContent()).includes('연결 준비 중'));
    check('로그인 시작 요청 0 '+width,await p.evaluate(()=>window.__naverCalls.length)===0);
    check('가로 넘침 없음 '+width,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await p.click('[data-auth-mode="signup"]');
    check('회원가입 화면도 네이버 표시 '+width,await p.locator('#naver-signin-btn').isVisible());
    if(width===390 && process.env.SCREENSHOT_PATH) await p.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
  },true,width);
  await run('네이버 단독 표시','preview',async p=>{
    check('카카오·구글 꺼도 네이버 준비 버튼 유지',await p.locator('#naver-signin-btn').isVisible() && await p.locator('#google-signin-btn').count()===0);
  },false);
  await run('기존 이메일 전용',false,async p=>{
    check('기존 이메일 전용 안내 유지',(await p.locator('body').textContent()).includes('이 환경에서는 이메일 로그인만 됩니다'));
  },false);
  for(const returnTo of ['#/p/naver-test','#challenge','#benefit','https://evil.test/']){
    await run('네이버 OAuth 계약 '+returnTo,true,async p=>{
      const entry = new URL('index.html',base); entry.hash='onboarding';
      entry.searchParams.set('returnTo',returnTo);entry.searchParams.set('from','naver-qa');entry.searchParams.set('code','NEVER-FORWARD');
      await p.goto(entry.href);await p.locator('#naver-signin-btn').click();
      const args=await p.evaluate(()=>window.__naverCalls[0]);
      check('custom:naver로만 요청 '+returnTo,args.provider==='custom:naver');
      check('공개된 openid profile scope '+returnTo,args.options.scopes==='openid profile');
      const callback=new URL(args.options.redirectTo);
      check('같은 테스트 환경 복귀 '+returnTo,callback.origin===target.origin && callback.pathname===new URL('index.html',base).pathname);
      check('허용된 원글/광고 복귀만 보존 '+returnTo,callback.searchParams.get('returnTo')===(returnTo.startsWith('#')?returnTo:null));
      check('인증 코드 전달 금지 '+returnTo,!callback.searchParams.has('code'));
      check('가입 유입 경로 보존 '+returnTo,callback.searchParams.get('from')==='naver-qa');
      // dispatchEvent로 빠른 중복 클릭까지 검증. SDK는 스텁이라 실제 이동하지 않는다.
      await p.locator('#naver-signin-btn').dispatchEvent('click');
      check('중복 OAuth 차단 '+returnTo,await p.evaluate(()=>window.__naverCalls.length)===1);
      await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      check('인증 화면 뒤로가기 버튼 복원 '+returnTo,await p.locator('#naver-signin-btn').isEnabled() && await p.locator('#naver-signin-btn svg').count()===1);
    });
  }
  for(const behavior of ['error','throw']) await run('오류 재시도 '+behavior,true,async p=>{
    await p.evaluate(b=>window.__oauthBehavior=b,behavior);
    await p.locator('#naver-signin-btn').click();
    await p.locator('#auth-hint').filter({hasText:'시작하지 못했어요'}).waitFor();
    check('오류 후 버튼·로고 복원 '+behavior,await p.locator('#naver-signin-btn').isEnabled() && await p.locator('#naver-signin-btn svg').count()===1);
    check('SDK 원문/민감값 화면 출력 안 함 '+behavior,!(await p.locator('body').textContent()).includes('SECRET-DO-NOT-SHOW'));
    await p.locator('#naver-signin-btn').click();
    check('다시 시도 가능 '+behavior,await p.evaluate(()=>window.__naverCalls.length)===2);
  });
  console.log('네이버 로그인 계약/UI 검증: '+passed+'개 통과. 실제 OAuth 왕복·동의 취소·토큰 발급은 미검증.');
}finally{
  await browser.close(); await new Promise(resolve=>server.close(resolve));
}
