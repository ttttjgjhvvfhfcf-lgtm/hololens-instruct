# Lernportal

Startseite: `index.html`. Fächer, Themenindex A–Z und Suche über alle Lernseiten, getrennt nach Schuljahr.

```
index.html            Portal (Jahr-Umschalter, Fächer, Index, Suche)
portal.json           aktuelles Schuljahr und Klassennamen
faecher.json          Liste der Fächer und Seiten (mit Schuljahr)
faecher/<fach>/*.html die Lernseiten
shared/hub.css        gemeinsame Schicht für alle Fachseiten (Handy-Korrekturen, Tabellen, Treffer-Leiste)
shared/hub.js         Zurück-Link, Design-Übernahme, Sprung zum Treffer, Bildplatzhalter, Querverweise
shared/daten.js       Suchindex          – wird erzeugt, nicht von Hand ändern
shared/seiten.js      Seitenliste        – wird erzeugt, nicht von Hand ändern
tools/build.mjs       erzeugt daten.js und seiten.js und bindet hub.css/hub.js in die Seiten ein
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
