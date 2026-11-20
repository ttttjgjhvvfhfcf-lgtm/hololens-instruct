#!/usr/bin/env node
// Lernportal – Zugang: veröffentlicht den Klartext (lernseiten/klar/, nicht im Git) verschlüsselt unter lernseiten/inhalt/ und holt ihn zurück.
//
//   node lernseiten/zugang/zugang.mjs auspacken [--ueberschreiben]   inhalt/ -> klar/   (am Anfang jeder Sitzung, die etwas ändern will)
//   node lernseiten/zugang/zugang.mjs einpacken                      klar/ -> inhalt/   (nach jeder Änderung, vor dem Commit)
//   node lernseiten/zugang/zugang.mjs pruefe                         prüft, dass nur Erlaubtes öffentlich ist und alles entschlüsselbar ist
//   node lernseiten/zugang/zugang.mjs init [--domain d]              erstmalig: Schlüssel und Passwort erzeugen
//   node lernseiten/zugang/zugang.mjs export <leerer Ordner>         nur das Öffentliche (verschlüsselt) für ein neues Repository herauskopieren
//   node lernseiten/zugang/zugang.mjs passwort [--passwort neu]      neues Passwort UND neuer Schlüssel (alle Dateien werden neu verschlüsselt)
//
// Das Passwort kommt aus der Umgebung (LERNPORTAL_PASSWORT) oder der Wiederherstellungsschlüssel (LERNPORTAL_SCHLUESSEL), nie aus dem Repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import Kern from '../shared/zugang-kern.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HIER, '..');              // lernseiten/ (wird veröffentlicht)
const KLAR = path.join(PUB, 'klar');               // Klartext, vom Git ausgeschlossen
const INHALT = path.join(PUB, 'inhalt');           // verschlüsselte Dateien
const ICONS = path.join(PUB, 'shared', 'icons');   // Seiten-Symbole bleiben öffentlich (Tab-Icon der Anmeldeseite)
const KONF = path.join(PUB, 'shared', 'zugang.json');
const VERZEICHNIS = '.verzeichnis';                // Pfad der verschlüsselten Dateiliste
const MAX_DATEI = 25 * 1024 * 1024;

// Im Klartext-Baum nicht mit verpacken
const NICHT_PACKEN = [/(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /(^|\/)__pycache__(\/|$)/, /\.pyc$/, /(^|\/)node_modules(\/|$)/, /(^|\/)\.git(\/|$)/, /^\.gitignore$/,
  /^shared\/zugang-kern\.js$/, /^shared\/zugang\.json$/, /^shared\/icons\//];
// Das darf im veröffentlichten Ordner liegen (alles andere ist ein Fehler)
const OEFFENTLICH = [/^index\.html$/, /^404\.html$/, /^sw\.js$/, /^\.nojekyll$/, /^README\.md$/, /^shared\/zugang-kern\.js$/, /^shared\/zugang\.json$/,
  /^shared\/icons\/[^/]+\.(svg|png)$/, /^inhalt\/[0-9a-f]{32}\.enc$/, /^zugang\/[^/]+\.(mjs|md)$/, /^klar\/\.gitignore$/];

const aus = (t) => { console.error(t); process.exit(1); };
const sortiert = (a) => a.slice().sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
const gleich = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

function konfLesen() {
  if (!fs.existsSync(KONF)) aus('shared/zugang.json fehlt. Erstmalig: node lernseiten/zugang/zugang.mjs init');
  return JSON.parse(fs.readFileSync(KONF, 'utf8'));
}
function konfSchreiben(k) { fs.writeFileSync(KONF, JSON.stringify(k, null, 2) + '\n'); }

async function schluesselHolen(konf) {
  const wk = process.env.LERNPORTAL_SCHLUESSEL;
  if (wk) { const K = Kern.unb64(wk.trim()); if (K.length !== 32) aus('LERNPORTAL_SCHLUESSEL hat die falsche Länge.'); return K; }
  const pw = process.env.LERNPORTAL_PASSWORT;
  if (!pw) aus('Es fehlt das Passwort: Umgebungsvariable LERNPORTAL_PASSWORT (oder LERNPORTAL_SCHLUESSEL) setzen.');
  try { return await Kern.huelleOeffnen(pw, konf.huelle); }
  catch (e) { aus(e.code === 'PASSWORT' ? 'LERNPORTAL_PASSWORT stimmt nicht.' : String(e.message || e)); }
}

function passwortErzeugen() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';   // 31 Zeichen ohne i, l, o, 0, 1; 12 Zeichen = rund 59 Bit
  let s = '';
  while (s.length < 12) { const b = Kern.zufall(1)[0]; if (b < 31 * 8) s += abc[b % 31]; }
  return s.match(/.{4}/g).join('-');
}

function baum(dir, rel = '') {
  const aus_ = [];
  if (!fs.existsSync(dir)) return aus_;
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) aus_.push(...baum(dir, r)); else if (e.isFile()) aus_.push(r);
  }
  return sortiert(aus_);
}

function vorlage404(name) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${name}</title>
</head>
<body style="font:16px system-ui,sans-serif;padding:2rem">
<p>Einen Moment …</p>
<script>
/* Diese Adresse gibt es im öffentlichen Ordner nicht. Angemeldete Browser bekommen sie vom Service Worker; hier landen alle anderen. Die Anmeldeseite wird in den
   übergeordneten Ordnern gesucht (shared/zugang.json), dorthin geht es mit der gewünschten Adresse als ?weiter=. Kein fester Pfad, nichts zu pflegen. */
(async function () {
  var T = 'lernportal.404', jetzt = Date.now(), v = null;
  try { v = JSON.parse(sessionStorage.getItem(T)); } catch (e) {}
  if (!v || jetzt - v.t > 10000) v = { n: 0, t: jetzt };
  var nichts = function () { document.body.textContent = 'Diese Seite gibt es nicht.'; };
  if (++v.n > 3) return nichts();                                  // nie im Kreis laufen
  try { sessionStorage.setItem(T, JSON.stringify(v)); } catch (e) {}
  for (var d = 0; d <= 8; d++) {
    var basis = new URL(d ? '../'.repeat(d) : './', location.href);
    try {
      var r = await fetch(new URL('shared/zugang.json', basis), { cache: 'no-cache' });
      var j = r.ok ? await r.json() : null;
      if (j && j.huelle) {
        location.replace(basis.pathname + '?weiter=' + encodeURIComponent(location.pathname.slice(basis.pathname.length) + location.search + location.hash));
        return;
      }
    } catch (e) {}
  }
  nichts();
})();
</script>
</body>
</html>
`;
}

/* ── einpacken ─────────────────────────────────────────────────────────────── */
async function einpacken(K, konf) {
  if (!fs.existsSync(path.join(KLAR, 'index.html'))) aus('lernseiten/klar/ ist leer. Erst auspacken: node lernseiten/zugang/zugang.mjs auspacken');
  const S = await Kern.schluessel(K);
  const pfade = baum(KLAR).filter((p) => !NICHT_PACKEN.some((re) => re.test(p)));
  fs.mkdirSync(INHALT, { recursive: true });
  const soll = new Set();
  let neu = 0, gesamt = 0;
  const schreibe = async (pfad, daten) => {
    const name = (await S.dateiname(pfad)) + '.enc';
    const blob = await S.verschluesseln(pfad, daten);
    const ziel = path.join(INHALT, name);
    soll.add(name); gesamt += blob.length;
    if (!fs.existsSync(ziel) || !gleich(fs.readFileSync(ziel), blob)) { fs.writeFileSync(ziel, blob); neu++; }
  };
  for (const p of pfade) {
    const daten = fs.readFileSync(path.join(KLAR, p));
    if (daten.length > MAX_DATEI) aus(`${p} ist größer als 25 MB.`);
    await schreibe(p, daten);
  }
  await schreibe(VERZEICHNIS, Buffer.from(JSON.stringify({ v: 1, dateien: pfade })));
  let weg = 0;
  for (const f of fs.readdirSync(INHALT)) if (!soll.has(f)) { fs.unlinkSync(path.join(INHALT, f)); weg++; }

  // Symbole öffentlich spiegeln
  const iconsKlar = baum(path.join(KLAR, 'shared', 'icons'));
  fs.mkdirSync(ICONS, { recursive: true });
  for (const f of iconsKlar) fs.copyFileSync(path.join(KLAR, 'shared', 'icons', f), path.join(ICONS, f));
  for (const f of fs.readdirSync(ICONS)) if (!iconsKlar.includes(f)) fs.unlinkSync(path.join(ICONS, f));

  fs.writeFileSync(path.join(PUB, '.nojekyll'), '');
  fs.writeFileSync(path.join(PUB, '404.html'), vorlage404(konf.name));
  console.log(`eingepackt: ${pfade.length} Dateien (${(gesamt / 1024).toFixed(0)} KiB verschlüsselt), ${neu} neu oder geändert, ${weg} entfernt`);
}

/* ── auspacken ─────────────────────────────────────────────────────────────── */
async function auspacken(K, ueberschreiben) {
  const vorhanden = baum(KLAR).filter((p) => p !== '.gitignore');
  if (vorhanden.length && !ueberschreiben) aus(`lernseiten/klar/ enthält schon ${vorhanden.length} Dateien. Mit --ueberschreiben werden sie ersetzt.`);
  const S = await Kern.schluessel(K);
  const verz = path.join(INHALT, (await S.dateiname(VERZEICHNIS)) + '.enc');
  if (!fs.existsSync(verz)) aus('inhalt/ enthält keine Dateiliste (falscher Schlüssel oder leerer Bestand).');
  let liste;
  try { liste = JSON.parse(Buffer.from(await S.entschluesseln(VERZEICHNIS, fs.readFileSync(verz))).toString('utf8')).dateien; }
  catch (e) { aus('Die Dateiliste lässt sich nicht entschlüsseln (falscher Schlüssel?).'); }
  fs.mkdirSync(KLAR, { recursive: true });
  if (!fs.existsSync(path.join(KLAR, '.gitignore'))) fs.writeFileSync(path.join(KLAR, '.gitignore'), '*\n!.gitignore\n');
  for (const p of liste) {
    if (p.split('/').includes('..') || path.isAbsolute(p)) aus('Ungültiger Pfad in der Dateiliste: ' + p);
    const blob = fs.readFileSync(path.join(INHALT, (await S.dateiname(p)) + '.enc'));
    const ziel = path.join(KLAR, p);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, await S.entschluesseln(p, blob));
  }
  // Symbole liegen im Klartext-Baum wieder dort, wo die Werkzeuge sie erwarten
  fs.mkdirSync(path.join(KLAR, 'shared', 'icons'), { recursive: true });
  for (const f of baum(ICONS)) fs.copyFileSync(path.join(ICONS, f), path.join(KLAR, 'shared', 'icons', f));
  console.log(`ausgepackt: ${liste.length} Dateien nach lernseiten/klar/`);
}

/* ── pruefe ────────────────────────────────────────────────────────────────── */
function veroeffentlicht() {
  try {
    const t = execFileSync('git', ['-C', PUB, 'ls-files', '--cached', '--others', '--exclude-standard', '--', '.'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return sortiert(t.split('\n').filter(Boolean)).filter((p) => fs.existsSync(path.join(PUB, p)));   // im Git-Index, aber gelöscht: wird nicht veröffentlicht
  } catch (e) { return baum(PUB).filter((p) => !p.startsWith('klar/') || p === 'klar/.gitignore'); }
}
async function pruefe(konf, K) {
  const probleme = [];
  const pub = veroeffentlicht();
  for (const p of pub) if (!OEFFENTLICH.some((re) => re.test(p))) probleme.push(`nicht erlaubt im öffentlichen Ordner: ${p}`);
  // Alles in inhalt/ muss gültiger Chiffretext sein
  const blobs = fs.existsSync(INHALT) ? fs.readdirSync(INHALT) : [];
  for (const f of blobs) { const b = fs.readFileSync(path.join(INHALT, f)); if (b.length < 31 || b[0] !== 0x4c || b[1] !== 0x50 || b[2] !== 1) probleme.push(`inhalt/${f} ist kein gültiger Chiffretext`); }
  // Geheimnisse dürfen nirgends im Öffentlichen stehen
  const geheim = [process.env.LERNPORTAL_PASSWORT, process.env.LERNPORTAL_SCHLUESSEL, K && Kern.b64(K), K && Kern.hex(K)].filter((s) => s && s.length >= 8);
  const titel = [];
  for (const p of baum(KLAR).filter((x) => /\.html$/.test(x))) {
    const m = /<title>([^<]{6,})<\/title>/i.exec(fs.readFileSync(path.join(KLAR, p), 'utf8'));
    if (m && m[1].trim().length >= 12 && m[1].trim() !== konf.name) titel.push(m[1].trim());   // der Name des Portals selbst ist nicht geheim
  }
  for (const p of pub.filter((x) => /\.(html|js|json|mjs|md)$/.test(x))) {
    const t = fs.readFileSync(path.join(PUB, p), 'utf8');
    for (const g of geheim) if (t.includes(g)) probleme.push(`Geheimnis steht in ${p}`);
    if (!p.startsWith('zugang/') && p !== 'README.md') for (const ti of titel) if (t.includes(ti)) probleme.push(`Seitentitel „${ti}“ steht im Klartext in ${p}`);
  }
  // Der verschlüsselte Bestand muss vollständig, entschlüsselbar und (falls vorhanden) mit dem Klartext-Baum identisch sein
  if (K) {
    const S = await Kern.schluessel(K);
    const verz = path.join(INHALT, (await S.dateiname(VERZEICHNIS)) + '.enc');
    if (!fs.existsSync(verz)) probleme.push('Dateiliste fehlt in inhalt/');
    else {
      const liste = JSON.parse(Buffer.from(await S.entschluesseln(VERZEICHNIS, fs.readFileSync(verz))).toString('utf8')).dateien;
      const namen = new Set([(await S.dateiname(VERZEICHNIS)) + '.enc']);
      for (const p of liste) {
        const f = (await S.dateiname(p)) + '.enc'; namen.add(f);
        const pf = path.join(INHALT, f);
        if (!fs.existsSync(pf)) { probleme.push(`fehlt in inhalt/: ${p}`); continue; }
        let klar;
        try { klar = await S.entschluesseln(p, fs.readFileSync(pf)); } catch (e) { probleme.push(`nicht entschlüsselbar: ${p}`); continue; }
        const k = path.join(KLAR, p);
        if (fs.existsSync(k) && !gleich(fs.readFileSync(k), klar)) probleme.push(`klar/ und inhalt/ unterscheiden sich: ${p} (einpacken vergessen?)`);
      }
      for (const f of blobs) if (!namen.has(f)) probleme.push(`überzählige Datei in inhalt/: ${f}`);
      if (fs.existsSync(path.join(KLAR, 'index.html'))) for (const p of baum(KLAR).filter((x) => !NICHT_PACKEN.some((re) => re.test(x)))) if (!liste.includes(p)) probleme.push(`klar/ hat eine Datei, die nicht eingepackt ist: ${p}`);
    }
  }
  if (probleme.length) { probleme.forEach((p) => console.error('✗ ' + p)); process.exit(1); }
  console.log(`geprüft: ${pub.length} öffentliche Dateien, ${blobs.length} verschlüsselte Dateien${K ? ', Inhalt entschlüsselbar und aktuell' : ' (ohne Passwort nur die Form geprüft)'} – in Ordnung`);
}

function exportReadme() {
  return `# Lernportal (verschlüsselt)

Veröffentlichte, verschlüsselte Fassung des Lernportals: Anmeldung mit LBS-4-E-Mail und Passwort, alle Seiten, Bilder und Daten liegen unter \`inhalt/\` verschlüsselt.
Dieser Ordner ist der Hauptordner des Repositorys; GitHub Pages veröffentlicht ihn („Deploy from a branch“, Ordner „/ (root)“).

## Arbeiten am Portal

Der Klartext liegt nur in \`klar/\` (vom Git ausgeschlossen) und wird nie committet. Das Passwort steht als Umgebungsvariable \`LERNPORTAL_PASSWORT\`, nie im Repository.

\`\`\`bash
node zugang/zugang.mjs auspacken                 # inhalt/ -> klar/
cd klar && node tools/build.mjs                  # ändern, bauen, testen (klar/README.md erklärt das Portal)
cd .. && node zugang/zugang.mjs einpacken        # klar/ -> inhalt/ (verschlüsselt)
node zugang/zugang.mjs pruefe                    # nur Erlaubtes öffentlich? alles entschlüsselbar und aktuell?
git add . && git commit                          # klar/ nie mit git add -f hinzufügen
\`\`\`

Weitere Befehle: \`passwort\` (neues Passwort und neuer Schlüssel, alles wird neu verschlüsselt), \`export\`. Tests: \`zugang/test-kern.mjs\`, \`zugang/test-cli.mjs\`,
\`zugang/test-e2e.mjs\` (Browser; mit \`--live https://…/\` gegen die veröffentlichte Seite).

## Grenzen

- Das Passwort ist der Schutz. Die verschlüsselten Dateien sind öffentlich, jeder kann offline Passwörter durchprobieren: langes, zufälliges Passwort, nur an die Klasse weitergeben.
- Die E-Mail-Adresse wird nicht bestätigt und schützt nichts; die Prüfung auf die Schul-Domain hält nur Unbeteiligte ab.
- Alle Seiten unter derselben \`…github.io\`-Adresse teilen sich den Browser-Speicher.
- Der Service Worker braucht HTTPS und einen normalen (nicht privaten Firefox-)Browser.
`;
}

/* ── Start ─────────────────────────────────────────────────────────────────── */
const [, , befehl, ...rest] = process.argv;
const opt = (n) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : undefined; };
const flag = (n) => rest.includes('--' + n);

if (befehl === 'init') {
  if (fs.existsSync(KONF) && !flag('neu')) aus('shared/zugang.json gibt es schon. Passwort ändern: „passwort“. Alles neu: --neu');
  const domain = (opt('domain') || 'lbs4.salzburg.at').toLowerCase();
  const K = Kern.zufall(32), pw = opt('passwort') || passwortErzeugen();
  const konf = { v: 1, name: 'Lernportal', domains: [domain], huelle: await Kern.huelleMachen(pw, K) };
  konfSchreiben(konf);
  console.log(`Passwort: ${pw}\nWiederherstellungsschlüssel: ${Kern.b64(K)}`);
} else if (befehl === 'passwort') {
  const konf = konfLesen(), alt = await schluesselHolen(konf);
  if (!fs.existsSync(path.join(KLAR, 'index.html'))) await auspacken(alt, false);
  const K = Kern.zufall(32), pw = opt('passwort') || passwortErzeugen();
  konf.huelle = await Kern.huelleMachen(pw, K);
  konfSchreiben(konf);
  await einpacken(K, konf);
  console.log(`Neues Passwort: ${pw}\nNeuer Wiederherstellungsschlüssel: ${Kern.b64(K)}\n(Alle Dateien sind neu verschlüsselt; das alte Passwort öffnet nichts Neues mehr.)`);
} else if (befehl === 'export') {
  const ziel = rest[0] && !rest[0].startsWith('--') ? path.resolve(rest[0]) : null;
  if (!ziel) aus('Aufruf: node lernseiten/zugang/zugang.mjs export <leerer Zielordner>');
  if (fs.existsSync(ziel) && fs.readdirSync(ziel).length) aus('Der Zielordner ist nicht leer: ' + ziel);
  const konf = konfLesen();
  const dateien = veroeffentlicht().filter((p) => OEFFENTLICH.some((re) => re.test(p)) && !['README.md', '404.html', '.nojekyll'].includes(p));
  for (const p of dateien) { fs.mkdirSync(path.dirname(path.join(ziel, p)), { recursive: true }); fs.copyFileSync(path.join(PUB, p), path.join(ziel, p)); }
  fs.writeFileSync(path.join(ziel, '404.html'), vorlage404(konf.name));
  fs.writeFileSync(path.join(ziel, '.nojekyll'), '');
  fs.writeFileSync(path.join(ziel, 'README.md'), exportReadme());
  console.log(`exportiert: ${dateien.length + 3} Dateien nach ${ziel}\nDas ist der Hauptordner des neuen Repositorys; GitHub Pages: „Deploy from a branch“, Ordner „/ (root)“. Klartext (klar/) ist nicht enthalten.`);
} else if (befehl === 'einpacken') {
  const konf = konfLesen(); await einpacken(await schluesselHolen(konf), konf);
} else if (befehl === 'auspacken') {
  const konf = konfLesen(); await auspacken(await schluesselHolen(konf), flag('ueberschreiben'));
} else if (befehl === 'pruefe') {
  const konf = konfLesen();
  const hat = process.env.LERNPORTAL_PASSWORT || process.env.LERNPORTAL_SCHLUESSEL;
  await pruefe(konf, hat ? await schluesselHolen(konf) : null);
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(befehl ? 1 : 0);
}
