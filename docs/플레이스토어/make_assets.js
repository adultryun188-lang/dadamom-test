// 플레이스토어 등록용 이미지를 만든다.
//   node docs/플레이스토어/make_assets.js      (로컬 서버 http://localhost:8000 이 떠 있어야 함)
// 결과: docs/플레이스토어/assets/
//   feature-graphic.png  1024x500   (스토어 상단 그래픽)
//   phone-1..5.png       1080x1920  (휴대전화 스크린샷, 9:16)
//   icon-512.png         512x512    (앱 아이콘 — icons/icon-512.png 복사)
// 테스트 DB·테스트 계정(dadC)으로 찍는다. 운영 데이터는 쓰지 않는다.
// 성장 화면은 이 기기 저장소에 예시 기록을 넣고 찍은 뒤 원래대로 돌려놓는다.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const OUT = path.join(__dirname, 'assets');
const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FEATURE_HTML = `<!doctype html><html lang="ko"><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Jua&display=swap">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1024px;height:500px;overflow:hidden;font-family:'Gowun Dodum',sans-serif;color:#2B2118;
    background:radial-gradient(520px 320px at 8% 0%,#FFD3BF 0%,transparent 65%),
               radial-gradient(520px 360px at 100% 100%,#FFE79E 0%,transparent 65%),
               linear-gradient(120deg,#FFE0D0 0%,#FFEBD8 45%,#FFF4CC 100%);}
  .wrap{position:relative;height:100%;padding:70px 80px;display:flex;flex-direction:column;justify-content:center;gap:22px}
  .brand{display:flex;align-items:center;gap:18px}
  .mark{width:92px;height:92px;border-radius:30px;background:linear-gradient(140deg,#FF9A76,#FF7A59 55%,#F2A93B);
    color:#fff;font-family:'Jua';font-size:54px;display:flex;align-items:center;justify-content:center;box-shadow:0 14px 30px rgba(255,122,89,.35)}
  h1{font-family:'Jua';font-weight:400;font-size:84px;color:#C94318;letter-spacing:-.02em;line-height:1}
  p{font-size:30px;line-height:1.45;max-width:560px}
  p b{font-family:'Jua';font-weight:400;color:#C94318}
  .chips{display:flex;gap:10px}
  .chips span{background:rgba(255,255,255,.8);border-radius:999px;padding:9px 18px;font-size:20px;font-weight:700;color:#6E5F50}
  .deco{position:absolute;right:70px;top:50%;transform:translateY(-50%);display:grid;grid-template-columns:repeat(2,auto);gap:10px 26px;font-size:104px;line-height:1}
  .deco span:nth-child(2){transform:translateY(34px) rotate(8deg)}
  .deco span:nth-child(3){transform:rotate(-10deg);font-size:88px}
  .deco span:nth-child(4){transform:translateY(22px);font-size:80px}
</style>
<div class="wrap">
  <div class="brand"><div class="mark">다</div><h1>다다맘</h1></div>
  <p>임신부터 육아까지,<br><b>엄마 아빠의 기록과 이야기</b></p>
  <div class="chips"><span>👶 성장 기록</span><span>💬 커뮤니티</span><span>🏆 챌린지</span></div>
  <div class="deco"><span>🍼</span><span>🧸</span><span>🌱</span><span>💛</span></div>
</div></html>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'icons', 'icon-512.png'), path.join(OUT, 'icon-512.png'));
  const browser = await chromium.launch();

  // 1) 그래픽 이미지
  const fg = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await fg.setContent(FEATURE_HTML, { waitUntil: 'networkidle' });
  await fg.evaluate(() => document.fonts.ready);
  await fg.screenshot({ path: path.join(OUT, 'feature-graphic.png') });
  await fg.close();

  // 1-2) 링크 공유 미리보기 이미지 (og:image) 1200x630 — 같은 디자인, 사이트 icons/ 에 둔다
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.setContent(FEATURE_HTML.replace('width:1024px;height:500px', 'width:1200px;height:630px'), { waitUntil: 'networkidle' });
  await og.evaluate(() => document.fonts.ready);
  await og.screenshot({ path: path.join(ROOT, 'icons', 'og-image.png') });
  await og.close();

  // 2) 휴대전화 스크린샷 — 360x640 @3배 = 1080x1920
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html#onboarding', { waitUntil: 'load' });
  await sleep(1500);
  await page.fill('#screen-onboarding input[type=email]', 'dadC@dadamom.test');
  await page.fill('#screen-onboarding input[type=password]', 'dadamom-test-1234');
  await page.click('#auth-password-submit');
  await page.waitForFunction(() => location.hash === '#home', null, { timeout: 15000 });

  // 예시 성장 기록 (이 기기 저장소에만, 끝나면 원래대로)
  const backup = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('auth-token'));
    const key = 'dadamom_v2::' + JSON.parse(localStorage.getItem(k)).user.id;
    const raw = localStorage.getItem(key);
    const st = raw ? JSON.parse(raw) : {};
    const now = Date.now(), D = 864e5;
    st.growthRecords = [
      { id: 'g1', ts: now - 180 * D, weight: 6.1, height: 62 }, { id: 'g2', ts: now - 120 * D, weight: 7.0, height: 65.5 },
      { id: 'g3', ts: now - 60 * D, weight: 7.9, height: 68.8 }, { id: 'g4', ts: now - 5 * D, weight: 8.6, height: 71.4 }
    ];
    st.careLog = [{ id: 'c1', type: 'feed', ts: now - 3 * 36e5 }, { id: 'c2', type: 'feed', ts: now - 6 * 36e5 }];
    localStorage.setItem(key, JSON.stringify(st));
    return { key, raw };
  });

  const shots = [['home', 'phone-1'], ['community', 'phone-2'], ['challenge', 'phone-3'], ['growth', 'phone-4'], ['my', 'phone-5']];
  for (const [hash, name] of shots) {
    await page.goto(BASE + '/index.html#' + hash, { waitUntil: 'load' });
    // 해시만 바뀌면 문서가 다시 안 읽혀 저장소에 넣은 예시 기록이 반영되지 않는다
    await page.reload({ waitUntil: 'load' });
    await page.addStyleTag({ content: '#test-banner{display:none !important}' });
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('찍음', name, '#' + hash);
  }

  await page.evaluate(({ key, raw }) => { if (raw) localStorage.setItem(key, raw); else localStorage.removeItem(key); }, backup);
  await browser.close();
  console.log('완료 →', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
