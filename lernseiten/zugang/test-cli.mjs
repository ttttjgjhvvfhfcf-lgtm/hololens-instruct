// Test für zugang.mjs in einem Wegwerf-Ordner (kopiert nur das öffentliche Gerüst).  Aufruf: node lernseiten/zugang/test-cli.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HIER, '..');
let n = 0, fehl = 0;
const ok = (b, name) => { n++; if (!b) { fehl++; console.log('✗', name); } else console.log('✓', name); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zugang-test-'));
const L = path.join(tmp, 'lernseiten');
fs.mkdirSync(path.join(L, 'zugang'), { recursive: true });
fs.mkdirSync(path.join(L, 'shared'), { recursive: true });
fs.copyFileSync(path.join(HIER, 'zugang.mjs'), path.join(L, 'zugang', 'zugang.mjs'));
fs.copyFileSync(path.join(PUB, 'shared', 'zugang-kern.js'), path.join(L, 'shared', 'zugang-kern.js'));
const cli = path.join(L, 'zugang', 'zugang.mjs');
const run = (args, env = {}) => spawnSync('node', [cli, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

// Klartext-Baum wie im echten Portal
const schreibe = (p, t) => { const f = path.join(L, 'klar', p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
schreibe('.gitignore', '*\n!.gitignore\n');
schreibe('index.html', '<!DOCTYPE html><title>Lernportal Startseite</title><h1>Geheimes Portal</h1>');
schreibe('faecher/aee/drehstrom.html', '<title>Drehstrom Einheit 1</title><p>Sternschaltung äöü</p>');
schreibe('faecher/aee/bilder/bild.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3, 255]));
schreibe('shared/hub.js', 'console.log("hub")');
schreibe('shared/icons/lernportal.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
schreibe('tools/__pycache__/x.pyc', 'junk');
schreibe('tools/seiten.py', 'print("Seiteninhalt")');

// init
let r = run(['init', '--domain', 'lbs4.salzburg.at', '--basis', '/hololens-instruct/']);
ok(r.status === 0, 'init läuft');
const pw = /Passwort: (\S+)/.exec(r.stdout)?.[1], wk = /Wiederherstellungsschlüssel: (\S+)/.exec(r.stdout)?.[1];
ok(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(pw || ''), 'erzeugtes Passwort hat das Format xxxx-xxxx-xxxx');
ok(wk && wk.length === 43, 'Wiederherstellungsschlüssel (32 Byte, base64url)');
const konf = JSON.parse(fs.readFileSync(path.join(L, 'shared', 'zugang.json'), 'utf8'));
ok(konf.domains[0] === 'lbs4.salzburg.at' && konf.basis === '/hololens-instruct/' && konf.huelle.k, 'zugang.json enthält Domain, Basis und Hülle');
ok(!JSON.stringify(konf).includes(pw) && !JSON.stringify(konf).includes(wk), 'zugang.json enthält kein Geheimnis im Klartext');
ok(run(['init']).status !== 0, 'zweites init wird verweigert');

// einpacken
const env = { LERNPORTAL_PASSWORT: pw };
ok(run(['einpacken']).status !== 0, 'ohne Passwort wird nicht eingepackt');
ok(run(['einpacken'], { LERNPORTAL_PASSWORT: 'falsch-falsch-falsch' }).status !== 0, 'mit falschem Passwort wird nicht eingepackt');
r = run(['einpacken'], env);
ok(r.status === 0 && /eingepackt: 5 Dateien/.test(r.stdout), 'einpacken: 5 Dateien (ohne Symbole, .gitignore, __pycache__)');
const blobs = fs.readdirSync(path.join(L, 'inhalt'));
ok(blobs.length === 6 && blobs.every((f) => /^[0-9a-f]{32}\.enc$/.test(f)), '5 Dateien + Dateiliste liegen verschlüsselt in inhalt/');
const alles = blobs.map((f) => fs.readFileSync(path.join(L, 'inhalt', f)).toString('latin1')).join('');
ok(!/Geheimes|Drehstrom|Sternschaltung|Seiteninhalt|hub/.test(alles), 'kein Klartext in inhalt/');
ok(fs.existsSync(path.join(L, 'shared', 'icons', 'lernportal.svg')), 'Symbole werden öffentlich gespiegelt');
const f404 = fs.readFileSync(path.join(L, '404.html'), 'utf8');
ok(f404.includes('"/hololens-instruct/"') && f404.includes('?weiter='), '404.html verweist auf die Anmeldung');
ok(fs.existsSync(path.join(L, '.nojekyll')), '.nojekyll vorhanden');

// idempotent
const vorher = blobs.map((f) => fs.readFileSync(path.join(L, 'inhalt', f)).toString('base64')).join();
r = run(['einpacken'], env);
ok(/0 neu oder geändert, 0 entfernt/.test(r.stdout), 'zweites einpacken ändert nichts');
ok(fs.readdirSync(path.join(L, 'inhalt')).map((f) => fs.readFileSync(path.join(L, 'inhalt', f)).toString('base64')).join() === vorher, 'Ausgabe ist byte-gleich');

// prüfen
ok(run(['pruefe'], env).status === 0, 'pruefe ist in Ordnung');
ok(run(['pruefe'], { LERNPORTAL_SCHLUESSEL: wk }).status === 0, 'Wiederherstellungsschlüssel funktioniert statt Passwort');
schreibe('index.html', '<!DOCTYPE html><title>Lernportal Startseite</title><h1>Geändert</h1>');
r = run(['pruefe'], env);
ok(r.status !== 0 && /unterscheiden sich: index.html/.test(r.stderr), 'pruefe erkennt vergessenes Einpacken');
run(['einpacken'], env);
fs.writeFileSync(path.join(L, 'versehen.html'), '<h1>Klartext</h1>');
r = run(['pruefe'], env);
ok(r.status !== 0 && /nicht erlaubt im öffentlichen Ordner: versehen.html/.test(r.stderr), 'pruefe erkennt Klartext im öffentlichen Ordner');
fs.unlinkSync(path.join(L, 'versehen.html'));
fs.writeFileSync(path.join(L, 'README.md'), `Das Passwort ist ${pw}`);
r = run(['pruefe'], env);
ok(r.status !== 0 && /Geheimnis steht in README.md/.test(r.stderr), 'pruefe erkennt ein Passwort im Öffentlichen');
fs.unlinkSync(path.join(L, 'README.md'));
fs.writeFileSync(path.join(L, 'index.html'), '<title>Drehstrom Einheit 1</title>');
r = run(['pruefe'], env);
ok(r.status !== 0 && /Seitentitel/.test(r.stderr), 'pruefe erkennt einen Seitentitel im Klartext');
fs.unlinkSync(path.join(L, 'index.html'));
ok(run(['pruefe'], env).status === 0, 'nach dem Aufräumen wieder in Ordnung');

// entferntes Quell-File verschwindet aus inhalt/
fs.unlinkSync(path.join(L, 'klar', 'faecher', 'aee', 'bilder', 'bild.png'));
r = run(['einpacken'], env);
ok(/1 entfernt/.test(r.stdout) && fs.readdirSync(path.join(L, 'inhalt')).length === 5, 'gelöschte Datei wird aus inhalt/ entfernt');

// auspacken in leeren Klartext-Baum
const sicher = path.join(tmp, 'klar-alt');
fs.renameSync(path.join(L, 'klar'), sicher);
fs.mkdirSync(path.join(L, 'klar'));
r = run(['auspacken'], env);
ok(r.status === 0 && /ausgepackt: 4 Dateien/.test(r.stdout), 'auspacken: 4 Dateien');
const gleichBaum = (rel) => fs.readFileSync(path.join(L, 'klar', rel)).equals(fs.readFileSync(path.join(sicher, rel)));
ok(['index.html', 'faecher/aee/drehstrom.html', 'shared/hub.js', 'tools/seiten.py'].every(gleichBaum), 'ausgepackte Dateien sind byte-gleich');
ok(run(['auspacken'], env).status !== 0 && run(['auspacken', '--ueberschreiben'], env).status === 0, 'auspacken überschreibt nur mit --ueberschreiben');

// Passwortwechsel = neuer Schlüssel
const alteNamen = fs.readdirSync(path.join(L, 'inhalt')).sort().join();
r = run(['passwort'], env);
const pw2 = /Neues Passwort: (\S+)/.exec(r.stdout)?.[1];
ok(r.status === 0 && pw2 && pw2 !== pw, 'passwort erzeugt ein neues Passwort');
ok(fs.readdirSync(path.join(L, 'inhalt')).sort().join() !== alteNamen, 'alle Dateien sind neu verschlüsselt (neue Namen)');
ok(run(['pruefe'], env).status !== 0, 'altes Passwort geht nicht mehr');
ok(run(['pruefe'], { LERNPORTAL_PASSWORT: pw2 }).status === 0, 'neues Passwort geht');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n - fehl}/${n} Prüfungen bestanden`);
process.exit(fehl ? 1 : 0);
