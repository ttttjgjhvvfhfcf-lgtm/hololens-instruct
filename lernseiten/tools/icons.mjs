// Erzeugt die Symbole der Seiten (Favicon im Browser-Tab, Symbol auf dem Startbildschirm) in shared/icons/:
//   lernportal.svg      Buch      Portal und alle Lernseiten
//   stundenplan.svg     Uhr       Stundenplan
//   schularbeiten.svg   Blatt     Schularbeitenplan
// Jedes gibt es als SVG (für moderne Browser) und als PNG (32 px als Rückfall, 180 px als Apple-Symbol ohne runde Ecken).
// Aufruf:  node tools/icons.mjs     (braucht "playwright"; die erzeugten Dateien sind eingecheckt)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ziel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'icons');
mkdirSync(ziel, { recursive: true });

// Zeichnung auf einem Raster von 64 × 64
const GLYPHEN = {
  lernportal: `<path d="M9 19C17 15.5 25 15.5 31 20V49C25 45.5 17 45.5 9 49Z" fill="#fff"/><path d="M55 19C47 15.5 39 15.5 33 20V49C39 45.5 47 45.5 55 49Z" fill="#fff"/>`,
  stundenplan: `<circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="5.5"/><path d="M32 21V32L39.5 36.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  schularbeiten: `<path d="M19 11H38L47 20V51a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V14a3 3 0 0 1 3-3Z" fill="#fde047"/><path d="M38 11V20H47Z" fill="#eab308"/><path d="M23 34L30 41L42 27" fill="none" stroke="#713f12" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`
};

// rund = true: abgerundetes Quadrat (Tab-Symbol); false: volle Fläche (Apple-Symbol, das System rundet selbst ab)
const svg = (glyph, rund) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6df0"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="64" height="64"${rund ? ' rx="15"' : ''} fill="url(#g)"/>${glyph}</svg>\n`;

const browser = await chromium.launch();
const seite = await browser.newPage();
for (const [name, glyph] of Object.entries(GLYPHEN)) {
  writeFileSync(path.join(ziel, `${name}.svg`), svg(glyph, true));
  for (const [px, rund] of [[32, true], [180, false]]) {
    await seite.setViewportSize({ width: px, height: px });
    await seite.setContent(`<body style="margin:0;background:transparent">${svg(glyph, rund).replace('<svg ', `<svg width="${px}" height="${px}" style="display:block" `)}</body>`);
    await seite.screenshot({ path: path.join(ziel, `${name}-${px}.png`), omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  }
  console.log(`shared/icons/${name}: svg, 32 px, 180 px`);
}
await browser.close();
