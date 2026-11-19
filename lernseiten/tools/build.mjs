// Baut den Suchindex und die Seitenliste des Lernportals aus faecher.json und den Fachseiten.
//   shared/daten.js   Fächer, Seiten und alle durchsuchbaren Abschnitte (für index.html)
//   shared/seiten.js  nur Fächer und Seiten (für die Querverweise auf den Fachseiten)
// Bindet außerdem hub.css und hub.js in jede gelistete Seite ein, falls sie noch fehlen.
// Aufruf:  node tools/build.mjs     (braucht "playwright")
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

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

// ── Stundenplan: stundenplan.json prüfen und als shared/stundenplan.js ausgeben ──────────────────────────
{
  const plan = JSON.parse(readFileSync(path.join(root, 'stundenplan.json'), 'utf8'));
  const fehler = [];
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/, datum = /^\d{4}-\d{2}-\d{2}$/;
  const min = s => +s.slice(0, 2) * 60 + +s.slice(3);
  let vorher = -1;
  plan.einheiten.forEach(([a, b], i) => {
    if (!hm.test(a) || !hm.test(b) || min(a) >= min(b)) fehler.push(`Einheit ${i + 1}: ungültige Zeiten ${a}–${b}`);
    if (min(a) < vorher) fehler.push(`Einheit ${i + 1}: beginnt vor dem Ende der vorigen`);
    vorher = min(b);
  });
  // Portal-Fächer liefern Farbe und Name; weitere Fächer bringen ihre Farbe selbst mit
  for (const [code, f] of Object.entries(plan.faecher)) {
    const p = f.portal && faecher.find(x => x.id === f.portal);
    if (f.portal && !p) fehler.push(`Fach ${code}: Portal-Fach "${f.portal}" gibt es nicht`);
    if (p) { f.farbe = p.farbe; f.farbeDunkel = p.farbeDunkel; f.portalName = p.name; }
    else if (!f.farbe || !f.farbeDunkel) fehler.push(`Fach ${code}: Farbe fehlt`);
  }
  let bloecke = 0;
  plan.wochen.forEach((w, wi) => {
    if (!datum.test(w.von) || !datum.test(w.bis) || w.von > w.bis) fehler.push(`Woche ${wi + 1}: ungültiger Zeitraum`);
    for (const [tag, liste] of Object.entries(w.tage)) {
      if (!['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'].includes(tag)) fehler.push(`Woche ${wi + 1}: unbekannter Tag "${tag}"`);
      const belegt = new Set();
      for (const b of liste) {
        bloecke++;
        const wo = `Woche ${wi + 1} ${tag} ab ${b.ab}`;
        if (!Number.isInteger(b.ab) || !Number.isInteger(b.bis) || b.ab < 1 || b.bis > plan.einheiten.length || b.ab > b.bis) fehler.push(`${wo}: ungültige Einheiten`);
        if (!plan.faecher[b.fach]) fehler.push(`${wo}: Fach "${b.fach}" ist nicht definiert`);
        if (!b.gruppen?.length) fehler.push(`${wo}: keine Lehrkraft angegeben`);
        for (const g of b.gruppen || []) if (!plan.lehrer[g.lehrer]) fehler.push(`${wo}: Kürzel "${g.lehrer}" fehlt in "lehrer"`);
        if (b.status && !['aenderung', 'entfall', 'pruefung'].includes(b.status)) fehler.push(`${wo}: unbekannter Status "${b.status}"`);
        for (let n = b.ab; n <= b.bis; n++) { if (belegt.has(n)) fehler.push(`${wo}: Einheit ${n} ist doppelt belegt`); belegt.add(n); }
      }
    }
  });
  if (fehler.length) { console.error('stundenplan.json fehlerhaft:\n - ' + fehler.join('\n - ')); process.exit(1); }
  writeFileSync(path.join(root, 'shared', 'stundenplan.js'), kopf + 'window.STUNDENPLAN = ' + JSON.stringify(plan) + ';\n');
  console.log(`stundenplan.js: ${plan.wochen.length} Woche(n), ${bloecke} Blöcke, ${Object.keys(plan.lehrer).length} Lehrkräfte`);
}

const stand = new Date().toISOString().slice(0, 10);
const js = kopf + 'window.LERN = ' + JSON.stringify({ aktuell: portal.aktuell, jahre: portal.jahre, stand, faecher, sektionen }) + ';\n';
writeFileSync(path.join(root, 'shared', 'daten.js'), js);
const karte = faecher.map(f => ({ id: f.id, name: f.name, kurz: f.kurz,
  seiten: f.seiten.map(s => ({ datei: s.datei, titel: s.titel, art: s.art, jahr: s.jahr })) }));
writeFileSync(path.join(root, 'shared', 'seiten.js'), kopf + 'window.LERN_SEITEN = ' + JSON.stringify({ aktuell: portal.aktuell, jahre: portal.jahre, faecher: karte }) + ';\n');
console.log(`daten.js: ${sektionen.length} Abschnitte, ${(js.length / 1024).toFixed(0)} KB`);
