// 인스타그램 카드(1080x1350) 4장을 만들고, QR 포스터의 QR 이 맞는 주소로 읽히는지 확인한다.
//   node docs/홍보자료/make_cards.js
// 결과: docs/홍보자료/인스타/card-1..4.png
// 문구는 docs/홍보자료/문구.md 와 같다. 월령 문구는 앱의 MONTH_INFO 그대로 (12·18개월).
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

const OUT = path.join(__dirname, '인스타');
const POSTER = url.pathToFileURL(path.join(__dirname, 'QR포스터.html')).href;

const CARDS = [
  { chip: '10.27 – 11.2 · 7일 릴레이', title: '오늘은 나도<br>자랑할래', sub: '같은 개월 수 엄마·아빠의 작은 자랑 릴레이',
    items: ['오늘 아이 때문에 웃었던 순간', '혼자 해 보려던 작은 시도', '부모인 내가 오늘 잘한 일'],
    note: '사진 없이 글만 써도 참여할 수 있어요' },
  { chip: '12개월 즈음', title: '혼자 몇 걸음<br>걸을 수 있어요', sub: '돌 사진, 돌잔치 준비를 챙겨보세요',
    items: [], note: '아이마다 속도는 달라요.<br>같은 개월 수 부모들은 요즘 어떤지 다다맘에서 물어보세요.' },
  { chip: '18개월 즈음', title: '숟가락질을<br>시도해요', sub: '스스로 먹으려는 시도를 격려해주세요',
    items: [], note: '흘려도 괜찮아요.<br>오늘 혼자 먹어 본 이야기, 다다맘에 자랑해 주세요.' },
  { chip: '다다맘은', title: '같은 개월 수<br>엄마·아빠끼리', sub: '작은 자랑과 고민을 나누는 곳',
    items: ['질문·자랑·고민·정보 게시판', '수유·수면·키·몸무게 기록', '광고 없음 · 글과 사진은 운영자 확인 뒤 공개'],
    note: '가입 없이 먼저 둘러볼 수 있어요' },
];

const html = (c) => `<!doctype html><html lang="ko"><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Jua&display=swap">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1080px;height:1350px;overflow:hidden;font-family:'Gowun Dodum',sans-serif;color:#2B2118;
    background:radial-gradient(620px 420px at 0% 0%,#FFD3BF 0%,transparent 70%),
               radial-gradient(640px 460px at 100% 100%,#FFE79E 0%,transparent 70%),#FFFBF5;}
  .wrap{height:100%;padding:96px 96px 84px;display:flex;flex-direction:column}
  .brand{display:flex;align-items:center;gap:20px}
  .mark{width:84px;height:84px;border-radius:28px;background:linear-gradient(140deg,#FF9A76,#FF7A59 55%,#F2A93B);
    color:#fff;font-family:'Jua';font-size:50px;display:flex;align-items:center;justify-content:center}
  .name{font-family:'Jua';font-size:56px;color:#C94318}
  .chip{align-self:flex-start;margin-top:84px;background:#fff;border-radius:999px;padding:14px 30px;font-size:34px;font-weight:700;color:#6E5F50}
  h1{margin-top:36px;font-family:'Jua';font-weight:400;font-size:118px;line-height:1.12;letter-spacing:-.01em;word-break:keep-all}
  .sub{margin-top:34px;font-size:44px;line-height:1.45;color:#C94318;word-break:keep-all}
  ul{list-style:none;margin-top:46px;padding:0;display:flex;flex-direction:column;gap:18px}
  li{background:rgba(255,255,255,.85);border-radius:24px;padding:22px 30px;font-size:38px;word-break:keep-all}
  .note{margin-top:auto;padding-top:40px;font-size:36px;line-height:1.55;color:#6E5F50;word-break:keep-all}
  .foot{margin-top:28px;padding-top:26px;border-top:2px solid #F0E4D6;font-size:30px;color:#9A8B7C}
</style>
<div class="wrap">
  <div class="brand"><div class="mark">다</div><div class="name">다다맘</div></div>
  <div class="chip">${c.chip}</div>
  <h1>${c.title}</h1>
  <p class="sub">${c.sub}</p>
  ${c.items.length ? '<ul>' + c.items.map((i) => '<li>' + i + '</li>').join('') + '</ul>' : ''}
  <p class="note">${c.note}</p>
  <p class="foot">다다맘 · 프로필 링크에서 가입 없이 둘러보기</p>
</div>`;

(async () => {
  const browser = await chromium.launch();
  let failed = 0;

  // 1) 카드
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  for (let i = 0; i < CARDS.length; i++) {
    await page.setContent(html(CARDS[i]), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // 글자가 카드 밖으로 넘치면 실패로 본다
    const over = await page.evaluate(() => document.querySelector('.wrap').scrollHeight > 1350);
    if (over) { console.log('  FAIL  card-' + (i + 1) + ' 글자가 넘침'); failed++; }
    await page.screenshot({ path: path.join(OUT, 'card-' + (i + 1) + '.png') });
    console.log('  ' + (over ? 'WARN' : 'OK  ') + '  card-' + (i + 1) + '.png');
  }

  // 2) 포스터 QR 이 넣은 값 그대로의 주소로 읽히는지 (jsQR 로 디코드)
  const cases = [
    { from: 'nd-cafe1', post: 'ccaccd16-3e5e-4242-b03d-3541b9491543',
      want: 'https://adultryun188-lang.github.io/dadamom-app/community.html?from=nd-cafe1#/p/ccaccd16-3e5e-4242-b03d-3541b9491543' },
    { from: 'friend', post: '',
      want: 'https://adultryun188-lang.github.io/dadamom-app/community.html?from=friend' },
  ];
  const pp = await browser.newPage({ viewport: { width: 900, height: 1300 } });
  for (const c of cases) {
    await pp.goto(POSTER + '?from=' + c.from + (c.post ? '&post=' + c.post : ''), { waitUntil: 'networkidle' });
    await pp.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js' });
    const got = await pp.evaluate(() => {
      const src = document.querySelector('#qr canvas');
      const pad = 40, cv = document.createElement('canvas');
      cv.width = src.width + pad * 2; cv.height = src.height + pad * 2;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(src, pad, pad);
      const d = g.getImageData(0, 0, cv.width, cv.height);
      const r = window.jsQR(d.data, cv.width, cv.height);
      return { qr: r && r.data, shown: document.getElementById('url').textContent };
    });
    const ok = got.qr === c.want && got.shown === c.want;
    if (!ok) failed++;
    console.log('  ' + (ok ? 'OK  ' : 'FAIL') + '  포스터 QR (' + c.from + ')   ' + got.qr);
  }
  await pp.goto(POSTER + '?from=nd-cafe1&post=ccaccd16-3e5e-4242-b03d-3541b9491543', { waitUntil: 'networkidle' });
  await pp.evaluate(() => document.fonts.ready);
  await pp.pdf({ path: path.join(OUT, '..', 'QR포스터_예시.pdf'), format: 'A4', printBackground: true });
  console.log('  OK    QR포스터_예시.pdf (예시 코드 nd-cafe1)');

  await browser.close();
  console.log(failed ? '실패 ' + failed + '건' : '전부 통과');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
