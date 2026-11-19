# Lernportal

Startseite: `index.html`. Fächer, Themenindex A–Z und Suche über alle Lernseiten, getrennt nach Schuljahr.

```
index.html            Portal (Menüzeile mit Live-Anzeige, Jahr-Umschalter, Fächer, Index, Suche)
stundenplan.html      Stundenplan (Live-Karte, Wochenraster, Tagesansicht, Lehrkräfte)
stundenplan.json      Stundenplan-Daten (Einheiten, Lehrkräfte, Fächer, Wochen)
portal.json           aktuelles Schuljahr und Klassennamen
faecher.json          Liste der Fächer und Seiten (mit Schuljahr)
faecher/<fach>/*.html die Lernseiten
shared/hub.css        gemeinsame Schicht für alle Fachseiten (Handy-Korrekturen, Tabellen, Treffer-Leiste)
shared/hub.js         Zurück-Link, Design-Übernahme, Sprung zum Treffer, Bildplatzhalter, Querverweise
shared/live.js        Rechenlogik: was läuft gerade, was kommt danach, wie lange noch
shared/daten.js       Suchindex          – wird erzeugt, nicht von Hand ändern
shared/seiten.js      Seitenliste        – wird erzeugt, nicht von Hand ändern
shared/stundenplan.js Stundenplan        – wird erzeugt, nicht von Hand ändern
tools/build.mjs       erzeugt daten.js, seiten.js und stundenplan.js (prüft den Plan) und bindet hub.css/hub.js ein
tools/test-live.mjs   Tests für die Stundenplan-Logik (node tools/test-live.mjs)
tools/seiten.py       baut Lernseiten aus den Rohdateien in quellen/
```

## Bedienung

- **Suche:** `Strg+K` oder `/` springt ins Suchfeld, `↑ ↓` wählt einen Treffer, `Enter` öffnet ihn direkt an der passenden
  Stelle, `Esc` leert die Suche. Bei Tippfehlern schlägt das Portal ein ähnliches Wort vor („Meintest du …?“). Unter dem
  Suchfeld stehen die zuletzt gesuchten Begriffe. Die Fach-Knöpfe zeigen, wie viele Treffer jedes Fach hat.
- **Auf der Lernseite:** Eine Leiste unten blättert durch die markierten Treffer (↑ ↓) und entfernt die Markierung (✕).
  Am Seitenende stehen die weiteren Seiten desselben Fachs.
- **Design:** Der Hell/Dunkel-Schalter im Portal gilt auch für die Lernseiten und umgekehrt.
- **Handy:** Werkzeugleisten der Seiten lassen sich seitlich wischen (der Rand blendet aus, solange rechts noch etwas
  liegt), breite Tabellen scrollen in sich und zeigen mit einem Schatten, wo es weitergeht.

## Neue Seite oder neues Fach hinzufügen

1. HTML-Datei nach `faecher/<fach>/` legen.
2. Seite (oder neues Fach mit Kürzel und Farbe) in `faecher.json` eintragen. Seiten ohne `"jahr"` gehören automatisch
   zum aktuellen Schuljahr.
3. `node tools/build.mjs` ausführen (braucht Node.js und Playwright). Das Skript bindet `hub.css` und `hub.js` selbst in
   die Seite ein und baut Suchindex und Seitenliste neu.

## Seiten aus Rohmaterial erzeugen

`python3 tools/seiten.py` baut aus den Vorlagen in `quellen/` (Markdown, einfache HTML-Seiten) Lernseiten im
einheitlichen Stil: MET-Lernübersicht, AEE2-Formelübersicht, AEE2-Merksätze und die Mathematik-Probeschularbeit.
Danach `node tools/build.mjs` ausführen, damit die Suche die neuen Seiten kennt.

## Schuljahre

`portal.json` legt fest, welches Jahr aktuell ist (`aktuell`) und wie die Klassen heißen. Jede Seite in
`faecher.json` trägt ein `"jahr"`. Das Portal führt pro Jahr einen eigenen Fächer- und Themenindex und durchsucht
standardmäßig nur das gewählte Jahr. Ist das aktuelle Jahr noch leer, öffnet es mit dem neuesten Jahr, das Seiten hat.
Zum Schuljahreswechsel: neuen Eintrag in `jahre` ergänzen und `aktuell` hochzählen.

## Stundenplan

`stundenplan.json` enthält die Zeiten der Einheiten, die Lehrkräfte mit vollem Namen, die Fächer und die Wochen mit ihren
Blöcken. `node tools/build.mjs` prüft den Plan (unbekannte Kürzel, doppelt belegte Einheiten, ungültige Zeiten) und
erzeugt `shared/stundenplan.js`.

- **Menü:** Im Portal zeigt die Menüzeile oben das laufende Fach mit der Restzeit der aktuellen Einheit und das nächste
  Fach. Auf den Lernseiten erscheint während der Unterrichtszeit ein kleiner Chip in der Werkzeugleiste. Beides
  führt zur Seite `stundenplan.html`.
- **Neue Woche eintragen:** Unter `wochen` einen Eintrag mit `von`/`bis` (Montag bis Freitag) anlegen. Jeder Block hat
  `ab`/`bis` (Nummern der Einheiten, 1 bis 10), `fach` und `gruppen` (Lehrerkürzel und Raum; mehrere Gruppen laufen
  parallel). Optional `status`: `aenderung`, `entfall` (wird bei „jetzt/danach“ übersprungen) oder `pruefung`.
  Neue Lehrkräfte kommen unter `lehrer` dazu, neue Fächer unter `faecher`.
- **Außerhalb der hinterlegten Wochen** zeigt die Anzeige „Kein aktueller Stundenplan“ und nennt das Ende der letzten Woche.
- **Zeit:** Gerechnet wird mit der Wiener Ortszeit. Zum Ausprobieren hängt man `?zeit=2026-11-24T10:15` an die Adresse,
  die Seite läuft dann ab diesem Zeitpunkt weiter.
- **Grenzen:** Der Plan wird von Hand gepflegt. Entfall und Vertretungen der Schule sind erst nach einem Update sichtbar.
