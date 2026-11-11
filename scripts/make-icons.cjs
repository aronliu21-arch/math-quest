// Renders icons/icon.svg to the PNG sizes iOS and Android need.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync(__dirname + '/../icons/icon.svg', 'utf8');
  const b = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const pg = await b.newPage({ viewport: { width: size, height: size } });
    await pg.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await pg.screenshot({ path: `${__dirname}/../icons/icon-${size}.png`, omitBackground: true });
  }
  await b.close();
})();
