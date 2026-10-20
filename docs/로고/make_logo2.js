// 다다맘 로고 (두 개의 d = 엄마·아이가 안고 있는 얼굴 + 하트). 사장님 참고 이미지 느낌으로 SVG 로 다시 그림.
//   node docs/로고/make_logo2.js   → logo-mark.svg, app-icon-512.png, mark-512.png, logo-horizontal.png, naver-logo-140.png, logo-최종.png
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;

// 마크만 (viewBox 0 0 520 440)
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 545 440">
  <defs>
    <linearGradient id="gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F59A82"/><stop offset="1" stop-color="#EE7A63"/></linearGradient>
    <linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC59A"/><stop offset="1" stop-color="#F9A873"/></linearGradient>
  </defs>
  <!-- 엄마 d -->
  <rect x="222" y="20" width="78" height="300" rx="39" fill="url(#gm)"/>
  <circle cx="178" cy="262" r="150" fill="url(#gm)"/>
  <circle cx="190" cy="250" r="84" fill="#FFF4EC"/>
  <path d="M152 236 q16 -18 32 0" stroke="#5B3A33" stroke-width="11" fill="none" stroke-linecap="round"/>
  <!-- 아이 d -->
  <rect x="440" y="112" width="70" height="300" rx="35" fill="url(#gb)"/>
  <circle cx="384" cy="312" r="112" fill="url(#gb)"/>
  <circle cx="384" cy="300" r="72" fill="#FFF4EC"/>
  <path d="M384 286 q14 -16 28 0" stroke="#5B3A33" stroke-width="10" fill="none" stroke-linecap="round"/>
  <!-- 안아 주는 팔 -->
  <path d="M128 322 C 210 378 320 376 380 342" stroke="#F08A70" stroke-width="58" fill="none" stroke-linecap="round"/>
  <path d="M128 322 C 210 378 320 376 380 342" stroke="#F7A08A" stroke-width="30" fill="none" stroke-linecap="round" opacity=".55"/>
  <!-- 하트 -->
  <path d="M368 116 C 338 90 334 60 356 50 C 368 45 378 52 384 62 C 390 52 400 45 412 50 C 434 60 430 90 368 116 Z" fill="#FFC3A8"/>
</svg>`;
fs.writeFileSync(path.join(OUT, 'logo-mark.svg'), MARK);
const markImg = 'data:image/svg+xml;base64,' + Buffer.from(MARK).toString('base64');
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Quicksand:wght@600&display=swap">';
const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>*{margin:0;box-sizing:border-box}body{width:${w}px;height:${h}px;background:transparent;font-family:Jua}</style></head><body>${body}</body></html>`;
const wordmark = (size) => `<div style="display:flex;flex-direction:column;align-items:center;gap:${size * 0.06}px">
  <div style="font-family:Jua;font-size:${size}px;line-height:1;color:#5B3A33;letter-spacing:-0.02em">다다맘</div>
  <div style="font-family:Quicksand;font-weight:600;font-size:${size * 0.3}px;letter-spacing:0.32em;color:#7A5A52;padding-left:0.32em">dadamom</div></div>`;

const SHOTS = {
  'app-icon-512.png': [512, 512, `<div style="width:512px;height:512px;border-radius:112px;background:#FFFBF7;display:flex;align-items:center;justify-content:center"><img src="${markImg}" style="width:400px"></div>`],
  'mark-512.png': [512, 512, `<div style="width:512px;height:512px;display:flex;align-items:center;justify-content:center"><img src="${markImg}" style="width:480px"></div>`],
  'naver-logo-140.png': [140, 140, `<div style="width:140px;height:140px;background:#FFFBF7;display:flex;align-items:center;justify-content:center"><img src="${markImg}" style="width:118px"></div>`],
  'logo-horizontal.png': [900, 300, `<div style="width:900px;height:300px;display:flex;align-items:center;justify-content:center;gap:36px"><img src="${markImg}" style="width:300px">${wordmark(110)}</div>`],
  'logo-vertical.png': [700, 760, `<div style="width:700px;height:760px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px"><img src="${markImg}" style="width:460px">${wordmark(120)}</div>`],
};

(async () => {
  const b = await chromium.launch();
  for (const [name, [w, h, body]] of Object.entries(SHOTS)) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(page(w, h, body), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, name), omitBackground: true });
    await p.close();
  }
  const img = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, n)).toString('base64');
  const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
  await p.setContent(`<body style="margin:0;background:#FFFBF5;font-family:sans-serif;color:#7A5A52;font-size:15px;letter-spacing:.15em">
    <div style="display:flex;justify-content:center;padding-top:20px"><img src="${img('logo-vertical.png')}" style="width:560px"></div>
    <div style="display:flex;justify-content:center;align-items:center;gap:60px;margin-top:10px">
      <div style="text-align:center"><img src="${img('app-icon-512.png')}" style="width:200px;filter:drop-shadow(0 8px 18px rgba(120,60,20,.15))"><div>APP ICON</div></div>
      <div style="text-align:center"><img src="${img('logo-horizontal.png')}" style="width:480px"><div>HORIZONTAL</div></div>
      <div style="text-align:center"><img src="${img('naver-logo-140.png')}" style="width:140px"><div>NAVER 140</div></div>
    </div></body>`);
  await p.screenshot({ path: path.join(OUT, 'logo-최종.png') });
  await b.close();
  console.log('완료');
})();
