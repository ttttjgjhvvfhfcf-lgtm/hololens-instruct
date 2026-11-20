/* Lernportal – Stundenplan-Logik: Was läuft gerade, was kommt danach, wie lange noch?
   Reine Rechenlogik ohne DOM, damit sie sich in Node testen lässt (tools/test-live.mjs).
   Eingabe ist der Plan aus shared/stundenplan.js (window.STUNDENPLAN).

   Zeitbasis ist die Wanduhr in Wien. Zum Ausprobieren kann man an die Adresse ?zeit=2026-11-24T10:15 hängen,
   dann läuft die Seite ab diesem Zeitpunkt weiter. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.LernLive = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var KEY = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
  var KURZ = { mo: 'Mo', di: 'Di', mi: 'Mi', do: 'Do', fr: 'Fr', sa: 'Sa', so: 'So' };
  var LANG = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', so: 'Sonntag' };

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var toMin = function (hm) { var p = hm.split(':'); return +p[0] * 60 + +p[1]; };
  var fromMin = function (m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  var iso = function (ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  var parseIso = function (s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
  var addDays = function (s, n) { return iso(parseIso(s) + n * 86400000); };
  var dayKey = function (s) { return KEY[new Date(parseIso(s)).getUTCDay()]; };
  var ddmm = function (s) { var p = s.split('-'); return p[2] + '.' + p[1] + '.'; };

  /* ── Zeit ─────────────────────────────────────────────────────────────── */
  // Wanduhrzeit einer Zeitzone als „Pseudo-UTC“-Millisekunden (die UTC-Felder zeigen die Wanduhr)
  function wanduhr(date, zone) {
    var o = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone || 'Europe/Vienna', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
  }
  var versatz = null;
  // Aktuelle Wanduhrzeit; mit ?zeit=JJJJ-MM-TTThh:mm[:ss] läuft sie ab dem angegebenen Zeitpunkt weiter
  function jetzt(zone) {
    var echt = wanduhr(new Date(), zone);
    if (versatz === null) {
      var m = /[?&]zeit=(\d{4})-(\d{2})-(\d{2})[T ](\d{2})(?::|%3A)(\d{2})(?:(?::|%3A)(\d{2}))?/i.exec((root && root.location && root.location.search) || '');
      versatz = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - echt : 0;
    }
    return echt + versatz;
  }
  function simuliert() { jetzt(); return versatz !== 0; }

  /* ── Plan ─────────────────────────────────────────────────────────────── */
  function woche(plan, d) {
    for (var i = 0; i < plan.wochen.length; i++) if (plan.wochen[i].von <= d && d <= plan.wochen[i].bis) return plan.wochen[i];
    return null;
  }
  function letzterTag(plan) { return plan.wochen.reduce(function (m, w) { return w.bis > m ? w.bis : m; }, ''); }
  // Alle Blöcke eines Tages (zeitlich sortiert); null, wenn der Tag in keiner hinterlegten Woche liegt
  function bloecke(plan, d) {
    var w = woche(plan, d);
    if (!w) return null;
    var tag = dayKey(d), e = plan.einheiten;
    return (w.tage[tag] || []).map(function (b) {
      var start = toMin(e[b.ab - 1][0]), ende = toMin(e[b.bis - 1][1]);
      return { id: d + '#' + b.ab, datum: d, tag: tag, ab: b.ab, bis: b.bis, fach: b.fach, gruppen: b.gruppen || [], status: b.status || '', hinweis: b.hinweis || '', lzk: !!b.lzk,
               start: start, ende: ende, zeitVon: fromMin(start), zeitBis: fromMin(ende) };
    }).sort(function (a, b) { return a.start - b.start; });
  }
  var aktive = function (list) { return (list || []).filter(function (b) { return b.status !== 'entfall'; }); };
  // Grund, warum ein Tag schulfrei ist („Weihnachtsferien“), sonst ''
  function grund(plan, d) { var w = woche(plan, d); return (w && w.frei && w.frei[dayKey(d)]) || ''; }
  // „AWL“, an Schularbeitstagen „AWL Schularbeit“
  var fachLabel = function (b) { return b.fach + (b.status === 'pruefung' ? ' ' + (b.hinweis || 'Prüfung') : ''); };
  var ddmmyyyy = function (s) { return ddmm(s) + s.slice(0, 4); };

  // Nächster stattfindender Block ab (Datum d, Minute abMin); sucht über die Tage der hinterlegten Wochen
  function naechster(plan, d, abMin) {
    var letzt = letzterTag(plan);
    for (var x = d, erster = true; x <= letzt; x = addDays(x, 1), erster = false) {
      var l = aktive(bloecke(plan, x));
      if (erster) l = l.filter(function (b) { return b.start >= abMin; });
      if (l.length) return l[0];
    }
    return null;
  }
  // Nummer der Einheit (0-basiert), in der die Sekunde liegt, sonst -1
  function einheitBei(plan, sek) {
    for (var i = 0; i < plan.einheiten.length; i++) {
      if (toMin(plan.einheiten[i][0]) * 60 <= sek && sek < toMin(plan.einheiten[i][1]) * 60) return i;
    }
    return -1;
  }
  // Ein Fach läuft oft über mehrere Einheiten (MET 1–3). Der Lauf fasst alle unmittelbar aufeinanderfolgenden
  // Einheiten desselben Fachs zusammen, auch wenn sie als getrennte Blöcke eingetragen sind. Die Restzeit zählt
  // bis zum Ende des ganzen Laufs (inklusive der kleinen Pausen dazwischen), nicht bis zum Ende der Einheit.
  function lauf(liste, block) {
    var l = { ab: block.ab, bis: block.bis, start: block.start, ende: block.ende, bloecke: [block] };
    for (var weiter = true; weiter;) {
      weiter = false;
      liste.forEach(function (b) {
        if (b.fach !== block.fach || l.bloecke.indexOf(b) >= 0) return;
        if (b.ab === l.bis + 1) { l.bis = b.bis; l.ende = b.ende; l.bloecke.push(b); weiter = true; }
        else if (b.bis === l.ab - 1) { l.ab = b.ab; l.start = b.start; l.bloecke.unshift(b); weiter = true; }
      });
    }
    l.zeitVon = fromMin(l.start); l.zeitBis = fromMin(l.ende);
    return l;
  }

  /* ── Zustand zu einem Zeitpunkt ───────────────────────────────────────────
     state: unterricht | pause | vor | nach | frei | abgelaufen | keinplan */
  function status(plan, wall) {
    var d = iso(wall), dt = new Date(wall);
    var sek = dt.getUTCHours() * 3600 + dt.getUTCMinutes() * 60 + dt.getUTCSeconds();
    var res = { state: 'frei', datum: d, tag: dayKey(d), sek: sek, grund: '', jetzt: null, pause: null, vor: null, danach: null };
    if (!plan || !plan.wochen || !plan.wochen.length) { res.state = 'keinplan'; return res; }

    res.grund = grund(plan, d);
    var heute = bloecke(plan, d);
    if (heute === null) {                                   // Datum liegt in keiner hinterlegten Woche
      res.danach = naechster(plan, d, 0);
      res.state = res.danach ? 'frei' : 'abgelaufen';
      return res;
    }
    var l = aktive(heute);
    if (!l.length) { res.danach = naechster(plan, addDays(d, 1), 0); res.state = (res.danach || d <= letzterTag(plan)) ? 'frei' : 'abgelaufen'; return res; }

    var cur = null;
    l.forEach(function (b) { if (b.start * 60 <= sek && sek < b.ende * 60) cur = b; });
    if (cur) {
      var lf = lauf(l, cur), i = einheitBei(plan, sek);
      if (i >= 0) {                                         // mitten in einer Einheit
        var pe = plan.einheiten[i];
        res.state = 'unterricht';
        // restSek/von/bis betreffen die laufende Einheit, die fach…-Werte das ganze Fach (alle zusammenhängenden Einheiten)
        res.jetzt = { block: cur, einheit: i + 2 - lf.ab, anzahl: lf.bis - lf.ab + 1,
                      von: pe[0], bis: pe[1], restSek: toMin(pe[1]) * 60 - sek, dauerSek: (toMin(pe[1]) - toMin(pe[0])) * 60,
                      fachVon: lf.zeitVon, fachBis: lf.zeitBis, fachRestSek: lf.ende * 60 - sek, fachDauerSek: (lf.ende - lf.start) * 60,
                      fachEinheiten: plan.einheiten.slice(lf.ab - 1, lf.bis) };
        res.danach = naechster(plan, d, lf.ende);
      } else {                                              // kleine Pause innerhalb eines zusammenhängenden Fachs
        var n = null;
        plan.einheiten.forEach(function (e) { if (n === null && toMin(e[0]) * 60 > sek) n = e; });
        var weiter = lf.bloecke.filter(function (b) { return b.start <= toMin(n[0]) && toMin(n[0]) < b.ende; })[0] || cur;
        res.state = 'pause';
        res.pause = { bis: n[0], restSek: toMin(n[0]) * 60 - sek, weiter: true, fachBis: lf.zeitBis, fachRestSek: lf.ende * 60 - sek };
        res.danach = weiter;
      }
      return res;
    }
    if (sek < l[0].start * 60) {
      res.state = 'vor';
      res.vor = { von: l[0].zeitVon, inSek: l[0].start * 60 - sek };
      res.danach = l[0];
      return res;
    }
    if (sek >= l[l.length - 1].ende * 60) {
      res.state = 'nach';
      res.danach = naechster(plan, addDays(d, 1), 0);
      return res;
    }
    var nb = null;                                          // Lücke zwischen zwei Blöcken (Pause oder Freistunde)
    l.forEach(function (b) { if (nb === null && b.start * 60 > sek) nb = b; });
    var lg = lauf(l, nb);
    res.state = 'pause';
    res.pause = { bis: nb.zeitVon, restSek: nb.start * 60 - sek, weiter: false };
    if (lg.start * 60 <= sek) {                             // die Lücke liegt zwischen zwei Blöcken desselben Fachs: es geht weiter
      res.pause.weiter = true; res.pause.fachBis = lg.zeitBis; res.pause.fachRestSek = lg.ende * 60 - sek;
    }
    res.danach = nb;
    return res;
  }

  /* ── Texte ────────────────────────────────────────────────────────────── */
  function dauer(sek) {
    var m = Math.max(1, Math.ceil(sek / 60));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + ' h ' + r + ' min' : h + ' h';
  }
  // Wann ein Block stattfindet, relativ zum aktuellen Tag: „10:40 PB“, „morgen 07:55 MLA“, „Mo 23.11. 07:55 MET“
  function wannText(b, heute) {
    if (b.datum === heute) return b.zeitVon + ' ' + fachLabel(b);
    if (b.datum === addDays(heute, 1)) return 'morgen ' + b.zeitVon + ' ' + fachLabel(b);
    return KURZ[b.tag] + ' ' + ddmm(b.datum) + ' ' + b.zeitVon + ' ' + fachLabel(b);
  }
  // „Danach PB“, wenn es nahtlos weitergeht (abMin = Minute, in der das Fach endet), sonst mit Zeitpunkt („Danach 13:10 AWL“)
  function danachText(st, abMin) {
    var b = st.danach;
    if (!b) return 'Danach nichts mehr hinterlegt';
    return 'Danach ' + (b.datum === st.datum && b.start === abMin ? fachLabel(b) : wannText(b, st.datum));
  }
  // haupt = erste Zeile, neben = zweite Zeile, kurz = einzeilig für schmale Leisten, klasse = Farbton
  function text(st, plan) {
    var t = { klasse: st.state, haupt: '', neben: '', kurz: '' };
    switch (st.state) {
      case 'unterricht':                                    // die Restzeit gilt für das ganze Fach, nicht nur für die Einheit
        t.haupt = fachLabel(st.jetzt.block) + ' · noch ' + dauer(st.jetzt.fachRestSek);
        t.kurz = t.haupt;
        t.neben = 'Fach bis ' + st.jetzt.fachBis + ' · ' + danachText(st, toMin(st.jetzt.fachBis));
        break;
      case 'pause':
        t.haupt = 'Pause · noch ' + dauer(st.pause.restSek);
        t.kurz = t.haupt;
        t.neben = st.pause.weiter ? 'Weiter mit ' + fachLabel(st.danach) + ' um ' + st.pause.bis + ' · Fach bis ' + st.pause.fachBis : danachText(st);
        break;
      case 'vor':
        t.haupt = 'Unterricht ab ' + st.vor.von;
        t.kurz = t.haupt;
        t.neben = 'In ' + dauer(st.vor.inSek) + ' · ' + fachLabel(st.danach);
        break;
      case 'nach':
        t.haupt = 'Unterricht vorbei';
        t.kurz = t.haupt;
        t.neben = st.danach ? 'Nächster: ' + wannText(st.danach, st.datum) : 'Danach nichts mehr hinterlegt';
        break;
      case 'frei':
        t.haupt = 'Heute kein Unterricht';
        t.kurz = t.haupt;
        t.neben = [st.grund, st.danach ? 'Nächster: ' + wannText(st.danach, st.datum) : ''].filter(Boolean).join(' · ');
        break;
      case 'abgelaufen':
        t.haupt = 'Kein aktueller Stundenplan';
        t.kurz = t.haupt;
        t.neben = 'Hinterlegt bis ' + ddmmyyyy(letzterTag(plan));
        break;
      default:
        t.haupt = 'Kein Stundenplan hinterlegt';
        t.kurz = t.haupt;
    }
    return t;
  }
  /* ── Wöchentliche Lernzielkontrollen ────────────────────────────────────────
     Der Plan kennzeichnet die Blöcke (lzk), in deren Stunde die Kontrolle stattfindet (plan.lernzielkontrollen nennt Fach, Wochentag
     und die Seite mit der Zusammenfassung). Diese Funktionen liefern die nächsten Termine und die Texte für die Erinnerung. */
  var tageZw = function (a, b) { return Math.round((parseIso(b) - parseIso(a)) / 86400000); };
  // Die nächsten max Lernzielkontrollen ab dem Zeitpunkt; heute zählt, bis die Stunde zu Ende ist
  function lernzielkontrollen(plan, wall, max) {
    var out = [], n = max || 1;
    if (!plan || !plan.wochen || !plan.wochen.length) return out;
    var d = iso(wall), dt = new Date(wall), sek = dt.getUTCHours() * 3600 + dt.getUTCMinutes() * 60 + dt.getUTCSeconds();
    var regeln = plan.lernzielkontrollen || [], letzt = letzterTag(plan);
    for (var x = d; x <= letzt && out.length < n; x = addDays(x, 1)) {
      aktive(bloecke(plan, x)).forEach(function (b) {
        if (!b.lzk || out.length >= n || (x === d && b.ende * 60 <= sek)) return;
        var r = regeln.filter(function (q) { return q.fach === b.fach && q.tag === b.tag; })[0] || {};
        out.push({ datum: x, tag: b.tag, fach: b.fach, zeitVon: b.zeitVon, zeitBis: b.zeitBis, start: b.start, ende: b.ende, tage: tageZw(d, x),
                   laeuft: x === d && b.start * 60 <= sek, seite: r.seite || '', name: r.name || 'Lernzielkontrolle' });
      });
    }
    return out;
  }
  // Text der Erinnerung: bald = heute oder morgen (wird hervorgehoben)
  function lzkText(e) {
    var bald = e.tage <= 1, datum = KURZ[e.tag] + ' ' + ddmm(e.datum), zeit = e.zeitVon + '–' + e.zeitBis;
    return {
      bald: bald,
      haupt: bald ? (e.tage === 0 ? 'Heute' : 'Morgen') + ': ' + e.name + ' ' + e.fach : 'Nächste ' + e.name + ': ' + e.fach,
      neben: e.tage === 0 ? (e.laeuft ? 'Stunde läuft · ' : '') + zeit : e.tage === 1 ? datum + ' · ' + zeit : datum + ' · in ' + e.tage + ' Tagen · ' + zeit
    };
  }
  // „Michael Klein (229) · Johann Stöckl (116)“
  function lehrerText(plan, gruppen, mitRaum) {
    return (gruppen || []).map(function (g) {
      return (plan.lehrer[g.lehrer] || g.lehrer) + (mitRaum && g.raum ? ' (' + g.raum + ')' : '');
    }).join(' · ');
  }

  return { jetzt: jetzt, simuliert: simuliert, wanduhr: wanduhr, status: status, text: text, dauer: dauer, wannText: wannText, lehrerText: lehrerText,
           grund: grund, fachLabel: fachLabel, ddmmyyyy: ddmmyyyy, letzterTag: letzterTag, lernzielkontrollen: lernzielkontrollen, lzkText: lzkText,
           bloecke: bloecke, woche: woche, naechster: naechster, addDays: addDays, dayKey: dayKey, toMin: toMin, fromMin: fromMin, ddmm: ddmm,
           KURZ: KURZ, LANG: LANG };
});
