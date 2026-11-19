// Bereitet den Stundenplan auf. Aus stundenplan.json (Vorlage, einzelne Wochen, freie Tage) und schularbeiten.json
// werden konkrete Wochen, so wie shared/live.js und die Seiten sie lesen. Wird von build.mjs und test-live.mjs benutzt.
//
//   vorlage  Plan, der Woche für Woche gilt (von/bis = Gültigkeit, tage = Blöcke je Wochentag)
//   wochen   einzelne Wochen, die von der Vorlage abweichen (ersetzen die Vorlage in dieser Kalenderwoche)
//   frei     schulfreie Tage mit Grund (an diesen Tagen entfallen alle Blöcke)

const KEYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const STATUS = ['aenderung', 'entfall', 'pruefung'];
const ARTEN = ['Schularbeit', 'Test'];            // Art eines Termins in schularbeiten.json (Standard: Schularbeit)
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ms = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const iso = t => new Date(t).toISOString().slice(0, 10);
const addDays = (s, n) => iso(ms(s) + n * 86400000);
const montag = s => addDays(s, -((new Date(ms(s)).getUTCDay() + 6) % 7));
const klon = o => JSON.parse(JSON.stringify(o));
const min = s => +s.slice(0, 2) * 60 + +s.slice(3);
const datumOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(ms(s)) === s;
const tagKey = s => KEYS[(new Date(ms(s)).getUTCDay() + 6) % 7];

export function baue(quelle, portal = [], schularbeiten = []) {
  const plan = klon(quelle), fehler = [], warnungen = [];
  const n = (plan.einheiten || []).length;

  // ── Einheiten, Lehrkräfte, Fächer ──────────────────────────────────────────
  let vorher = -1;
  (plan.einheiten || []).forEach(([a, b], i) => {
    if (!HM.test(a) || !HM.test(b) || min(a) >= min(b)) fehler.push(`Einheit ${i + 1}: ungültige Zeiten ${a}–${b}`);
    else { if (min(a) < vorher) fehler.push(`Einheit ${i + 1}: beginnt vor dem Ende der vorigen`); vorher = min(b); }
  });
  for (const [code, f] of Object.entries(plan.faecher || {})) {
    const p = f.portal && portal.find(x => x.id === f.portal);
    if (f.portal && !p) fehler.push(`Fach ${code}: Portal-Fach "${f.portal}" gibt es nicht`);
    if (p) { f.farbe = p.farbe; f.farbeDunkel = p.farbeDunkel; f.portalName = p.name; }
    else if (!f.farbe || !f.farbeDunkel) fehler.push(`Fach ${code}: Farbe fehlt`);
  }

  // ── Blöcke prüfen ──────────────────────────────────────────────────────────
  const pruefeTage = (tage, wo) => {
    for (const [tag, liste] of Object.entries(tage || {})) {
      if (!KEYS.includes(tag)) fehler.push(`${wo}: unbekannter Tag "${tag}"`);
      const belegt = new Set();
      for (const b of liste) {
        const w = `${wo} ${tag} ab ${b.ab}`;
        if (!Number.isInteger(b.ab) || !Number.isInteger(b.bis) || b.ab < 1 || b.bis > n || b.ab > b.bis) fehler.push(`${w}: ungültige Einheiten`);
        if (!plan.faecher?.[b.fach]) fehler.push(`${w}: Fach "${b.fach}" ist nicht definiert`);
        if (!b.gruppen?.length) fehler.push(`${w}: keine Lehrkraft angegeben`);
        for (const g of b.gruppen || []) if (!plan.lehrer?.[g.lehrer]) fehler.push(`${w}: Kürzel "${g.lehrer}" fehlt in "lehrer"`);
        if (b.status && !STATUS.includes(b.status)) fehler.push(`${w}: unbekannter Status "${b.status}"`);
        for (let e = b.ab; e <= b.bis; e++) { if (belegt.has(e)) fehler.push(`${w}: Einheit ${e} ist doppelt belegt`); belegt.add(e); }
      }
    }
  };
  const pruefeZeitraum = (z, wo) => {
    if (!datumOk(z.von) || !datumOk(z.bis) || z.von > z.bis) { fehler.push(`${wo}: ungültiger Zeitraum ${z.von} – ${z.bis}`); return false; }
    return true;
  };
  if (plan.vorlage) { if (pruefeZeitraum(plan.vorlage, 'Vorlage')) pruefeTage(plan.vorlage.tage, 'Vorlage'); }
  (plan.wochen || []).forEach((w, i) => { if (pruefeZeitraum(w, `Woche ${i + 1}`)) pruefeTage(w.tage, `Woche ${w.von}`); });
  (plan.frei || []).forEach((f, i) => { pruefeZeitraum(f, `Frei ${i + 1}`); if (!f.grund) fehler.push(`Frei ${i + 1}: Grund fehlt`); });
  if (fehler.length) return { plan: null, schularbeiten: [], fehler, warnungen };

  // ── Konkrete Wochen (Montag bis Sonntag, am Rand auf die Gültigkeit gekürzt) ──
  const freiGrund = d => { const f = (plan.frei || []).find(x => x.von <= d && d <= x.bis); return f ? f.grund : ''; };
  const wochen = new Map();
  const woche = (m, von, bis, tage) => {
    const w = { von, bis, tage: {}, frei: {} };
    KEYS.forEach((k, i) => {
      const d = addDays(m, i);
      if (d < von || d > bis) return;
      const g = freiGrund(d);
      if (g) { w.frei[k] = g; return; }
      if (tage?.[k]?.length) w.tage[k] = klon(tage[k]);
    });
    return w;
  };
  if (plan.vorlage) {
    const { von, bis, tage } = plan.vorlage;
    for (let m = montag(von); m <= bis; m = addDays(m, 7)) {
      const s = addDays(m, 6);
      wochen.set(m, woche(m, m < von ? von : m, s > bis ? bis : s, tage));
    }
  }
  for (const e of plan.wochen || []) {
    const m = montag(e.von), g = wochen.get(m);
    wochen.set(m, woche(m, g ? g.von : e.von, g ? g.bis : e.bis, e.tage));
  }
  const alle = [...wochen.values()].sort((a, b) => a.von.localeCompare(b.von));

  // ── Schularbeiten und Tests: im Plan als „Prüfung“ kennzeichnen (Hinweis = Art) ──────────
  const sa = [];
  const gesehen = new Set();
  (schularbeiten || []).forEach((s, i) => {
    const wo = `Termin ${i + 1}`;
    const art = s.art || 'Schularbeit';
    if (!datumOk(s.datum)) return fehler.push(`${wo}: ungültiges Datum "${s.datum}"`);
    if (!plan.faecher?.[s.fach]) return fehler.push(`${wo}: Fach "${s.fach}" ist im Stundenplan nicht definiert`);
    if (!ARTEN.includes(art)) return fehler.push(`${wo}: Art "${art}" ist unbekannt (erlaubt: ${ARTEN.join(', ')})`);
    if (gesehen.has(s.datum + s.fach)) return fehler.push(`${wo}: ${s.fach} am ${s.datum} steht doppelt drin`);
    gesehen.add(s.datum + s.fach);
    sa.push({ ...klon(s), art });
    const w = alle.find(x => x.von <= s.datum && s.datum <= x.bis);
    if (!w) return warnungen.push(`${wo} (${s.fach}, ${s.datum}): liegt außerhalb des hinterlegten Stundenplans, daher nicht markiert`);
    const treffer = (w.tage[tagKey(s.datum)] || []).filter(b => b.fach === s.fach);
    if (!treffer.length) {
      warnungen.push(`${wo} (${s.fach}, ${s.datum}): laut Stundenplan gibt es an diesem Tag kein ${s.fach}, daher nicht markiert`);
      return;
    }
    treffer.forEach(b => { b.status = 'pruefung'; b.hinweis = art; });
  });
  sa.sort((a, b) => a.datum.localeCompare(b.datum));
  if (fehler.length) return { plan: null, schularbeiten: [], fehler, warnungen };

  const { klasse, stand, zeitzone, einheiten, lehrer, faecher } = plan;
  return { plan: { klasse, stand, zeitzone, einheiten, lehrer, faecher, wochen: alle }, schularbeiten: sa, fehler, warnungen };
}
