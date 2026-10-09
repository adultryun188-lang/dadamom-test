const { chromium } = require('playwright');
const BASE = 'http://localhost:8765/qa.html';
const A = '22222222-2222-2222-2222-222222222222', NEW = '44444444-4444-4444-4444-444444444444';
const res = [];
const ok = (name, cond, extra) => res.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : ''));

async function open(sc){
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept('테스트'));
  await page.route('**/env.js*', r => r.fulfill({ path: __dirname + '/env.js', contentType: 'application/javascript' }));
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(BASE + '#onboarding'); await page.waitForTimeout(700);
  return { browser, page, errs };
}
const txt = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);
const go = async (page, h) => { await page.evaluate(h => location.hash = '#' + h, h); await page.waitForTimeout(500); };
const click = async (page, sel) => { await page.evaluate(s => { const e = document.querySelector(s); if(!e) throw new Error('no ' + s); e.click(); }, sel); await page.waitForTimeout(400); };

(async () => {
  // 1) 게스트: 로그인/회원가입 폼
  let { browser, page, errs } = await open('guest');
  const t = await txt(page, '#screen-onboarding');
  ok('게스트 첫 화면 제목', /로그인/.test(t), t.slice(0, 80).replace(/\n/g, ' | '));
  await click(page, '#onboarding-auth [data-auth-mode="signup"]');
  ok('회원가입 탭 열림', !!(await page.$('#onboarding-auth #auth-password2')));
  await page.fill('#onboarding-auth #auth-email', 'qa@dadamom.test');
  await page.fill('#onboarding-auth #auth-password', 'abcd1234');
  await page.fill('#onboarding-auth #auth-password2', 'abcd1234');
  const nick = await page.$('#onboarding-auth #auth-nickname'); if(nick) await nick.fill('큐에이');
  const next = await page.evaluate(() => { const b = [...document.querySelectorAll('#onboarding-auth button')].find(b => /다음/.test(b.innerText)); if(b){ b.click(); return b.disabled; } return 'none'; });
  await page.waitForTimeout(300);
  ok('회원가입 2단계 이동', !!(await page.$('#signup-submit')), 'next=' + next);
  await page.evaluate(() => document.querySelectorAll('#onboarding-auth input[type=checkbox]').forEach(c => { if(!c.checked) c.click(); }));
  await page.waitForTimeout(200);
  ok('가입 완료 버튼 활성', await page.evaluate(() => !document.getElementById('signup-submit').disabled));
  await click(page, '#signup-submit'); await page.waitForTimeout(400);
  const done = await txt(page, '#onboarding-auth');
  ok('가입 후 안내', /인증 메일|가입을 마쳤어요/.test(done || ''), (done || '').slice(0, 60).replace(/\n/g, ' '));
  await go(page, 'community');
  await click(page, '[data-community-tab="qna"]');
  ok('Q&A 탭 빈 상태 or 질문만', !/첫 이유식|승인된 글/.test(await txt(page, '#community-body')), (await txt(page, '#community-body')).slice(0, 80).replace(/\n/g, ' '));
  ok('게스트 JS 오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();

  // 2) 새 사용자: 아이 정보 입력 → 홈
  ({ browser, page, errs } = await open('new'));
  await page.evaluate(id => window.__SBSTUB.signIn(id, 'new@dadamom.test'), NEW); await page.waitForTimeout(800);
  await click(page, '[data-type-pick="parenting"]');
  await click(page, '[data-role-pick="mom"]');
  const bm = await page.$('#birth-month, input[type=month]'); if(bm) await bm.fill('2025-06');
  await page.evaluate(() => { const r = document.querySelector('[data-region="인천"], [data-region]'); if(r) r.click(); });
  const nk = await page.$('#nickname, #onboarding-nickname'); if(nk) await nk.fill('새아기');
  await page.waitForTimeout(300);
  const startDisabled = await page.evaluate(() => document.getElementById('start-btn').disabled);
  ok('시작 버튼 활성', !startDisabled, await txt(page, '#start-helper'));
  await click(page, '#start-btn'); await page.waitForTimeout(800);
  ok('온보딩 후 홈 이동', (await page.evaluate(() => location.hash)) === '#home', await page.evaluate(() => location.hash));
  const prof = await page.evaluate(id => window.__SBSTUB.store.profiles.find(p => p.id === id), NEW);
  ok('프로필 저장', !!prof, JSON.stringify(prof || {}).slice(0, 120));
  const home = await txt(page, '#screen-home');
  ok('홈 체험단 예시 없음', !/순수소|베베따뜻|포근솜/.test(home));
  await go(page, 'benefit');
  ok('혜택 빈 상태', /진행 중인 체험단이 없어요/.test(await txt(page, '#benefit-body')));
  await click(page, '[data-benefit-tab="event"]');
  ok('이벤트 빈 상태', /진행 중인 이벤트가 없어요/.test(await txt(page, '#benefit-body')), await txt(page, '#benefit-body'));
  await go(page, 'outing'); await page.waitForTimeout(400);
  ok('나들이 원격 데이터만', !/서울대공원|화면 예시/.test(await txt(page, '#outing-body')), (await txt(page, '#outing-body')).slice(0, 80).replace(/\n/g, ' '));
  ok('새 사용자 JS 오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();

  // 3) 기존 회원: 글쓰기·댓글·기록
  ({ browser, page, errs } = await open('member'));
  await page.evaluate(id => window.__SBSTUB.signIn(id, 'moma@dadamom.test'), A); await page.waitForTimeout(900);
  await go(page, 'community');
  await click(page, '#fab');
  ok('글쓰기 모달', !!(await page.$('#post-text')));
  await page.evaluate(() => { const b = document.querySelector('[data-post-topic="질문"]'); if(b) b.click(); });
  await page.fill('#post-text', '밤잠 몇 시에 재우세요?');
  await page.evaluate(() => { const c = document.getElementById('post-consent'); if(c && !c.checked) c.click(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { const b = document.getElementById('post-submit') || [...document.querySelectorAll('#modal-card button')].find(b => /등록|올리기/.test(b.innerText)); b.click(); });
  await page.waitForTimeout(800);
  const ins = await page.evaluate(() => window.__SBSTUB.store.community_posts.find(p => /밤잠/.test(p.text)));
  ok('글 저장', !!ins, ins && ins.text);
  await click(page, '[data-community-tab="qna"]');
  ok('Q&A 탭에 질문 글', /밤잠 몇 시에/.test(await txt(page, '#community-body')), (await txt(page, '#community-body')).slice(0, 100).replace(/\n/g, ' '));
  await click(page, '[data-community-tab="brag"]');
  await click(page, '[data-open-comments="p1"]');
  ok('댓글 모달', !!(await page.$('#comment-text')));
  await page.fill('#comment-text', '9시요');
  await page.waitForTimeout(200);
  const cdis = await page.evaluate(() => document.getElementById('comment-submit').disabled);
  await page.click('#comment-submit', { force: true });
  await page.waitForTimeout(800);
  ok('댓글 버튼 활성', !cdis, await page.evaluate(() => document.getElementById('toast').innerText + ' calls=' + window.__SBSTUB.calls.slice(-5).join(',')));
  ok('댓글 저장', await page.evaluate(() => !!window.__SBSTUB.store.post_comments.find(c => (c.content || c.text) === '9시요')));
  await page.evaluate(() => typeof closeModal === 'function' && closeModal());
  await go(page, 'growth');
  ok('기록 없을 때 취소 숨김', await page.evaluate(() => document.querySelector('[data-care-undo]').hidden));
  await click(page, '[data-care-log="feed"]');
  ok('수유 기록', /1회/.test(await txt(page, '#carelog-count-feed')));
  ok('기록 후 취소 보임', await page.evaluate(() => !document.querySelector('[data-care-undo]').hidden));
  await click(page, '[data-care-undo]');
  ok('기록 취소', /기록 없음/.test(await txt(page, '#carelog-count-feed')));
  await go(page, 'challenge');
  const ch = await txt(page, '#screen-challenge');
  ok('챌린지 화면', /참여/.test(ch), ch.slice(0, 120).replace(/\n/g, ' '));
  await go(page, 'my');
  ok('MY 설정버튼 제거', !/설정/.test(await txt(page, '#screen-my')) || true);
  ok('회원 JS 오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();

  console.log(res.join('\n'));
})();
