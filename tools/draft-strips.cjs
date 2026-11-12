// Builds one animation strip per unit and team (troops: idle, walk1, walk2, windup, strike,
// pass; buildings: see POSES), each
// FRAME px square, anchored on the feet (the dragon on its middle); red is blue recoloured.
const {chromium} = require('/Users/martinwiechmann/Documents/Dev/Git/MarbleGame/node_modules/playwright');
const fs = require('fs');
const A = '/Users/martinwiechmann/Documents/Dev/Git/blackjack/assets/sprites';
const OUT = '/Users/martinwiechmann/Documents/Dev/Git/blackjack/src/jvmMain/resources/static/draft/img';
const UNITS = (process.argv[2] || 'spear,knight,archer,goblin,mage,giant,dragon,tower,catapult').split(',');
const TROOP = ['idle', 'walk1', 'walk2', 'windup', 'strike', 'pass', 'pass2', 'idle2', 'follow', 'recover', 'hit'];
const POSES = {tower: ['idle', 'flag', 'fire', 'smoke'], catapult: ['idle', 'fire', 'reload', 'swing', 'crank']};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const unit of UNITS) {
    const FRAMES = POSES[unit] || TROOP;
    const srcs = FRAMES.map((f) => 'data:image/png;base64,' + fs.readFileSync(f === 'idle' ? `${A}/draft/${unit}-blue.png` : `${A}/frames/${unit}-${f}.png`).toString('base64'));
    const res = await p.evaluate(async ({srcs, fly}) => {
      const FRAME = 256, VIEW = 1280;   // a frame shows 1280 source px, so a long lunge fits
      const strips = {blue: document.createElement('canvas'), red: document.createElement('canvas')};
      for (const c of Object.values(strips)) { c.width = FRAME * srcs.length; c.height = FRAME; }
      const info = [];
      for (let i = 0; i < srcs.length; i++) {
        const img = new Image(); img.src = srcs[i]; await img.decode();
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height), px = d.data, W = c.width, H = c.height;
        let x0 = W, x1 = 0, y0 = H, y1 = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        // Anchor: the middle of what stands on the ground (the lowest fifth), or of the whole flyer.
        const from = fly ? y0 : y1 - (y1 - y0) * 0.2;
        let sx = 0, sy = 0, n = 0;
        for (let y = Math.floor(from); y <= y1; y++) for (let x = x0; x <= x1; x++) { const a = px[(y * W + x) * 4 + 3]; if (a > 40) { sx += x * a; sy += y * a; n += a; } }
        const ax = sx / n, ay = fly ? sy / n : y1;
        // Red team: every clearly blue pixel turns red, shade for shade.
        const red = new ImageData(new Uint8ClampedArray(px), W, H), q = red.data;
        for (let k = 0; k < q.length; k += 4) {
          if (q[k + 3] < 8) continue;
          const r = q[k] / 255, gg = q[k + 1] / 255, bb = q[k + 2] / 255, mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb), dl = mx - mn;
          if (dl < 0.12 || mx !== bb) continue;
          const l = (mx + mn) / 2, s = dl / (1 - Math.abs(2 * l - 1));
          const h = 60 * ((r - gg) / dl + 4);
          if (s < 0.32 || h < 195 || h > 262) continue;
          const nh = ((h - 228) * 0.5 + 357 + 360) % 360, cc = (1 - Math.abs(2 * l - 1)) * Math.min(1, s * 1.05), xx = cc * (1 - Math.abs((nh / 60) % 2 - 1)), m = l - cc / 2;
          const [R, G, B] = nh < 60 ? [cc, xx, 0] : nh < 300 ? [cc, 0, xx] : [cc, 0, xx];
          q[k] = (R + m) * 255; q[k + 1] = (G + m) * 255; q[k + 2] = (B + m) * 255;
        }
        const rc = document.createElement('canvas'); rc.width = W; rc.height = H; rc.getContext('2d').putImageData(red, 0, 0);
        const k = FRAME / VIEW, dx = i * FRAME + FRAME / 2 - ax * k, dy = (fly ? FRAME / 2 : FRAME * 0.9) - ay * k;
        for (const [team, source] of [['blue', c], ['red', rc]]) {
          const sg = strips[team].getContext('2d');
          sg.imageSmoothingQuality = 'high';
          sg.save(); sg.beginPath(); sg.rect(i * FRAME, 0, FRAME, FRAME); sg.clip();
          sg.drawImage(source, dx, dy, W * k, H * k);
          sg.restore();
        }
        info.push({h: y1 - y0, w: x1 - x0});
      }
      const out = {info};
      for (const [team, c] of Object.entries(strips)) out[team] = {webp: c.toDataURL('image/webp', 0.74), png: c.toDataURL('image/png')};
      return out;
    }, {srcs, fly: unit === 'dragon'});
    for (const team of ['blue', 'red']) {
      fs.writeFileSync(`${OUT}/${unit}-${team}-anim.webp`, Buffer.from(res[team].webp.split(',')[1], 'base64'));
      fs.writeFileSync(`${process.env.STRIP_PREVIEW || '/tmp'}/strip-${unit}-${team}.png`, Buffer.from(res[team].png.split(',')[1], 'base64'));
    }
    console.log(unit, res.info.map((i) => `${i.w}x${i.h}`).join(' '));
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
