// Baut shared/daten.js (Fächerliste + Suchindex) aus faecher.json und den Fachseiten.
// Aufruf:  node tools/build.mjs     (braucht "playwright")
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const faecher = JSON.parse(readFileSync(path.join(root, 'faecher.json'), 'utf8'));
const browser = await chromium.launch();
const sektionen = [];

for (const fach of faecher) {
  for (const seite of fach.seiten) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(root, seite.datei)).href, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const secs = await page.evaluate(() => {
      const SKIP = '#exam-modal,#exam-overlay,[id*="modal"],[class*="overlay"],nav,header,script,style,.katex-html,mjx-container,button,input,#hub-back,.toc-sidebar,#toasts';
      const HEADS = 'h2,h3,h4,.sum-title,.aufgabe-title,.card-title,.textbook-head,.section-title,.card-head';
      const rootEl = document.querySelector('main') || document.body;
      const clean = s => s.replace(/\s+/g, ' ').trim();
      const out = [];
      let cur = { h: '', t: '', k: '' }; let parent = '';
      const tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (n.nodeType === 1) return n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let n, skipUntil = null;
      while ((n = tw.nextNode())) {
        if (skipUntil) { if (skipUntil.contains(n)) continue; skipUntil = null; }
        if (n.nodeType === 1) {
          if (n.matches(HEADS)) {
            if (cur.h || cur.t) out.push(cur);
            const top = n.matches('.sum-title,.aufgabe-title,.card-title,.section-title'); const h = clean(n.textContent);
            if (top) parent = h;
            cur = { h, t: '', k: top ? '' : parent };
            skipUntil = n;
          }
        } else cur.t += ' ' + n.nodeValue;
      }
      if (cur.h || cur.t) out.push(cur);
      return out.map(s => ({ h: s.h, k: s.k, t: clean(s.t).slice(0, 1400) })).filter(s => s.h && s.h.length < 140);
    });
    seite.themen = secs.length;
    for (const s of secs) sektionen.push({ f: fach.id, d: seite.datei, h: s.h, k: s.k, t: s.t });
    console.log(`${seite.datei}: ${secs.length} Abschnitte`);
    await page.close();
  }
}
await browser.close();
const js = '/* Automatisch erzeugt von tools/build.mjs – nicht von Hand ändern. */\n' +
  'window.LERN = ' + JSON.stringify({ stand: new Date().toISOString().slice(0, 10), faecher, sektionen }) + ';\n';
writeFileSync(path.join(root, 'shared', 'daten.js'), js);
console.log(`daten.js: ${sektionen.length} Abschnitte, ${(js.length / 1024).toFixed(0)} KB`);
