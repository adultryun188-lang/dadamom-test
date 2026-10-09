// node crawl.js [scenario]  — 로컬 QA 크롤러
const { chromium } = require('playwright');
const BASE = 'http://localhost:8765/qa.html';
const A = '22222222-2222-2222-2222-222222222222', ADM = '11111111-1111-1111-1111-111111111111', NEW = '44444444-4444-4444-4444-444444444444';
const ROUTES = ['home','challenge','benefit','community','outing','growth','my','admin','policy','terms','onboarding'];
const SKIP = /삭제|탈퇴|로그아웃|신고|차단|delete|logout/i;
const issues = [];
function add(sc, where, msg){ const k = sc+'|'+where+'|'+msg; if(!issues.find(i=>i.k===k)) issues.push({k, sc, where, msg}); }

async function check(page, sc, where){
  const r = await page.evaluate(() => {
    const out = [];
    const vis = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display!=='none' && s.visibility!=='hidden' && b.width>0 && b.height>0; };
    const t = document.body.innerText;
    const bad = t.match(/.{0,20}(undefined|NaN|\[object Object\]|null개|null명|Invalid Date).{0,20}/g);
    if(bad) out.push('텍스트: ' + bad.slice(0,3).join(' / '));
    if(document.documentElement.scrollWidth > window.innerWidth + 1) {
      const wide = [...document.querySelectorAll('body *')].filter(e => vis(e) && e.getBoundingClientRect().right > window.innerWidth + 1).slice(0,3).map(e => e.tagName + '.' + (e.className||'') + '#' + e.id + ':' + (e.innerText||'').slice(0,20));
      out.push('가로넘침 ' + document.documentElement.scrollWidth + ' ' + wide.join(', '));
    }
    const ids = {}; document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id]||0)+1; });
    const dup = Object.keys(ids).filter(k => ids[k] > 1);
    if(dup.length) out.push('중복id ' + dup.join(','));
    document.querySelectorAll('img').forEach(i => { if(vis(i) && i.complete && i.naturalWidth===0 && i.src && !i.src.startsWith('https://x/')) out.push('깨진이미지 ' + i.src.slice(0,60)); });
    return out;
  });
  r.forEach(m => add(sc, where, m));
}

async function run(sc){
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  let where = 'load';
  page.on('pageerror', e => add(sc, where, 'JS오류 ' + e.message));
  page.on('console', m => { if(m.type()==='error' && !/Failed to load resource|favicon|x\/|net::/.test(m.text())) add(sc, where, 'console ' + m.text().slice(0,160)); });
  page.on('dialog', d => { add(sc, where, 'dialog(' + d.type() + ') ' + d.message().slice(0,80)); d.dismiss().catch(()=>{}); });
  await page.route('**/env.js*', r => r.fulfill({ path: __dirname + '/env.js', contentType: 'application/javascript' }));
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(BASE + '#onboarding');
  await page.waitForTimeout(800);
  if(sc === 'member' || sc === 'admin'){
    await page.evaluate(([id, adm]) => { window.__SBSTUB.admin = adm; window.__SBSTUB.signIn(id, adm ? 'admin@dadamom.test' : 'moma@dadamom.test'); }, [sc==='admin'?ADM:A, sc==='admin']);
    await page.waitForTimeout(1000);
  }
  if(sc === 'newuser'){
    await page.evaluate(id => window.__SBSTUB.signIn(id, 'new@dadamom.test'), NEW);
    await page.waitForTimeout(1000);
  }
  for(const rt of ROUTES){
    where = rt;
    await page.evaluate(h => { location.hash = '#' + h; }, rt);
    await page.waitForTimeout(600);
    const actual = await page.evaluate(() => location.hash);
    await check(page, sc, rt + '(' + actual + ')');
    await page.screenshot({ path: `${__dirname}/shots/${sc}-${rt}.png`, fullPage: false });
    // 화면 안의 버튼을 하나씩 눌러본다
    const n = await page.evaluate(() => {
      const scr = document.querySelector('.screen:not([hidden])');
      window.__btns = scr ? [...scr.querySelectorAll('button, [data-goto], [role=button], a[href^="#"], .chip')].filter(e => e.offsetParent !== null) : [];
      return window.__btns.length;
    });
    for(let i = 0; i < Math.min(n, 60); i++){
      const info = await page.evaluate(i => { const e = window.__btns[i]; if(!e || !e.isConnected || e.offsetParent === null) return null; return (e.innerText || e.getAttribute('aria-label') || e.outerHTML.slice(0,60)).trim().slice(0,30); }, i);
      if(info === null || SKIP.test(info)) continue;
      where = rt + ' > ' + info;
      await page.evaluate(i => { try{ window.__btns[i].click(); }catch(e){} }, i);
      await page.waitForTimeout(250);
      await check(page, sc, where);
      // 모달이 열렸으면 그 안 확인 후 닫기
      const modal = await page.evaluate(() => { const c = document.getElementById('modal-card'); return c && c.innerHTML && c.offsetParent !== null; });
      if(modal){
        await page.screenshot({ path: `${__dirname}/shots/${sc}-${rt}-m${i}.png` });
        await page.evaluate(() => { if(typeof closeModal === 'function') closeModal(); const b = document.getElementById('modal-backdrop') || document.querySelector('.modal-backdrop'); if(b) b.click(); document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})); });
        await page.waitForTimeout(150);
      }
      const h = await page.evaluate(() => location.hash);
      if(h !== '#' + rt){ await page.evaluate(x => { location.hash = '#' + x; }, rt); await page.waitForTimeout(300); await page.evaluate(() => { const scr = document.querySelector('.screen:not([hidden])'); window.__btns = scr ? [...scr.querySelectorAll('button, [data-goto], [role=button], a[href^="#"], .chip')].filter(e => e.offsetParent !== null) : []; }); }
    }
  }
  await browser.close();
}

(async () => {
  require('fs').mkdirSync(__dirname + '/shots', { recursive: true });
  const scs = process.argv[2] ? [process.argv[2]] : ['guest','newuser','member','admin'];
  for(const s of scs){ try { await run(s); } catch(e){ add(s, 'crawler', 'CRAWLER ' + e.message.slice(0,200)); } }
  for(const i of issues) console.log(`[${i.sc}] ${i.where} :: ${i.msg}`);
  console.log('TOTAL', issues.length);
})();
