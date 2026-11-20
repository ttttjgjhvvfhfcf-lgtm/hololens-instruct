// Tests für shared/zugang-kern.js (Schlüsselhülle, Dateiverschlüsselung, E-Mail-Prüfung).  Aufruf: node lernseiten/zugang/test-kern.mjs
import Kern from '../shared/zugang-kern.js';

let n = 0, fehl = 0;
const ok = (b, name) => { n++; if (!b) { fehl++; console.log('✗', name); } else console.log('✓', name); };
const wirft = async (fn, code) => { try { await fn(); return false; } catch (e) { return code ? e.code === code : true; } };
const gleich = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const te = new TextEncoder();
const D = ['lbs4.salzburg.at'];

// ── E-Mail ──
const e = (s) => Kern.emailPruefen(s, D);
ok(e('max.muster@lbs4.salzburg.at').ok, 'Schuladresse wird akzeptiert');
ok(e('  Max.Muster@LBS4.Salzburg.AT ').email === 'max.muster@lbs4.salzburg.at', 'Groß-/Kleinschreibung und Leerzeichen werden bereinigt');
ok(e('a+b@schueler.lbs4.salzburg.at').ok, 'Subdomain der Schule wird akzeptiert');
ok(!e('max@gmail.com').ok && e('max@gmail.com').grund === 'domain', 'fremde Domain wird abgelehnt');
ok(!e('max@lbs4.salzburg.at.example.com').ok, 'Domain als Anfang einer fremden Domain wird abgelehnt');
ok(!e('max@evil-lbs4.salzburg.at').ok, 'ähnliche Domain ohne Punkt wird abgelehnt');
ok(!e('max@lbs4.salzburg.com').ok, 'andere Endung wird abgelehnt');
ok(e('max@@lbs4.salzburg.at').grund === 'format' && e('lbs4.salzburg.at').grund === 'format' && e('').grund === 'format', 'ungültige Formen werden erkannt');
ok(!e('max muster@lbs4.salzburg.at').ok && !e('<a>@lbs4.salzburg.at').ok, 'Leerzeichen und Sonderzeichen werden abgelehnt');
ok(Kern.anzeigename('max.muster@lbs4.salzburg.at') === 'Max Muster', 'Anzeigename aus der Adresse');

// ── Passwort ──
ok(Kern.passwortNormal(' K7MQ-x4tn b9wz ') === 'k7mqx4tnb9wz', 'Passwort: Groß/Klein, Leerzeichen und Bindestriche egal');
ok(Kern.b64(Kern.unb64('AAECAwQFBgcICQ')) === 'AAECAwQFBgcICQ' && gleich(Kern.unb64(Kern.b64(Uint8Array.from([251, 255, 0, 1]))), [251, 255, 0, 1]), 'base64url-Rundlauf');

// ── Hülle ──
const K = Kern.zufall(32);
const h = await Kern.huelleMachen('k7mq-x4tn-b9wz', K, 2000);
ok(h.v === 1 && h.iter === 2000 && h.salz && h.iv && h.k, 'Hülle hat die erwarteten Felder');
ok(gleich(await Kern.huelleOeffnen('k7mq-x4tn-b9wz', h), K), 'richtiges Passwort öffnet die Hülle');
ok(gleich(await Kern.huelleOeffnen('  K7MQ X4TN b9wz ', h), K), 'Schreibweise des Passworts ist egal');
ok(await wirft(() => Kern.huelleOeffnen('k7mq-x4tn-b9wy', h), 'PASSWORT'), 'falsches Passwort wird abgelehnt');
ok(await wirft(() => Kern.huelleOeffnen('', h), 'PASSWORT'), 'leeres Passwort wird abgelehnt');
const k2 = Kern.unb64(h.k); k2[3] ^= 1;
ok(await wirft(() => Kern.huelleOeffnen('k7mq-x4tn-b9wz', { ...h, k: Kern.b64(k2) }), 'PASSWORT'), 'manipulierte Hülle wird abgelehnt');
const h2 = await Kern.huelleMachen('k7mq-x4tn-b9wz', K, 2000);
ok(h.salz !== h2.salz && h.k !== h2.k, 'jede Hülle hat eigenes Salz');

// ── Dateien ──
const S = await Kern.schluessel(K);
const klar = te.encode('<h1>Dreiphasen-Wechselspannung</h1> äöü ß');
const enc = await S.verschluesseln('faecher/aee/seite.html', klar);
ok(enc[0] === 0x4c && enc[1] === 0x50 && enc[2] === 1 && enc.length === klar.length + 3 + 12 + 16, 'Dateikopf und Länge stimmen');
ok(!new TextDecoder('latin1').decode(enc).includes('Dreiphasen'), 'Klartext ist im Chiffretext nicht zu finden');
ok(gleich(await S.entschluesseln('faecher/aee/seite.html', enc), klar), 'Datei-Rundlauf');
ok(gleich(await S.verschluesseln('faecher/aee/seite.html', klar), enc), 'gleicher Inhalt ergibt gleiche Datei (stabil im Git)');
ok(!gleich(await S.verschluesseln('faecher/aee/seite.html', te.encode('anders')), enc), 'anderer Inhalt ergibt andere Datei');
ok(!gleich(await S.verschluesseln('faecher/aee/andere.html', klar), enc), 'anderer Pfad ergibt andere Datei');
ok(await wirft(() => S.entschluesseln('faecher/aee/andere.html', enc), 'SCHLUESSEL'), 'Datei lässt sich nicht unter anderem Pfad entschlüsseln');
const kaputt = enc.slice(); kaputt[kaputt.length - 1] ^= 1;
ok(await wirft(() => S.entschluesseln('faecher/aee/seite.html', kaputt), 'SCHLUESSEL'), 'manipulierte Datei wird abgelehnt');
ok(await wirft(() => S.entschluesseln('x', enc.slice(0, 20)), 'FORMAT') && await wirft(() => S.entschluesseln('x', te.encode('<html>plain</html>padding.....')), 'FORMAT'), 'falsches Format wird abgelehnt');
const S2 = await Kern.schluessel(Kern.zufall(32));
ok(await wirft(() => S2.entschluesseln('faecher/aee/seite.html', enc), 'SCHLUESSEL'), 'anderer Schlüssel kann nicht entschlüsseln');
ok(gleich(await S.entschluesseln('a.bin', await S.verschluesseln('a.bin', new Uint8Array(0))), []), 'leere Datei geht');
const gross = Kern.verketten(Kern.zufall(65536), Kern.zufall(65536), Kern.zufall(65536), Kern.zufall(7));   // getRandomValues liefert höchstens 64 KiB am Stück
ok(gleich(await S.entschluesseln('bilder/x.png', await S.verschluesseln('bilder/x.png', gross)), gross), 'große Binärdatei geht (Rundlauf)');
ok(await S.dateiname('index.html') === await S.dateiname('/index.html') && /^[0-9a-f]{32}$/.test(await S.dateiname('index.html')), 'Dateiname: 32 Hex-Zeichen, führender Schrägstrich egal');
ok(await S.dateiname('index.html') !== await S.dateiname('stundenplan.html') && await S.dateiname('index.html') !== await S2.dateiname('index.html'), 'Dateinamen hängen von Pfad und Schlüssel ab');
ok(await wirft(() => Kern.schluessel(new Uint8Array(16)), 'FORMAT'), 'Schlüssel mit falscher Länge wird abgelehnt');

// ── Typen ──
ok(Kern.typ('a/b.HTML').startsWith('text/html') && Kern.typ('x.js').startsWith('text/javascript') && Kern.typ('x.png') === 'image/png' && Kern.typ('x.unbekannt') === 'application/octet-stream', 'Inhaltstypen nach Endung');

// ── Standard-Rundenzahl: Dauer ──
const t0 = Date.now();
const hs = await Kern.huelleMachen('abcd-efgh-jklm', K);
await Kern.huelleOeffnen('abcd-efgh-jklm', hs);
const ms = (Date.now() - t0) / 2;
ok(hs.iter === 600000 && ms < 3000, `Standard-Hülle (600000 Runden): ${Math.round(ms)} ms pro Ableitung`);

console.log(`\n${n - fehl}/${n} Prüfungen bestanden`);
process.exit(fehl ? 1 : 0);
