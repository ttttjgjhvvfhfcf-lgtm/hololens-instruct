// Prüft die Aufbereitung des Stundenplans (tools/plan.mjs) und die Live-Logik (shared/live.js).
// Aufruf:  node tools/test-live.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baue } from './plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = createRequire(import.meta.url)(path.join(root, 'shared', 'live.js'));
const lies = f => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
const quelle = lies('stundenplan.json'), portal = lies('faecher.json'), sa = lies('schularbeiten.json').schularbeiten;
const klon = o => JSON.parse(JSON.stringify(o));

const r = baue(quelle, portal, sa);
const plan = r.plan;

// Zeitpunkt als Wanduhr: "2026-11-23 08:44:59"
const wall = s => { const m = s.match(/(\d+)-(\d+)-(\d+)[ T](\d+):(\d+)(?::(\d+))?/); return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)); };
const at = s => L.status(plan, wall(s));
const txt = s => L.text(at(s), plan);
const woche = d => plan.wochen.find(w => w.von <= d && d <= w.bis);
const alleBloecke = w => Object.values(w.tage).flat();
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FEHLER:', name, '\n  ', e.message); process.exitCode = 1; } };

/* ── Aufbereitung ─────────────────────────────────────────────────────────── */
t('Plan und Schularbeiten sind fehlerfrei', () => { assert.deepEqual(r.fehler, []); assert.deepEqual(r.warnungen, []); });
t('15 Wochen von heute bis Ende Februar 2027', () => {
  assert.equal(plan.wochen.length, 15);
  assert.equal(plan.wochen[0].von, '2026-11-19'); assert.equal(plan.wochen[0].bis, '2026-11-22');
  assert.equal(plan.wochen.at(-1).von, '2027-02-22'); assert.equal(plan.wochen.at(-1).bis, '2027-02-28');
});
t('Normale Woche hat 21 Blöcke, die erste (Do/Fr) 9', () => {
  assert.equal(alleBloecke(woche('2026-11-30')).length, 21); assert.equal(alleBloecke(woche('2026-11-19')).length, 9);
});
t('„Änderung“ gibt es nur in der Woche 23.–27.11. (vier Blöcke)', () => {
  const mit = plan.wochen.filter(w => alleBloecke(w).some(b => b.status === 'aenderung')).map(w => w.von);
  assert.deepEqual(mit, ['2026-11-23']); assert.equal(alleBloecke(woche('2026-11-23')).filter(b => b.status === 'aenderung').length, 4);
});
t('Freie Tage: 8.12., Weihnachtsferien 24.12.–6.1.', () => {
  assert.equal(woche('2026-12-08').frei.di, 'Feiertag (Mariä Empfängnis)'); assert.equal(woche('2026-12-08').tage.di, undefined);
  assert.equal(woche('2026-12-23').tage.mi.length, 4); assert.equal(woche('2026-12-24').frei.do, 'Weihnachtsferien');
  assert.equal(alleBloecke(woche('2026-12-29')).length, 0); assert.equal(woche('2027-01-06').frei.mi, 'Weihnachtsferien');
  assert.equal(woche('2027-01-07').tage.do.length, 4);
});
t('Schularbeiten und Tests: genau diese fünf Blöcke sind markiert, mit ihrer Art als Hinweis', () => {
  const m = []; plan.wochen.forEach(w => Object.entries(w.tage).forEach(([k, l]) => l.forEach(b => { if (b.status === 'pruefung') m.push(w.von + ' ' + k + ' ' + b.fach + ' ' + b.ab + '-' + b.bis + ' ' + b.hinweis); })));
  assert.deepEqual(m, ['2026-12-07 do AEE 6-8 Test', '2026-12-14 do AWL 3-4 Schularbeit', '2027-01-25 mi AM 4-5 Test', '2027-01-25 do AWL 3-4 Schularbeit', '2027-01-25 do AEE 6-8 Test']);
  assert.deepEqual(r.schularbeiten, [
    { datum: '2026-12-10', fach: 'AEE', art: 'Test' }, { datum: '2026-12-17', fach: 'AWL', art: 'Schularbeit' }, { datum: '2027-01-27', fach: 'AM', art: 'Test' },
    { datum: '2027-01-28', fach: 'AWL', art: 'Schularbeit' }, { datum: '2027-01-28', fach: 'AEE', art: 'Test' }]);
  // ohne Angabe gilt „Schularbeit“
  assert.deepEqual(baue(quelle, portal, [{ datum: '2026-12-17', fach: 'AWL' }]).schularbeiten, [{ datum: '2026-12-17', fach: 'AWL', art: 'Schularbeit' }]);
});
t('Fehler in den Daten werden erkannt', () => {
  let q = klon(quelle); q.vorlage.tage.mo[0].gruppen[0].lehrer = 'XX';
  assert.match(baue(q, portal, sa).fehler.join(), /Kürzel "XX"/);
  q = klon(quelle); q.vorlage.tage.mo[1].ab = 3;                       // PB 3–5 überlappt MET 1–3
  assert.match(baue(q, portal, sa).fehler.join(), /doppelt belegt/);
  q = klon(quelle); q.frei.push({ von: '2026-13-01', bis: '2026-13-02', grund: 'x' });
  assert.match(baue(q, portal, sa).fehler.join(), /ungültiger Zeitraum/);
  assert.match(baue(quelle, portal, [{ datum: '2026-12-17', fach: 'XYZ' }]).fehler.join(), /nicht definiert/);
  assert.match(baue(quelle, portal, [{ datum: '2026-12-17', fach: 'AWL', art: 'Quiz' }]).fehler.join(), /Art "Quiz" ist unbekannt/);
  assert.match(baue(quelle, portal, [sa[0], sa[0]]).fehler.join(), /doppelt/);
});
t('Warnungen: kein Fach an dem Tag / außerhalb des Plans', () => {
  assert.match(baue(quelle, portal, [{ datum: '2026-12-16', fach: 'AWL' }]).warnungen.join(), /kein AWL/);   // Mittwoch: kein AWL
  assert.match(baue(quelle, portal, [{ datum: '2027-03-11', fach: 'AWL' }]).warnungen.join(), /außerhalb/);
});

/* ── Live-Logik ───────────────────────────────────────────────────────────── */
t('Heute (Do 19.11.) 12:17: Pause in der Freistunde, danach AEE 12:20', () => {
  const s = at('2026-11-19 12:17'); assert.equal(s.state, 'pause'); assert.equal(s.pause.restSek, 180); assert.equal(s.pause.weiter, false);
  assert.equal(s.danach.fach, 'AEE'); assert.equal(txt('2026-11-19 12:17').haupt, 'Pause · noch 3 min'); assert.equal(txt('2026-11-19 12:17').neben, 'Danach 12:20 AEE');
});
t('Heute 10:00: AWL, Einheit 1 von 2, noch 1 h 30 min bis zum Ende des Fachs (11:30)', () => {
  const s = at('2026-11-19 10:00'); assert.equal(s.state, 'unterricht'); assert.equal(s.jetzt.block.fach, 'AWL'); assert.equal(s.jetzt.einheit, 1); assert.equal(s.jetzt.anzahl, 2);
  assert.equal(s.jetzt.restSek, 40 * 60);                                   // die laufende Einheit
  assert.equal(s.jetzt.fachRestSek, 90 * 60); assert.equal(txt('2026-11-19 10:00').haupt, 'AWL · noch 1 h 30 min');
});
t('Heute früh und abends', () => {
  const v = at('2026-11-19 06:00'); assert.equal(v.state, 'vor'); assert.equal(v.vor.inSek, 115 * 60); assert.equal(v.danach.fach, 'TD');
  const a = at('2026-11-19 17:00'); assert.equal(a.state, 'nach'); assert.equal(txt('2026-11-19 17:00').neben, 'Nächster: morgen 07:55 MET');
});
t('Samstag: frei, nächster ist Mo 07:55 MET', () => {
  const s = at('2026-11-21 10:00'); assert.equal(s.state, 'frei'); assert.equal(s.grund, ''); assert.equal(txt('2026-11-21 10:00').neben, 'Nächster: Mo 23.11. 07:55 MET');
});
t('Vor Beginn des Plans (Mi 18.11.): frei, morgen 07:55 TD', () => {
  assert.equal(at('2026-11-18 10:00').state, 'frei'); assert.equal(txt('2026-11-18 10:00').neben, 'Nächster: morgen 07:55 TD');
});
t('Mo 23.11. 07:55:00: MET über drei Einheiten, noch 2 h 45 min bis 10:40, danach PB', () => {
  const s = at('2026-11-23 07:55:00'); assert.equal(s.jetzt.restSek, 50 * 60); assert.equal(s.jetzt.anzahl, 3);
  assert.equal(s.jetzt.fachVon, '07:55'); assert.equal(s.jetzt.fachBis, '10:40'); assert.equal(s.jetzt.fachRestSek, 165 * 60); assert.equal(s.jetzt.fachDauerSek, 165 * 60);
  assert.deepEqual(s.jetzt.fachEinheiten, [['07:55', '08:45'], ['08:45', '09:35'], ['09:50', '10:40']]);
  assert.equal(txt('2026-11-23 07:55').haupt, 'MET · noch 2 h 45 min'); assert.equal(txt('2026-11-23 07:55').kurz, 'MET · noch 2 h 45 min');
  assert.equal(txt('2026-11-23 07:55').neben, 'Fach bis 10:40 · Danach PB');           // PB beginnt nahtlos um 10:40
});
t('Die Fach-Restzeit zählt über Einheiten und Pause hinweg ohne Sprung', () => {
  const a = at('2026-11-23 08:44:59'), b = at('2026-11-23 08:45:00');                 // Einheitenwechsel 1 → 2
  assert.equal(a.jetzt.restSek, 1); assert.equal(a.jetzt.einheit, 1); assert.equal(b.jetzt.einheit, 2); assert.equal(b.jetzt.restSek, 50 * 60);
  assert.equal(a.jetzt.fachRestSek - b.jetzt.fachRestSek, 1); assert.equal(b.jetzt.fachRestSek, 115 * 60);
  assert.equal(at('2026-11-23 09:35:00').state, 'pause'); assert.equal(at('2026-11-23 09:35:00').pause.fachRestSek, 65 * 60);   // kleine Pause 09:35–09:50
  const c = at('2026-11-23 09:50:00'); assert.equal(c.jetzt.einheit, 3); assert.equal(c.jetzt.fachRestSek, 50 * 60);
  assert.equal(txt('2026-11-23 10:39:00').haupt, 'MET · noch 1 min'); assert.equal(at('2026-11-23 10:40:00').jetzt.block.fach, 'PB');
  assert.equal(txt('2026-11-23 10:40:00').haupt, 'PB · noch 1 h 40 min');             // PB 4–5 bis 12:20
});
t('Pause im Block (09:40) und Freistunde (12:30)', () => {
  const p = at('2026-11-23 09:40'); assert.equal(p.pause.weiter, true); assert.equal(p.pause.fachRestSek, 60 * 60); assert.equal(p.danach.fach, 'MET');
  assert.equal(txt('2026-11-23 09:40').haupt, 'Pause · noch 10 min'); assert.equal(txt('2026-11-23 09:40').neben, 'Weiter mit MET um 09:50 · Fach bis 10:40');
  const f = at('2026-11-23 12:30'); assert.equal(f.pause.weiter, false); assert.equal(f.danach.fach, 'AWL'); assert.equal(f.pause.restSek, 40 * 60);
  assert.equal(txt('2026-11-23 12:30').neben, 'Danach 13:10 AWL');
});
t('Mi 2.12.: MLA 7–10 mit kleiner Pause 14:50–15:00, Restzeit immer bis 16:40', () => {
  const u = at('2026-12-02 13:15'); assert.equal(u.jetzt.block.fach, 'MLA'); assert.equal(u.jetzt.anzahl, 4); assert.equal(txt('2026-12-02 13:15').haupt, 'MLA · noch 3 h 25 min');
  const p = at('2026-12-02 14:55'); assert.equal(p.state, 'pause'); assert.equal(p.pause.weiter, true); assert.equal(p.pause.restSek, 5 * 60); assert.equal(p.pause.fachRestSek, 105 * 60);
  assert.equal(txt('2026-12-02 14:55').neben, 'Weiter mit MLA um 15:00 · Fach bis 16:40');
  const e = at('2026-12-02 15:00'); assert.equal(e.jetzt.einheit, 3); assert.equal(e.jetzt.fachRestSek, 100 * 60);
  assert.equal(txt('2026-12-02 16:00').neben, 'Fach bis 16:40 · Danach morgen 07:55 TD');
});
t('Direkt aufeinanderfolgende Blöcke desselben Fachs zählen als ein Fach', () => {
  const k = klon(plan), w = k.wochen.find(x => x.von === '2026-11-30'), met = w.tage.mo[0]; assert.equal(met.fach, 'MET');
  w.tage.mo.splice(0, 1, { ...met, bis: 2 }, { ...met, ab: 3, bis: 3 });             // MET 1–3 als zwei Blöcke: 1–2 und 3
  const s = L.status(k, wall('2026-11-30 07:55')); assert.equal(s.jetzt.anzahl, 3); assert.equal(s.jetzt.fachBis, '10:40'); assert.equal(s.jetzt.fachRestSek, 165 * 60);
  const m = L.status(k, wall('2026-11-30 09:40')); assert.equal(m.state, 'pause'); assert.equal(m.pause.weiter, true); assert.equal(m.pause.fachRestSek, 60 * 60);
  assert.equal(L.text(m, k).neben, 'Weiter mit MET um 09:50 · Fach bis 10:40');
  const x = L.status(k, wall('2026-11-30 10:00')); assert.equal(x.jetzt.block.ab, 3); assert.equal(x.jetzt.einheit, 3); assert.equal(x.jetzt.fachRestSek, 40 * 60);
  // Anderes Fach oder entfallener Block dahinter: der Lauf endet vorher
  const a = klon(k), wa = a.wochen.find(x => x.von === '2026-11-30'); wa.tage.mo[1].fach = 'AM';
  assert.equal(L.status(a, wall('2026-11-30 07:55')).jetzt.fachBis, '09:35'); assert.equal(L.status(a, wall('2026-11-30 09:40')).pause.weiter, false);
  const e = klon(k), we = e.wochen.find(x => x.von === '2026-11-30'); we.tage.mo[1].status = 'entfall';
  assert.equal(L.status(e, wall('2026-11-30 07:55')).jetzt.fachBis, '09:35');
});
t('Di 24.11. 09:00: MLA mit zwei Gruppen als Änderung; Di 1.12. dasselbe ohne Änderung', () => {
  const s = at('2026-11-24 09:00'); assert.equal(s.jetzt.block.status, 'aenderung');
  assert.equal(L.lehrerText(plan, s.jetzt.block.gruppen, true), 'Michael Klein (229) · Johann Stöckl (116)');
  const v = at('2026-12-01 09:00'); assert.equal(v.jetzt.block.fach, 'MLA'); assert.equal(v.jetzt.block.status, '');
});
t('Di 8.12.: Feiertag, nächster ist morgen 07:55 MET', () => {
  const s = at('2026-12-08 10:00'); assert.equal(s.state, 'frei'); assert.equal(s.grund, 'Feiertag (Mariä Empfängnis)');
  assert.equal(txt('2026-12-08 10:00').neben, 'Feiertag (Mariä Empfängnis) · Nächster: morgen 07:55 MET');
});
t('Do 17.12.: Schularbeit AWL', () => {
  const s = at('2026-12-17 10:00'); assert.equal(s.jetzt.block.status, 'pruefung');
  assert.equal(txt('2026-12-17 10:00').haupt, 'AWL Schularbeit · noch 1 h 30 min'); assert.equal(txt('2026-12-17 10:00').neben, 'Fach bis 11:30 · Danach 12:20 AEE');
  assert.equal(txt('2026-12-17 09:40').neben, 'Danach 09:50 AWL Schularbeit');
});
t('Do 28.1.2027: zweite Schularbeit am Vormittag, danach der AEE-Test', () => {
  assert.equal(txt('2027-01-28 10:30').haupt, 'AWL Schularbeit · noch 1 h');
  assert.equal(txt('2027-01-28 13:00').haupt, 'AEE Test · noch 1 h 50 min'); assert.equal(txt('2027-01-28 13:00').neben, 'Fach bis 14:50 · Danach 15:00 AM');
});
t('Tests: Do 10.12. AEE, Mi 27.1. AM — die Anzeige nennt „Test“', () => {
  assert.equal(txt('2026-12-10 12:30').haupt, 'AEE Test · noch 2 h 20 min'); assert.equal(txt('2026-12-10 12:30').kurz, 'AEE Test · noch 2 h 20 min');
  assert.equal(txt('2027-01-27 10:50').haupt, 'AM Test · noch 1 h 30 min');
  assert.equal(txt('2026-12-03 13:00').haupt, 'AEE · noch 1 h 50 min');               // eine Woche vorher: normale Stunde ohne Zusatz
});
t('Mi 23.12. 12:00 noch Unterricht, Do 24.12. Weihnachtsferien bis zum nächsten Schultag Do 7.1.', () => {
  assert.equal(at('2026-12-23 12:00').jetzt.block.fach, 'AM');
  const s = at('2026-12-24 10:00'); assert.equal(s.state, 'frei'); assert.equal(s.grund, 'Weihnachtsferien');
  assert.equal(txt('2026-12-24 10:00').neben, 'Weihnachtsferien · Nächster: Do 07.01. 07:55 TD');
  assert.equal(at('2026-12-28 10:00').grund, 'Weihnachtsferien');
  assert.equal(txt('2027-01-06 10:00').neben, 'Weihnachtsferien · Nächster: morgen 07:55 TD');
  assert.equal(at('2027-01-07 08:00').jetzt.block.fach, 'TD');
});
t('Ende des Plans: Fr 26.2. 16:00 / 17:00, Sa 27.2., So 28.2., Mo 1.3.', () => {
  assert.equal(txt('2027-02-26 16:00').neben, 'Fach bis 16:40 · Danach nichts mehr hinterlegt');
  const n1 = at('2027-02-26 17:00'); assert.equal(n1.state, 'nach'); assert.equal(n1.danach, null);
  assert.equal(at('2027-02-27 10:00').state, 'frei'); assert.equal(at('2027-02-28 10:00').state, 'frei');
  const a = at('2027-03-01 10:00'); assert.equal(a.state, 'abgelaufen'); assert.equal(L.text(a, plan).neben, 'Hinterlegt bis 28.02.2027');
});
t('Entfall wird übersprungen', () => {
  const kopie = klon(plan); const w = kopie.wochen.find(x => x.von === '2026-11-30'); w.tage.mo[1].status = 'entfall';   // PB am Montag entfällt
  const s = L.status(kopie, wall('2026-11-30 10:45')); assert.equal(s.state, 'pause'); assert.equal(s.danach.fach, 'AWL');
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
