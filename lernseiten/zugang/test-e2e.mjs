// Ende-zu-Ende-Test der Anmeldung im Browser (Chromium über Playwright). Ein kleiner Server liefert den veröffentlichten Ordner so aus wie GitHub Pages
// (unter /hololens-instruct/, fehlende Dateien -> 404.html mit Status 404).
// Braucht den Klartext (lernseiten/klar/, siehe "auspacken") und das Passwort:  LERNPORTAL_PASSWORT=… node lernseiten/zugang/test-e2e.mjs
// Mit  --live https://…github.io/hololens-instruct/  läuft der Test gegen die veröffentlichte Seite (dann ohne Server und ohne Zugriff auf Dateien).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Kern from '../shared/zugang-kern.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HIER, '..');
const KLAR = path.join(PUB, 'klar');
const PW = process.env.LERNPORTAL_PASSWORT;
const SCHNELL = process.argv.includes('--schnell');   // überspringt die zwei langen Läufe über alle Dateien und Seiten (Abschnitt 3 und 4), zum schnellen Prüfen beim Entwickeln
const liveIdx = process.argv.indexOf('--live');
const LIVE = liveIdx > 0 ? process.argv[liveIdx + 1].replace(/\/?$/, '/') : null;
if (!PW || (!LIVE && !fs.existsSync(path.join(KLAR, 'index.html')))) {
  console.error('Der Test braucht LERNPORTAL_PASSWORT und (außer mit --live) den ausgepackten Klartext (node lernseiten/zugang/zugang.mjs auspacken).');
  process.exit(2);
}

let n = 0, fehl = 0;
const ok = (b, name, extra = '') => { n++; if (!b) { fehl++; console.log('✗', name, extra); } else console.log('✓', name); };
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const EMAIL = 'max.muster@lbs4.salzburg.at';

/* ── Server wie GitHub Pages ─────────────────────────────────────────────── */
const konf = JSON.parse(fs.readFileSync(path.join(PUB, 'shared', 'zugang.json'), 'utf8'));
const bi = process.argv.indexOf('--basis');
const BASISPFAD = LIVE ? new URL(LIVE).pathname : (bi > 0 ? process.argv[bi + 1] : '/hololens-instruct/');   // Pfad, unter dem der Test-Server das Portal ausliefert
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zugang-e2e-'));
const SITE = path.join(tmp, 'site', BASISPFAD.replace(/^\/|\/$/g, ''));
let server = null, BASE = LIVE;
const log = [];
if (!LIVE) {
  fs.cpSync(PUB, SITE, { recursive: true, filter: (src) => src !== KLAR && !src.startsWith(KLAR + path.sep) });
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname);
    log.push(p);
    const gesendet = (status, body, typ, extra = {}) => { res.writeHead(status, { 'Content-Type': typ, 'Cache-Control': 'max-age=600', ...extra }); res.end(body); };
    if (p === BASISPFAD.slice(0, -1)) { res.writeHead(301, { Location: BASISPFAD }); return res.end(); }
    let f = null;
    if (p.startsWith(BASISPFAD)) {
      let rel = p.slice(BASISPFAD.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const kand = path.join(SITE, rel);
      if (kand.startsWith(SITE + path.sep) && fs.existsSync(kand) && fs.statSync(kand).isFile()) f = kand;
    }
    if (!f) return gesendet(404, fs.readFileSync(path.join(SITE, '404.html')), 'text/html; charset=utf-8');
    const st = fs.statSync(f), etag = `"${st.size}-${Math.round(st.mtimeMs)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
    gesendet(200, fs.readFileSync(f), Kern.typ(f), { ETag: etag });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}${BASISPFAD}`;
}

/* ── Was im Klartext-Baum liegt (aus der entschlüsselten Dateiliste) ─────── */
const K = await Kern.huelleOeffnen(PW, konf.huelle);
const S = await Kern.schluessel(K);
const dateien = LIVE ? [] : JSON.parse(Buffer.from(await S.entschluesseln('.verzeichnis', fs.readFileSync(path.join(PUB, 'inhalt', (await S.dateiname('.verzeichnis')) + '.enc')))).toString('utf8')).dateien;
const seiten = dateien.filter((p) => p.endsWith('.html'));
const titelVon = (p) => /<title>([^<]*)<\/title>/i.exec(fs.readFileSync(path.join(KLAR, p), 'utf8'))?.[1];

/* ── Browser ─────────────────────────────────────────────────────────────── */
const browser = await chromium.launch(LIVE && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});   // in Sandboxen mit Ausgangs-Proxy
const BEKANNT = /faecher\/MET\/(%C3%96VE-Sicherheitskonzept|Grundregeln_elektrische)|favicon/;   // zwei Bilder der MET-Seite fehlen seit jeher
const neuerKontext = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const fehler = [];
  ctx.on('page', (pg) => {
    pg.on('pageerror', (e) => fehler.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.location().url) && !BEKANNT.test(m.location().url)) fehler.push('console: ' + m.text() + ' ' + m.location().url); });
    pg.on('response', (r) => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400 && !BEKANNT.test(u)) fehler.push(`HTTP ${r.status()} ${u}`); });
  });
  return { ctx, fehler };
};
const anmelden = async (page, { email = EMAIL, pw = PW, bleiben = true, warte = '#konto-aus, #hub-konto' } = {}) => {
  await page.fill('#email', email);
  await page.fill('#pw', pw);
  if (!bleiben) await page.uncheck('#bleiben');
  await page.click('#los');
  if (warte) await page.waitForSelector(warte, { timeout: 25000 });
};
const idbLesen = (page) => page.evaluate(() => new Promise((ok) => {
  const r = indexedDB.open('lernportal', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('sitzung');
  r.onsuccess = () => { const q = r.result.transaction('sitzung').objectStore('sitzung').get('aktuell'); q.onsuccess = () => { r.result.close(); ok(q.result || null); }; };
}));
const idbSchreiben = (page, wert) => page.evaluate((w) => new Promise((ok) => {
  const r = indexedDB.open('lernportal', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('sitzung');
  r.onsuccess = () => { const t = r.result.transaction('sitzung', 'readwrite'); t.objectStore('sitzung').put({ ...w, k: new Uint8Array(w.k) }, 'aktuell'); t.oncomplete = () => { r.result.close(); ok(); }; };
}), wert);

try {
  /* 1) Ohne Anmeldung: nur die Anmeldeseite, kein Klartext ------------------------------------------ */
  {
    const { ctx, fehler } = await neuerKontext();
    const page = await ctx.newPage();
    await page.goto(BASE);
    ok(await page.title() === 'Lernportal – Anmeldung' && await page.isVisible('#form'), 'ohne Anmeldung erscheint die Anmeldeseite');
    ok((await page.textContent('#domain')) === '@lbs4.salzburg.at', 'Anmeldeseite nennt die erlaubte Domain');
    ok(fehler.length === 0, 'Anmeldeseite lädt ohne Fehler', fehler.join(' | '));

    // Ältere Adressen und alle Dateien des Klartext-Baums müssen weg sein
    const alt = ['faecher/aee/kompensation.html', 'shared/daten.js', 'shared/hub.js', 'faecher.json', 'stundenplan.json', 'stundenplan.html', 'tools/seiten.py', 'quellen/'];
    const st = [];
    for (const a of alt) st.push(await page.evaluate(async (u) => (await fetch(u, { cache: 'no-store' })).status, BASE + a));
    ok(st.every((s) => s === 404 || s === 401), 'frühere Klartext-Adressen liefern nichts mehr', st.join(','));
    await ctx.close();
  }
  if (!LIVE) {
    // Nichts im Öffentlichen verrät Inhalt
    const marker = new Set(['Drehstrom', 'Pneumatik', 'Kompensation', 'Sternschaltung', 'Leitwert', 'Glaser']);
    for (const p of seiten) { const t = titelVon(p); if (t && t.length >= 12 && t !== konf.name) marker.add(t); }
    const treffer = [];
    const geh = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? geh(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of geh(SITE)) {
      const rel = path.relative(SITE, f);
      if (rel.startsWith('zugang' + path.sep) || rel === 'README.md') continue;
      const t = fs.readFileSync(f).toString('latin1');
      for (const m of marker) if (t.includes(m) || t.includes(Buffer.from(m, 'utf8').toString('latin1'))) treffer.push(`${rel}: ${m}`);
    }
    ok(treffer.length === 0, `im veröffentlichten Ordner steht kein Klartext (${marker.size} Merkmale geprüft)`, treffer.join(' | '));
  }

  /* 2) Tiefer Link ohne Sitzung -> Anmeldung -> zurück zur Seite ---------------------------------- */
  const tief = 'faecher/aee/kompensation.html';
  {
    const { ctx, fehler } = await neuerKontext();
    const page = await ctx.newPage();
    await page.goto(BASE + tief + '#abschnitt', { waitUntil: 'load' });
    await page.waitForSelector('#form');
    const u = new URL(page.url());
    ok(u.pathname === BASISPFAD && u.searchParams.get('weiter') === tief + '#abschnitt', 'tiefer Link ohne Anmeldung führt zur Anmeldung und merkt sich das Ziel', page.url());
    ok(/gewünschten Seite/.test(await page.textContent('#meldung')), 'tiefer Link: die Anmeldeseite sagt, dass es danach mit der Seite weitergeht');

    // Unbekannte Adresse mit Abfrage und Anker: die 404-Seite findet die Anmeldeseite über mehrere Ordner und merkt sich alles
    const k404 = await neuerKontext();
    const p404 = await k404.ctx.newPage();
    await p404.goto(BASE + 'faecher/xyz/gibt-es-nicht.html?q=1#frag');
    await p404.waitForSelector('#form');
    ok(new URL(p404.url()).searchParams.get('weiter') === 'faecher/xyz/gibt-es-nicht.html?q=1#frag', '404.html findet die Anmeldeseite über mehrere Ordner und merkt sich Abfrage und Anker', p404.url());
    await k404.ctx.close();
    if (!LIVE && BASISPFAD !== '/') {   // (liegt das Portal im Hauptordner der Adresse, gibt es überall eine Anmeldeseite in der Nähe)
      const kw = await neuerKontext();
      const weit = await kw.ctx.newPage();
      await weit.goto(new URL(BASE).origin + '/nirgendwo/seite.html');
      await weit.waitForFunction(() => /gibt es nicht/.test(document.body.textContent));
      ok(!weit.url().includes('weiter='), 'ohne Anmeldeseite in der Nähe endet die Weiterleitung mit einer Meldung, nicht in einer Schleife');
      await kw.ctx.close();
    }

    // Fehleingaben
    await page.fill('#email', 'max@gmail.com'); await page.fill('#pw', PW); await page.click('#los');
    ok(/Nur Adressen der LBS 4/.test(await page.textContent('#meldung')), 'fremde E-Mail-Domain wird abgelehnt');
    await page.fill('#email', 'kein-at-zeichen'); await page.click('#los');
    ok(/gültige E-Mail/.test(await page.textContent('#meldung')), 'ungültige E-Mail wird abgelehnt');
    await page.fill('#email', EMAIL); await page.fill('#pw', ''); await page.click('#los');
    ok(/Passwort eingeben/.test(await page.textContent('#meldung')), 'leeres Passwort wird abgelehnt');
    await page.fill('#pw', 'falsch-falsch-falsch'); await page.click('#los');
    await page.waitForFunction(() => /stimmt nicht/.test(document.getElementById('meldung').textContent));
    ok(await page.isVisible('#form') && page.url().includes('weiter='), 'falsches Passwort: Meldung, Anmeldeseite bleibt');
    ok((await page.getAttribute('#pw', 'aria-invalid')) === 'true' && (await page.getAttribute('#pw', 'aria-describedby')) === 'meldung', 'falsches Passwort: Feld ist für Vorlese-Programme als fehlerhaft gekennzeichnet');
    ok((await idbLesen(page)) === null, 'falsches Passwort speichert keinen Schlüssel');

    // Passwort anzeigen
    await page.click('#zeigen');
    ok((await page.getAttribute('#pw', 'type')) === 'text', 'Passwort lässt sich anzeigen');

    // Richtig anmelden (Schreibweise egal) -> Ziel der Anfrage
    await page.fill('#pw', ' ' + PW.toUpperCase() + ' ');
    await page.click('#los');
    await page.waitForSelector('#hub-konto', { timeout: 25000 });
    ok(new URL(page.url()).pathname === BASISPFAD + tief, 'nach der Anmeldung öffnet die gewünschte Seite', page.url());
    fehler.length = 0; log.length = 0;   // ab hier zählt: alles läuft über den Service Worker
    ok(!LIVE ? (await page.title()) === titelVon(tief) : (await page.title()).length > 3, 'die Seite ist die echte Lernseite (Titel stimmt)', await page.title());
    ok((await page.locator('body').innerText()).length > 2000, 'Lernseite hat ihren Inhalt');
    ok((await page.getAttribute('#hub-konto', 'title')).includes(EMAIL), 'Abmelden-Knopf nennt die angemeldete Adresse');

    const s = await idbLesen(page);
    ok(s && s.k.length === 32 && s.email === EMAIL && s.ablauf > Date.now() + 29 * 864e5, 'Schlüssel liegt für 30 Tage im Browser');
    ok((await page.evaluate(() => JSON.parse(localStorage.getItem('lernportal.nutzer')).name)) === 'Max Muster', 'Anzeigename wird gemerkt');

    // Portal
    await page.goto(BASE);
    await page.waitForSelector('#konto-aus');
    ok((await page.title()) === 'Lernportal' && await page.isVisible('#q'), 'angemeldet zeigt der Startordner das Portal');
    ok((await page.textContent('.konto-name')) === 'Max Muster', 'Portal zeigt den Namen neben Abmelden');
    ok((await page.locator('.fach').count()) >= 1, 'Portal zeigt die Fächer');

    // Suche und Sprung zum Treffer
    await page.fill('#q', 'Sternschaltung');
    await page.waitForSelector('#results a.res');
    const treffer = await page.locator('#results a.res').count();
    ok(treffer > 0, `Suche findet Treffer (${treffer})`);
    await page.locator('#results a.res').first().click();
    await page.waitForSelector('mark.hub-hit', { timeout: 10000 });
    ok(await page.isVisible('#hub-find'), 'Sprung zum Treffer mit Markierung funktioniert');

    // Bleibt angemeldet: Neuladen, neuer Tab
    await page.reload();
    await page.waitForSelector('#hub-konto');
    const zweite = await ctx.newPage();
    await zweite.goto(BASE + 'stundenplan.html');
    await zweite.waitForSelector('#konto-aus');
    ok(/Stundenplan/.test(await zweite.title()), 'Neuladen und neuer Tab bleiben angemeldet');
    await zweite.close();

    // „← Zur Suche“: Nach dem Sprung aus der Suche führt der Link oben mit dem Suchbegriff zum Portal zurück; das Portal stellt die Suche aus der Adresse wieder her
    // (der Service Worker reicht die Adresse mit ?q=… unverändert durch)
    ok((await page.textContent('#hub-back')) === '← Zur Suche', 'nach dem Sprung aus der Suche heißt der Link oben „← Zur Suche“');
    await page.click('#hub-back');
    await page.waitForSelector('#results a.res', { timeout: 10000 });
    ok(new URL(page.url()).searchParams.get('q') === 'Sternschaltung' && (await page.inputValue('#q')) === 'Sternschaltung', 'Zurück zur Suche: das Portal stellt die Suche aus der Adresse wieder her');

    ok(fehler.length === 0, 'keine Fehler in Konsole und Netz während der Sitzung', fehler.slice(0, 5).join(' | '));

    /* 3) Jede Datei kommt byte-gleich an ---------------------------------------------------------- */
    if (!LIVE) {
      if (!SCHNELL) {
        const verschieden = [], typFalsch = [];
        for (const p of dateien) {
          const r = await page.evaluate(async (u) => {
            const a = await fetch(u, { cache: 'no-store' });
            const b = new Uint8Array(await a.arrayBuffer());
            const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
            return { s: a.status, h, t: a.headers.get('content-type') };
          }, BASE + p);
          if (r.s !== 200 || r.h !== sha(fs.readFileSync(path.join(KLAR, p)))) verschieden.push(`${p} (${r.s})`);
          if (r.t !== Kern.typ(p)) typFalsch.push(`${p}: ${r.t}`);
        }
        ok(verschieden.length === 0, `alle ${dateien.length} Dateien kommen byte-gleich zum Klartext an`, verschieden.slice(0, 5).join(' | '));
        ok(typFalsch.length === 0, 'Inhaltstypen stimmen', typFalsch.slice(0, 3).join(' | '));
        const nf = await page.evaluate(async (u) => (await fetch(u)).status, BASE + 'faecher/gibt-es-nicht.html');
        ok(nf === 404, 'unbekannte Seite liefert 404', String(nf));
        const nav = await ctx.newPage();
        await nav.goto(BASE + 'faecher/gibt-es-nicht.html');
        ok(/Seite nicht gefunden/.test(await nav.content()) && !(await nav.isVisible('#form').catch(() => false)), 'angemeldet gibt es für Unbekanntes eine eigene Fehlerseite, keine Anmeldung');
        await nav.close();
        fehler.length = 0;   // das 404 der absichtlich unbekannten Seite ist erwartet

        /* 4) Jede Seite so wie vorher: Text gleich dem lokal geöffneten Klartext --------------------- */
        const Q = '?zeit=2026-11-24T10:15';
        const festerZufall = () => { Math.random = () => 0.42; };   // manche Seiten zeigen eine zufällige Formel
        const vk = await neuerKontext();                              // eigener angemeldeter Browser ohne Verlauf (zuletzt geöffnet, letzte Suchen)
        await vk.ctx.addInitScript(festerZufall);
        const vp = await vk.ctx.newPage();
        await vp.goto(BASE);
        await vp.waitForSelector('#form');
        await vp.evaluate(() => navigator.serviceWorker.ready);
        await idbSchreiben(vp, { k: [...K], email: EMAIL, ablauf: Date.now() + 1e7 });
        await vp.evaluate((e) => localStorage.setItem('lernportal.nutzer', JSON.stringify({ email: e, name: 'Max Muster', ablauf: Date.now() + 1e7 })), EMAIL);
        const lokal = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await lokal.addInitScript(festerZufall);
        const alle = seiten;
        const verschiedeneSeiten = [], leer = [];
        // Die Simulationen (sim/) sind Animationen: Winkel und Spannungen ändern sich laufend. Dort zählt der Text ohne Zahlen.
        const zahlenlos = (t) => t.replace(/-?\d+(?:[.,]\d+)?/g, '#').replace(/\s+/g, ' ');
        const text = async (pg, url) => { await pg.goto(url, { waitUntil: 'load' }); await pg.waitForTimeout(500); return pg.evaluate(() => { document.querySelectorAll('#konto,#hub-konto').forEach((e) => e.remove()); return document.body.innerText.replace(/\s+/g, ' ').trim(); }); };
        for (const p of alle) {
          const a = await text(vp, BASE + p + Q);
          const lp = await lokal.newPage();
          const b = await text(lp, pathToFileURL(path.join(KLAR, p)).href + Q);
          await lp.close();
          if (a !== b && !(/(^|\/)sim\//.test(p) && zahlenlos(a) === zahlenlos(b))) { let i = 0; while (a[i] === b[i]) i++; verschiedeneSeiten.push(`${p} @${i}: [${a.slice(Math.max(0, i - 30), i + 50)}] <> [${b.slice(Math.max(0, i - 30), i + 50)}]`); }
          if (a.length < 100) leer.push(p);
        }
        await lokal.close();
        ok(leer.length === 0, `alle ${alle.length} Seiten haben Inhalt`, leer.join(', '));
        ok(verschiedeneSeiten.length === 0, `alle ${alle.length} Seiten zeigen denselben Text wie ohne Anmeldung`, verschiedeneSeiten.join(' | '));
        ok(vk.fehler.length === 0, 'keine Fehler beim Aufruf aller Seiten', vk.fehler.slice(0, 5).join(' | '));
        await vk.ctx.close();
        if (!LIVE) {
          const erlaubt = new RegExp('^' + BASISPFAD.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(inhalt/[0-9a-f]{32}\\.enc|sw\\.js|shared/(zugang-kern\\.js|zugang\\.json|icons/[^/]+)|index\\.html|404\\.html)?$');
          const fremd = [...new Set(log)].filter((p) => !erlaubt.test(p) && !/favicon/.test(p));
          ok(fremd.length === 0, 'der Server sah nur Anmeldeseite, Symbole und verschlüsselte Dateien', fremd.slice(0, 5).join(' | '));
        }
      }

      /* 5) Ohne Netz: bereits geöffnete Seiten kommen aus dem verschlüsselten Zwischenspeicher ------ */
      await page.goto(BASE + 'stundenplan.html');
      await page.waitForSelector('#konto-aus');
      await page.waitForLoadState('networkidle').catch(() => {});   // späte Anfragen der Seite (Schriften, Symbol) sollen nicht als „Server-Aufruf ohne Netz“ zählen
      await page.waitForTimeout(300);
      const vorher = log.length;
      await ctx.setOffline(true);
      let ohneNetz = false;
      try { await page.reload({ timeout: 15000 }); await page.waitForSelector('#konto-aus', { timeout: 10000 }); ohneNetz = true; } catch (e) {}
      await ctx.setOffline(false);
      ok(ohneNetz && log.length === vorher, 'ohne Netz lädt eine schon besuchte Seite aus dem Zwischenspeicher (der Server sah nichts)', `Server-Aufrufe: +${log.length - vorher}`);

      // Eine Seite, die auf diesem Gerät noch nie geöffnet wurde, ohne Netz: Erklärung statt Fehlerseite des Browsers; mit dem Netz kommt die Seite von selbst.
      // Der Zwischenspeicher wird vorher geleert, damit die Seite sicher „nie geöffnet“ ist (der Lauf über alle Seiten hat sie sonst schon abgelegt).
      // Die Seite lädt nichts von fremden Servern außer den Schriften: Eine Seite mit Bibliothek von cdnjs (z. B. aee/merksaetze) lädt in Umgebungen mit gesperrtem cdnjs zu langsam für die Wartezeit unten.
      await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
      await ctx.setOffline(true);
      let off = {};
      try {
        const r = await page.goto(BASE + 'faecher/pb/sozialversicherung.html', { timeout: 15000 });
        off = { status: r && r.status(), h1: await page.textContent('h1'), knopf: await page.isVisible('button.z'), start: await page.isVisible(`a[href="${BASISPFAD}"]`) };
      } catch (e) { off = { fehler: String(e.message).slice(0, 100) }; }
      ok(off.status === 503 && off.h1 === 'Kein Netz' && off.knopf && off.start, 'nie geöffnete Seite ohne Netz: Hinweisseite mit „Erneut versuchen“ und Weg zur Startseite', JSON.stringify(off));
      await ctx.setOffline(false);
      await page.waitForSelector('#hub-konto', { timeout: 15000 }).catch(() => {});
      ok(await page.isVisible('#hub-konto').catch(() => false), 'sobald das Netz zurück ist, lädt die Hinweisseite die Seite von selbst');

      // Unbekannte Adresse (angemeldet): eigene Seite mit Weg zur Startseite, Status 404; Bilder und Skripte bekommen nur Text
      const nf2 = await ctx.newPage();
      const r404 = await nf2.goto(BASE + 'faecher/gibt-es-nicht.html');
      ok(r404.status() === 404 && (await nf2.textContent('h1')) === 'Seite nicht gefunden' && await nf2.isVisible(`a[href="${BASISPFAD}"]`), 'unbekannte Adresse: Hinweisseite mit Weg zur Startseite', String(r404.status()));
      const bild = await nf2.evaluate(async (u) => { const a = await fetch(u); return { s: a.status, t: a.headers.get('content-type') }; }, BASE + 'faecher/gibt-es-nicht.png');
      ok(bild.s === 404 && /^text\/plain/.test(bild.t), 'unbekannte Datei (kein Seitenaufruf): nur Text, keine Seite', JSON.stringify(bild));
      await nf2.close();
      fehler.length = 0;
    }

    /* 6) Abmelden -------------------------------------------------------------------------------- */
    await page.goto(BASE);
    await page.waitForSelector('#konto-aus');
    await page.click('#konto-aus');
    await page.waitForSelector('#form');
    ok(new URL(page.url()).searchParams.get('abgemeldet') === '1' && /abgemeldet/.test(await page.textContent('#meldung')), 'Abmelden führt zur Anmeldeseite mit Hinweis');
    ok((await idbLesen(page)) === null && (await page.evaluate(() => localStorage.getItem('lernportal.nutzer'))) === null, 'Abmelden löscht Schlüssel und Namen');
    const nachher = await page.evaluate(async (u) => (await fetch(u)).status, BASE + 'shared/hub.js');
    ok(nachher === 401, 'nach dem Abmelden liefert der Service Worker nichts mehr aus', String(nachher));
    await page.goto(BASE + 'stundenplan.html');
    await page.waitForSelector('#form');
    ok(new URL(page.url()).searchParams.get('weiter') === 'stundenplan.html', 'nach dem Abmelden führt jede Seite zur Anmeldung');
    await page.goto(BASE + 'stundenplan.html#x');
    await page.waitForSelector('#form');
    ok(new URL(page.url()).hash === '#x', 'der Anker bleibt bei der Weiterleitung des Service Workers erhalten');
    await anmelden(page);
    ok(page.url() === BASE + 'stundenplan.html#x', 'nach der Anmeldung öffnet die Seite mit dem Anker', page.url());
    await ctx.close();
  }

  /* 7) Abmelden von einer Lernseite aus ----------------------------------------------------------- */
  {
    const { ctx } = await neuerKontext();
    const page = await ctx.newPage();
    await page.goto(BASE + tief);
    await page.waitForSelector('#form');
    await anmelden(page, { bleiben: false });
    const s = await idbLesen(page);
    ok(s && s.ablauf < Date.now() + 13 * 36e5 && s.ablauf > Date.now() + 11 * 36e5, 'ohne „Angemeldet bleiben“ gilt die Sitzung 12 Stunden');
    await page.click('#hub-konto');
    await page.waitForSelector('#form');
    ok(/abgemeldet/.test(await page.textContent('#meldung')) && (await idbLesen(page)) === null, 'Abmelden auf einer Lernseite funktioniert');
    await ctx.close();
  }

  /* 8) Abgelaufene und falsche Schlüssel ---------------------------------------------------------- */
  if (!LIVE) {
    const { ctx } = await neuerKontext();
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForSelector('#form');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await idbSchreiben(page, { k: [...K], email: EMAIL, ablauf: Date.now() - 1000 });
    await page.goto(BASE + 'stundenplan.html');
    await page.waitForSelector('#form');
    ok(page.url().includes('weiter=stundenplan.html'), 'abgelaufene Sitzung verlangt die Anmeldung');
    await idbSchreiben(page, { k: [...K], email: EMAIL, ablauf: Date.now() + 1e7 });
    await page.goto(BASE + 'stundenplan.html');
    await page.waitForFunction(() => /Stundenplan/.test(document.title), null, { timeout: 15000 }).catch(() => {});
    ok(/Stundenplan/.test(await page.title()), 'gültiger Schlüssel im Browser genügt für den Zugriff');
    await ctx.close();

    const k2 = await neuerKontext();
    const p2 = await k2.ctx.newPage();
    await p2.goto(BASE);
    await p2.waitForSelector('#form');
    await p2.evaluate(() => navigator.serviceWorker.ready);
    await idbSchreiben(p2, { k: [...Kern.zufall(32)], email: EMAIL, ablauf: Date.now() + 1e7 });
    await p2.goto(BASE + 'stundenplan.html');
    await p2.waitForSelector('#form');
    ok(/neu anmelden/.test(await p2.textContent('#meldung')) && (await idbLesen(p2)) === null, 'falscher Schlüssel (Passwortwechsel) verlangt eine neue Anmeldung');
    await k2.ctx.close();
  }

  /* 8b) Anmeldedaten nicht ladbar (kein Netz, Server kurz weg): Meldung mit „Erneut versuchen“, keine Sackgasse; Enter im E-Mail-Feld geht zum Passwort ---------- */
  {
    const { ctx } = await neuerKontext();
    const page = await ctx.newPage();
    const URL_KONF = '**/shared/zugang.json';
    await page.route(URL_KONF, (r) => r.abort());
    await page.goto(BASE);
    await page.waitForSelector('#nochmal:not([hidden])');
    ok(/nicht geladen/.test(await page.textContent('#meldung')) && await page.isDisabled('#pw') && await page.isDisabled('#los'), 'Anmeldedaten nicht ladbar: Meldung und „Erneut versuchen“, Felder gesperrt');
    await page.unroute(URL_KONF);
    await page.click('#nochmal');
    await page.waitForFunction(() => !document.getElementById('pw').disabled);
    ok(await page.isHidden('#meldung') && await page.isHidden('#nochmal') && await page.isEnabled('#los'), '„Erneut versuchen“ lädt die Anmeldedaten nach, ohne die Seite neu zu laden');
    await page.fill('#email', EMAIL);
    await page.press('#email', 'Enter');
    ok((await page.evaluate(() => document.activeElement.id)) === 'pw' && await page.isHidden('#meldung'), 'Enter im E-Mail-Feld springt zum Passwort (keine Fehlermeldung)');

    await page.route(URL_KONF, (r) => r.abort());
    await page.reload();
    await page.waitForSelector('#nochmal:not([hidden])');
    await ctx.setOffline(true);
    await page.click('#nochmal');
    await page.waitForFunction(() => /offline/.test(document.getElementById('meldung').textContent));
    ok(await page.isVisible('#nochmal') && await page.isDisabled('#pw'), 'ohne Netz: „Du bist offline“ statt einer allgemeinen Fehlermeldung');
    await page.unroute(URL_KONF);
    await ctx.setOffline(false);
    await page.waitForFunction(() => !document.getElementById('pw').disabled, null, { timeout: 10000 }).catch(() => {});
    ok(await page.isEnabled('#pw') && await page.isHidden('#nochmal'), 'sobald das Netz zurück ist, ist die Anmeldung von selbst wieder bedienbar');
    await ctx.close();
  }

  /* 9) Eine zweite Person im selben Browser-Profil gibt es nicht: frischer Kontext sieht nichts ---------- */
  {
    const { ctx } = await neuerKontext();
    const page = await ctx.newPage();
    await page.goto(BASE);
    ok(await page.isVisible('#form'), 'ein frischer Browser sieht wieder nur die Anmeldung');
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${n - fehl}/${n} Prüfungen bestanden`);
process.exit(fehl ? 1 : 0);
