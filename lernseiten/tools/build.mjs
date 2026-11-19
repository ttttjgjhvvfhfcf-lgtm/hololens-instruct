// Baut den Suchindex und die Seitenliste des Lernportals aus faecher.json und den Fachseiten.
//   shared/daten.js   Fächer, Seiten und alle durchsuchbaren Abschnitte (für index.html)
//   shared/seiten.js  nur Fächer und Seiten (für die Querverweise auf den Fachseiten)
//   shared/stundenplan.js und shared/schularbeiten.js  aus stundenplan.json und schularbeiten.json (siehe tools/plan.mjs)
// Bindet außerdem hub.css, hub.js und das Seiten-Symbol (Tab-Icon, siehe tools/icons.mjs) in jede gelistete Seite ein, falls sie noch fehlen.
// Aufruf:  node tools/build.mjs     (braucht "playwright")
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { baue } from './plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const faecher = JSON.parse(readFileSync(path.join(root, 'faecher.json'), 'utf8'));
const portal = JSON.parse(readFileSync(path.join(root, 'portal.json'), 'utf8'));
// Seiten ohne "jahr" gehören automatisch zum aktuellen Schuljahr
for (const f of faecher) for (const s of f.seiten) if (!s.jahr) s.jahr = portal.aktuell;

// Gemeinsames Stylesheet und Skript einbinden (relativ zur Lage der Seite)
function einbinden(datei) {
  const file = path.join(root, datei);
  const shared = path.relative(path.dirname(file), path.join(root, 'shared')).split(path.sep).join('/');
  let html = readFileSync(file, 'utf8'), neu = html;
  if (!/hub\.css/.test(neu)) neu = neu.replace(/<\/head>/i, `<link rel="stylesheet" href="${shared}/hub.css">\n</head>`);
  if (!/rel=["']icon["']/.test(neu)) neu = neu.replace(/<\/head>/i, `<link rel="icon" href="${shared}/icons/lernportal.svg" type="image/svg+xml">\n<link rel="icon" href="${shared}/icons/lernportal-32.png" type="image/png" sizes="32x32">\n<link rel="apple-touch-icon" href="${shared}/icons/lernportal-180.png">\n</head>`);
  if (!/hub\.js/.test(neu)) neu = neu.replace(/<\/body>/i, `<script src="${shared}/hub.js"></script>\n</body>`);
  if (neu !== html) { writeFileSync(file, neu); console.log(`${datei}: Portal-Anbindung ergänzt`); }
}

const browser = await chromium.launch();
const sektionen = [];

for (const fach of faecher) {
  for (const seite of fach.seiten) {
    einbinden(seite.datei);
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(root, seite.datei)).href, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const secs = await page.evaluate(() => {
      // Muss zu SKIP/HEADS in shared/hub.js passen, damit der Sprung zum Treffer dieselben Überschriften findet
      const SKIP = '#exam-modal,#exam-overlay,[id*="modal"],[class*="overlay"],nav,aside,header,script,style,.katex-html,mjx-container,button,input,.toc-sidebar,#toasts,[id^="hub-"],.hub-noimg';
      const HEADS = 'h2,h3,h4,.sum-title,.aufgabe-title,.card-title,.textbook-head,.section-title,.card-head';
      const TOP = '.sum-title,.aufgabe-title,.card-title,.section-title';
      const rootEl = document.querySelector('main') || document.querySelector('.toc-main') || document.body;
      const clean = s => s.replace(/\s+/g, ' ').trim();
      const out = [];
      let cur = { h: '', t: '', k: '' }, parent = '';
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
            const top = n.matches(TOP), h = clean(n.textContent);
            if (top) parent = h;
            cur = { h, t: '', k: top ? '' : parent };
            skipUntil = n;
          }
        } else cur.t += ' ' + n.nodeValue;
      }
      if (cur.h || cur.t) out.push(cur);
      return out.map(s => ({ h: s.h, k: s.k, t: clean(s.t).slice(0, 1400) })).filter(s => s.h && s.h.length < 140);
    });
    seite.abschnitte = secs.length;
    seite.themen = secs.filter(s => !s.k).length;   // Hauptabschnitte
    for (const s of secs) sektionen.push({ f: fach.id, j: seite.jahr, d: seite.datei, h: s.h, k: s.k, t: s.t });
    console.log(`${seite.datei}: ${seite.themen} Themen, ${secs.length} Abschnitte`);
    await page.close();
  }
}
await browser.close();

const kopf = '/* Automatisch erzeugt von tools/build.mjs – nicht von Hand ändern. */\n';

// ── Stundenplan und Schularbeiten: prüfen, zu konkreten Wochen aufbereiten und ausgeben ──────────────────
{
  const lies = f => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
  const r = baue(lies('stundenplan.json'), faecher, lies('schularbeiten.json').schularbeiten);
  r.warnungen.forEach(w => console.warn('Hinweis: ' + w));
  if (r.fehler.length) { console.error('Stundenplan oder Schularbeiten fehlerhaft:\n - ' + r.fehler.join('\n - ')); process.exit(1); }
  writeFileSync(path.join(root, 'shared', 'stundenplan.js'), kopf + 'window.STUNDENPLAN = ' + JSON.stringify(r.plan) + ';\n');
  writeFileSync(path.join(root, 'shared', 'schularbeiten.js'), kopf + 'window.SCHULARBEITEN = ' + JSON.stringify(r.schularbeiten) + ';\n');
  const bloecke = r.plan.wochen.reduce((n, w) => n + Object.values(w.tage).reduce((m, l) => m + l.length, 0), 0);
  console.log(`stundenplan.js: ${r.plan.wochen.length} Wochen (${r.plan.wochen[0].von} bis ${r.plan.wochen.at(-1).bis}), ${bloecke} Blöcke, ${Object.keys(r.plan.lehrer).length} Lehrkräfte`);
  console.log(`schularbeiten.js: ${r.schularbeiten.length} Termine`);
}

const stand = new Date().toISOString().slice(0, 10);
const js = kopf + 'window.LERN = ' + JSON.stringify({ aktuell: portal.aktuell, jahre: portal.jahre, stand, faecher, sektionen }) + ';\n';
writeFileSync(path.join(root, 'shared', 'daten.js'), js);
const karte = faecher.map(f => ({ id: f.id, name: f.name, kurz: f.kurz,
  seiten: f.seiten.map(s => ({ datei: s.datei, titel: s.titel, art: s.art, jahr: s.jahr })) }));
writeFileSync(path.join(root, 'shared', 'seiten.js'), kopf + 'window.LERN_SEITEN = ' + JSON.stringify({ aktuell: portal.aktuell, jahre: portal.jahre, faecher: karte }) + ';\n');
console.log(`daten.js: ${sektionen.length} Abschnitte, ${(js.length / 1024).toFixed(0)} KB`);
