// 아이 정보 수정 화면 (0058·0060): 생년월일(일까지) 저장, 임신↔육아 한 달 제한, 사칭 이름 거절 안내.
//   node tests/profile-monthly-ui.mjs [BASE]   — momB 를 쓰고, 끝나면 테스트 DB 에서 원래대로 돌려놓아야 한다(관리 SQL).
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const BASE = process.argv[2] || 'http://localhost:8000/';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const sess = await (await fetch(U + '/auth/v1/token?grant_type=password', { method:'POST', headers:{ apikey:K, 'Content-Type':'application/json' }, body: JSON.stringify({ email:'momB@dadamom.test', password:'dadamom-test-1234' }) })).json();
const prof = async () => (await (await fetch(U + '/rest/v1/profiles?select=nickname,kid_type,birth_month,birth_date&id=eq.' + sess.user.id, { headers:{ apikey:K, Authorization:'Bearer ' + sess.access_token } })).json())[0];
const b = await chromium.launch(); const c = await b.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'block' }); const p = await c.newPage();
const toasts = []; await p.exposeFunction('__t', t => toasts.push(t));
await p.addInitScript(([s]) => { localStorage.setItem('sb-srxdtddrtnhtlbbviyvs-auth-token', JSON.stringify(s)); new MutationObserver(() => { const t = document.querySelector('.toast, #toast'); if (t && t.textContent) window.__t(t.textContent); }).observe(document, { subtree:true, childList:true, characterData:true }); }, [sess]);
const openEdit = async () => { await p.evaluate(() => { location.hash = '#my'; }); await p.waitForTimeout(2000); await p.locator('#screen-my a[href="#onboarding"]').click(); await p.waitForTimeout(2000); };
const saveForm = async () => { await p.waitForTimeout(3500); toasts.length = 0; await p.locator('#start-btn').click(); await p.waitForTimeout(3500); };   // 앞 안내가 사라진 뒤 누른다
try {
  await p.goto(BASE + 'index.html?nc=' + Date.now() + '#home'); await p.waitForTimeout(5000);
  // 1) 임신 → 육아 + 생년월일
  await openEdit();
  await p.locator('[data-type-pick="parenting"]').click(); await p.waitForTimeout(500);
  ok('생년월일은 날짜(일)까지 고르는 칸', await p.locator('#birth-month').getAttribute('type') === 'date' && (await p.locator('label[for="birth-month"]').innerText()).includes('생년월일'));
  await p.fill('#birth-month', '2026-10-20'); await p.locator('#birth-month').dispatchEvent('change'); await p.waitForTimeout(300);
  await saveForm();
  let r = await prof();
  ok('첫 단계 변경(임신→육아)과 생년월일 저장', r.kid_type === 'parenting' && r.birth_date === '2026-10-20' && r.birth_month === '2026-10', JSON.stringify(r));
  const day = await p.evaluate(() => document.body.innerText.match(/태어난 지[^\n]*\n?\s*(\d+)일째/)?.[1]);
  const expect = Math.round((new Date(new Date().toDateString()) - new Date(2026, 9, 20)) / 86400000) + 1;
  ok('홈 "태어난 지 N일째"가 날짜로 정확히', day === undefined || +day === expect, 'N=' + day + ' 기대 ' + expect);
  // 2) 한 달 안에 육아 → 임신 되돌리기 → 안내, 그대로
  await openEdit();
  await p.locator('[data-type-pick="pregnant"]').click(); await p.waitForTimeout(500);
  await p.fill('#due-date', '2026-12-10'); await p.locator('#due-date').dispatchEvent('change');
  await saveForm();
  r = await prof();
  ok('한 달 안 단계 변경 → 안내', toasts.some(t => /임신 중·육아 중은 한 달에 한 번/.test(t)), [...new Set(toasts)].join(' | '));
  ok('DB 단계는 그대로(육아)', r.kid_type === 'parenting', r.kid_type);
  // 3) 사칭 이름
  await openEdit();
  ok('화면 단계도 원래대로(육아) 돌아옴', await p.locator('[data-type-pick="parenting"][aria-pressed="true"]').count() === 1);
  await p.fill('#nickname-input', '운영자'); await p.locator('#nickname-input').dispatchEvent('input');
  await saveForm();
  r = await prof();
  ok('운영자 같은 이름 → 이유 안내', toasts.some(t => /운영자·관리자·다다맘/.test(t)), [...new Set(toasts)].join(' | '));
  ok('이름은 원래대로(서버·화면)', r.nickname !== '운영자' && (await p.locator('#nickname-input').inputValue()) !== '운영자', r.nickname);
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
await b.close();
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
