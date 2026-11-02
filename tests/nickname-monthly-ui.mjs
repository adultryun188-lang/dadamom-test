// 닉네임 한 달 제한(0058) 화면 확인. 먼저 테스트 DB 에서 momB 의 nickname_changed_at 을 지금으로 맞춘 뒤 실행.
//   node tests/nickname-monthly-ui.mjs http://localhost:8000/
import { chromium } from 'playwright'; import fs from 'node:fs';
const BASE = process.argv[2];
const env = fs.readFileSync('config/env.staging.js','utf8'); const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
const sess = await (await fetch(U + '/auth/v1/token?grant_type=password', { method:'POST', headers:{apikey:K,'Content-Type':'application/json'}, body: JSON.stringify({email:'momB@dadamom.test',password:'dadamom-test-1234'}) })).json();
const nick = async () => ((await (await fetch(U + '/rest/v1/profiles?select=nickname&id=eq.' + sess.user.id, { headers:{apikey:K, Authorization:'Bearer '+sess.access_token} })).json())[0]||{}).nickname;
const before = await nick();
const b = await chromium.launch(); const c = await b.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' }); const p = await c.newPage();
const toasts = []; await p.exposeFunction('__t', t => toasts.push(t));
await p.addInitScript(([s]) => { localStorage.setItem('sb-srxdtddrtnhtlbbviyvs-auth-token', JSON.stringify(s)); new MutationObserver(() => { const t = document.querySelector('.toast, #toast'); if (t && t.textContent) window.__t(t.textContent); }).observe(document, { subtree:true, childList:true, characterData:true }); }, [sess]);
await p.goto(BASE + 'index.html?nc=' + Date.now() + '#my'); await p.waitForTimeout(5000);
await p.evaluate(() => { location.hash = '#my'; }); await p.waitForTimeout(2500); console.log('hash', await p.evaluate(() => location.hash)); await p.locator('#screen-my a[href="#onboarding"]').click(); await p.waitForTimeout(2500); console.log('hash2', await p.evaluate(() => location.hash));
console.log('안내 문구', (await p.locator('#nickname-hint').innerText()).includes('한 달에 한 번'));
await p.fill('#nickname-input', '바꿔볼이름'); await p.locator('#start-btn').click(); await p.waitForTimeout(4000);
const after = await nick();
console.log('한 달 안 변경 → 안내', toasts.some(t => /한 달에 한 번/.test(t)), [...new Set(toasts)].slice(-2).join(' | '));
console.log('DB 이름 그대로', after === before, before, '→', after);
await b.close();
