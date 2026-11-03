// يصوّر raindrop-reel.html إطاراً إطاراً. الاستعمال: node reel-render.js <html> <outdir> [fps] [onlyTimes,comma]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [html, out, fpsArg, only] = process.argv.slice(2);
  const fps = +(fpsArg || 30);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('file://' + html); await pg.evaluate(() => window.ready); await pg.waitForTimeout(500);
  const dur = await pg.evaluate(() => window.DURATION);
  const times = only ? only.split(',').map(Number) : Array.from({ length: Math.round(dur * fps) }, (_, i) => i / fps);
  let i = 0;
  for (const t of times) {
    await pg.evaluate((t) => window.render(t), t);
    await pg.screenshot({ path: `${out}/${only ? 't' + t.toFixed(2) : String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 90 });
    i++;
  }
  console.log('frames', i, 'errors', errs);
  await b.close();
})();
