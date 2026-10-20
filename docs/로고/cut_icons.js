// 사장님 로고 이미지(원본_사장님.webp, 1254px)에서 위쪽 마크(두 개의 d)를 그대로 잘라 앱 아이콘 크기로 만든다.
//   node docs/로고/cut_icons.js  → docs/로고/icons/*.png
// 마크 영역: x 388~797, y 76~440 (배경 #FEFDF9 와 다른 픽셀로 잰 값). 배경은 원본 그대로의 크림색.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '원본_사장님.webp');
const OUT = path.join(__dirname, 'icons');
fs.mkdirSync(OUT, { recursive: true });
const BOX = { x: 388, y: 76, w: 797 - 388 + 1, h: 440 - 76 + 1 };
const BG = '#FEFDF9';
// [파일, 크기, 마크가 차지할 비율]  maskable 은 안드로이드가 가장자리를 잘라내므로 더 작게(안전 영역 80%)
const SIZES = [
  ['icon-512.png', 512, 0.78], ['icon-192.png', 192, 0.78], ['apple-touch-icon.png', 180, 0.78],
  ['icon-maskable-512.png', 512, 0.6], ['naver-logo-140.png', 140, 0.82], ['favicon-48.png', 48, 0.9],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const data = 'data:image/webp;base64,' + fs.readFileSync(SRC).toString('base64');
  await p.setContent(`<img id="i" src="${data}">`);
  await p.waitForFunction(() => document.getElementById('i').complete);
  for (const [name, size, ratio] of SIZES) {
    const png = await p.evaluate(({ size, ratio, BOX, BG }) => {
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const x = c.getContext('2d'); x.fillStyle = BG; x.fillRect(0, 0, size, size);
      x.imageSmoothingQuality = 'high';
      const s = (size * ratio) / Math.max(BOX.w, BOX.h);
      const w = BOX.w * s, h = BOX.h * s;
      x.drawImage(document.getElementById('i'), BOX.x, BOX.y, BOX.w, BOX.h, (size - w) / 2, (size - h) / 2, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, { size, ratio, BOX, BG });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(png, 'base64'));
  }
  await b.close();
  console.log('완료 →', OUT);
})();
