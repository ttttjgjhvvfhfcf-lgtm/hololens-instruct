// Prüft die Stundenplan-Logik (shared/live.js) gegen stundenplan.json.
// Aufruf:  node tools/test-live.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = createRequire(import.meta.url)(path.join(root, 'shared', 'live.js'));
const plan = JSON.parse(readFileSync(path.join(root, 'stundenplan.json'), 'utf8'));

// Zeitpunkt als Wanduhr: "2026-11-23 08:44:59"
const wall = s => { const m = s.match(/(\d+)-(\d+)-(\d+)[ T](\d+):(\d+)(?::(\d+))?/); return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)); };
const at = s => L.status(plan, wall(s));
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FEHLER:', name, '\n  ', e.message); process.exitCode = 1; } };

t('Donnerstag vor der Schulwoche: frei, nächster ist Mo 07:55 MET', () => {
  const s = at('2026-11-19 12:00'); assert.equal(s.state, 'frei');
  assert.equal(s.danach.fach, 'MET'); assert.equal(s.danach.datum, '2026-11-23'); assert.equal(s.danach.zeitVon, '07:55');
  assert.equal(L.text(s, plan).neben, 'Nächster: Mo 23.11. 07:55 MET');
});
t('Montag 07:30: vor Unterrichtsbeginn', () => {
  const s = at('2026-11-23 07:30'); assert.equal(s.state, 'vor'); assert.equal(s.vor.inSek, 25 * 60);
  assert.equal(L.text(s, plan).haupt, 'Unterricht ab 07:55');
});
t('Montag 07:55:00: erste Einheit, 50 min, Block 1 von 3', () => {
  const s = at('2026-11-23 07:55:00'); assert.equal(s.state, 'unterricht');
  assert.equal(s.jetzt.block.fach, 'MET'); assert.equal(s.jetzt.einheit, 1); assert.equal(s.jetzt.anzahl, 3);
  assert.equal(s.jetzt.restSek, 50 * 60); assert.equal(s.danach.fach, 'PB');
  assert.equal(L.text(s, plan).haupt, 'MET · noch 50 min');
  assert.equal(L.text(s, plan).neben, 'Fach bis 10:40 · Danach 10:40 PB');
});
t('Montag 08:44:59: noch 1 Sekunde in Einheit 1, 08:45:00: Einheit 2', () => {
  assert.equal(at('2026-11-23 08:44:59').jetzt.einheit, 1); assert.equal(at('2026-11-23 08:44:59').jetzt.restSek, 1);
  const s = at('2026-11-23 08:45:00'); assert.equal(s.jetzt.einheit, 2); assert.equal(s.jetzt.restSek, 50 * 60);
});
t('Montag 09:40: Pause mitten im Block, weiter mit MET um 09:50', () => {
  const s = at('2026-11-23 09:40'); assert.equal(s.state, 'pause'); assert.equal(s.pause.weiter, true); assert.equal(s.pause.restSek, 10 * 60);
  assert.equal(L.text(s, plan).haupt, 'Pause · noch 10 min'); assert.equal(L.text(s, plan).neben, 'Weiter mit MET um 09:50');
});
t('Montag 10:40: PB beginnt, Einheit 1 von 2', () => {
  const s = at('2026-11-23 10:40'); assert.equal(s.jetzt.block.fach, 'PB'); assert.equal(s.jetzt.anzahl, 2); assert.equal(s.jetzt.einheit, 1);
});
t('Montag 12:30: Freistunde bis 13:10, danach AWL', () => {
  const s = at('2026-11-23 12:30'); assert.equal(s.state, 'pause'); assert.equal(s.pause.weiter, false); assert.equal(s.pause.bis, '13:10');
  assert.equal(s.pause.restSek, 40 * 60); assert.equal(s.danach.fach, 'AWL');
  assert.equal(L.text(s, plan).neben, 'Danach 13:10 AWL');
});
t('Montag 14:50: Pause zwischen zwei Blöcken bis 15:00, danach DUK', () => {
  const s = at('2026-11-23 14:50'); assert.equal(s.state, 'pause'); assert.equal(s.pause.restSek, 10 * 60); assert.equal(s.danach.fach, 'DUK');
});
t('Montag 16:40: Unterricht vorbei, nächster morgen 07:55 MLA', () => {
  const s = at('2026-11-23 16:40'); assert.equal(s.state, 'nach'); assert.equal(s.danach.fach, 'MLA');
  assert.equal(L.text(s, plan).neben, 'Nächster: morgen 07:55 MLA');
});
t('Dienstag 09:00: MLA mit zwei Gruppen (KM 229, ST 116), Änderung', () => {
  const s = at('2026-11-24 09:00'); assert.equal(s.state, 'unterricht'); assert.equal(s.jetzt.block.status, 'aenderung');
  assert.equal(L.lehrerText(plan, s.jetzt.block.gruppen, true), 'Michael Klein (229) · Johann Stöckl (116)');
  assert.equal(s.jetzt.anzahl, 4);
});
t('Dienstag 11:40: Freistunde Einheit 5, danach AWL 12:20', () => {
  const s = at('2026-11-24 11:40'); assert.equal(s.state, 'pause'); assert.equal(s.danach.fach, 'AWL'); assert.equal(s.pause.bis, '12:20');
});
t('Mittwoch 14:55: Pause im 4-Einheiten-Block MLA (MJ E54, ST 116)', () => {
  const s = at('2026-11-25 14:55'); assert.equal(s.state, 'pause'); assert.equal(s.pause.weiter, true); assert.equal(s.danach.fach, 'MLA');
  assert.equal(L.lehrerText(plan, s.danach.gruppen, true), 'Josef Mackinger (E54) · Johann Stöckl (116)');
});
t('Donnerstag 13:30: AEE, Einheit 2 von 3, Block bis 14:50, danach AM 15:00', () => {
  const s = at('2026-11-26 13:30'); assert.equal(s.jetzt.block.fach, 'AEE'); assert.equal(s.jetzt.einheit, 2); assert.equal(s.jetzt.anzahl, 3);
  assert.equal(s.jetzt.block.zeitBis, '14:50'); assert.equal(s.danach.fach, 'AM'); assert.equal(s.danach.zeitVon, '15:00');
});
t('Freitag 16:00: letzte Einheit, danach nichts mehr hinterlegt', () => {
  const s = at('2026-11-27 16:00'); assert.equal(s.state, 'unterricht'); assert.equal(s.danach, null);
  assert.equal(L.text(s, plan).neben, 'Fach bis 16:40 · Danach nichts mehr hinterlegt');
});
t('Freitag 17:00 und Samstag: Plan abgelaufen', () => {
  assert.equal(at('2026-11-27 17:00').state, 'nach'); assert.equal(at('2026-11-27 17:00').danach, null);
  const s = at('2026-11-28 10:00'); assert.equal(s.state, 'abgelaufen'); assert.equal(L.text(s, plan).neben, 'Letzte Woche endete am 27.11.');
});
t('Entfall wird übersprungen', () => {
  const kopie = JSON.parse(JSON.stringify(plan)); kopie.wochen[0].tage.mo[1].status = 'entfall';   // PB am Montag entfällt
  const s = L.status(kopie, wall('2026-11-23 10:45')); assert.equal(s.state, 'pause'); assert.equal(s.danach.fach, 'AWL');
});
t('Leerer Plan', () => { assert.equal(L.status({ wochen: [], einheiten: [] }, wall('2026-11-23 10:00')).state, 'keinplan'); });
t('Dauer-Format', () => {
  assert.equal(L.dauer(1), '1 min'); assert.equal(L.dauer(59 * 60), '59 min'); assert.equal(L.dauer(60 * 60), '1 h'); assert.equal(L.dauer(85 * 60 + 1), '1 h 26 min');
});
t('Wanduhr in Wien (Winterzeit UTC+1, Sommerzeit UTC+2)', () => {
  assert.equal(L.wanduhr(new Date('2026-11-23T06:55:00Z')), wall('2026-11-23 07:55'));
  assert.equal(L.wanduhr(new Date('2026-07-01T06:55:00Z')), wall('2026-07-01 08:55'));
});
console.log(process.exitCode ? 'Es gab Fehler.' : `Alle ${n} Prüfungen bestanden.`);
