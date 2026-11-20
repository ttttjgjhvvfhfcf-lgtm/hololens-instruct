# Lernportal

Startseite: `index.html`. Fächer, Themenindex A–Z und Suche über alle Lernseiten, getrennt nach Schuljahr.

```
index.html            Portal (Menüzeile mit Live-Anzeige, Jahr-Umschalter, Fächer, Index, Suche)
stundenplan.html      Stundenplan (Live-Karte, Wochenraster, Tagesansicht, Lehrkräfte)
stundenplan.json      Stundenplan-Daten (Einheiten, Lehrkräfte, Fächer, Vorlage, Einzelwochen, freie Tage, Lernzielkontrollen)
schularbeiten.html    Schularbeitenplan (nächster Termin mit Countdown, alle Schularbeiten und Tests)
schularbeiten.json    Termine der Schularbeiten und Tests
portal.json           aktuelles Schuljahr und Klassennamen
faecher.json          Liste der Fächer und Seiten (mit Schuljahr)
faecher/<fach>/*.html die Lernseiten
faecher/<fach>/bilder/ Abbildungen der Lernseiten (relativ eingebunden, Klick öffnet sie in voller Größe)
shared/hub.css        gemeinsame Schicht für alle Fachseiten (Handy-Korrekturen, Tabellen, Treffer-Leiste)
shared/hub.js         Zurück-Link, Design-Übernahme, Sprung zum Treffer, Bildplatzhalter, Querverweise
shared/icons/         Seiten-Symbole (Tab-Icon, Startbildschirm): Buch für Portal und Lernseiten, Uhr für den Stundenplan, Blatt für die Schularbeiten
shared/live.js        Rechenlogik: was läuft gerade, was kommt danach, wie lange noch, nächste Lernzielkontrolle
shared/erinnerung.js  Erinnerungs-Pille (nächste Lernzielkontrolle) in der Menüzeile von Portal, Stundenplan und Schularbeiten
shared/daten.js       Suchindex          – wird erzeugt, nicht von Hand ändern
shared/seiten.js      Seitenliste        – wird erzeugt, nicht von Hand ändern
shared/stundenplan.js Stundenplan        – wird erzeugt, nicht von Hand ändern
shared/schularbeiten.js Schularbeiten    – wird erzeugt, nicht von Hand ändern
tools/build.mjs       erzeugt daten.js, seiten.js, stundenplan.js, schularbeiten.js und bindet hub.css/hub.js ein
tools/plan.mjs        prüft und bereitet Stundenplan und Schularbeiten auf (wird von build.mjs und den Tests benutzt)
tools/test-live.mjs   Tests für Aufbereitung und Live-Logik (node tools/test-live.mjs)
tools/icons.mjs       erzeugt die Seiten-Symbole in shared/icons/ (SVG und PNG)
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
Auch die Seiten der 3Mb entstehen dort: AEE „Einheit 1: Drehstrom“ (Text und Bilder aus den Unterrichtsnotizen) und das
Arbeitsblatt „Dreiphasenwechselspannung“ mit Lösungsvorschlägen und eigenen Diagrammen (Liniendiagramm und Zeigerbild werden
als SVG gezeichnet und passen sich dem hellen und dunklen Design an), beides in `aee3()`, sowie AM „Pneumatik: Grundlagen“
mit Beispielen und Übungen samt Lösungsvorschlägen in `pneu()`. Die Rechenwerte der Lösungen werden dabei im Skript berechnet,
nicht von Hand getippt. `python3 tools/seiten.py aee3` oder `... pneu` baut nur die jeweiligen Seiten. Danach
`node tools/build.mjs` ausführen, damit die Suche die neuen Seiten kennt.

## Schuljahre

`portal.json` legt fest, welches Jahr aktuell ist (`aktuell`) und wie die Klassen heißen. Jede Seite in
`faecher.json` trägt ein `"jahr"`. Das Portal führt pro Jahr einen eigenen Fächer- und Themenindex und durchsucht
standardmäßig nur das gewählte Jahr. Ist das aktuelle Jahr noch leer, öffnet es mit dem neuesten Jahr, das Seiten hat.
Zum Schuljahreswechsel: neuen Eintrag in `jahre` ergänzen und `aktuell` hochzählen.

## Stundenplan

`stundenplan.json` enthält die Zeiten der Einheiten, die Lehrkräfte mit vollem Namen, die Fächer und den Plan selbst:

- `vorlage`: der Plan, der Woche für Woche gilt. `von`/`bis` ist die Gültigkeit, `tage` enthält die Blöcke je Wochentag.
  Zum Verlängern genügt es, `bis` zu ändern.
- `wochen`: einzelne Wochen, die von der Vorlage abweichen (zum Beispiel mit Änderungen der Schule). Eine solche Woche
  ersetzt die Vorlage in dieser Kalenderwoche.
- `frei`: schulfreie Tage mit Grund (`von`, `bis`, `grund`). An diesen Tagen entfallen alle Blöcke, der Grund steht
  im Plan und in der Live-Anzeige.

Ein Block hat `ab`/`bis` (Nummern der Einheiten, 1 bis 10), `fach` und `gruppen` (Lehrerkürzel und Raum; mehrere Gruppen
laufen parallel). Optional `status`: `aenderung` (grün), `entfall` (wird bei „jetzt/danach“ übersprungen) oder `pruefung`.
Neue Lehrkräfte kommen unter `lehrer` dazu, neue Fächer unter `faecher`.

`node tools/build.mjs` prüft alles (unbekannte Kürzel, doppelt belegte Einheiten, ungültige Zeiten), setzt aus Vorlage,
Einzelwochen und freien Tagen die konkreten Wochen zusammen und erzeugt `shared/stundenplan.js`.

- **Menü:** Im Portal zeigt die Menüzeile oben das laufende Fach mit der Restzeit bis zum Ende des Fachs und das nächste
  Fach. Direkt aufeinanderfolgende Einheiten desselben Fachs (MET 1–3) zählen als ein Fach: Die Restzeit läuft ohne Sprung
  bis zum Ende der letzten Einheit, die kleinen Pausen dazwischen sind eingerechnet (um 08:00 steht bei MET 1–3 „noch
  2 h 40 min“, nicht „noch 45 min“). In der Pause innerhalb eines Fachs steht, wann es weitergeht und wann das Fach endet.
  Das gilt auch, wenn ein Fach im Plan als zwei Blöcke hintereinander eingetragen ist. Auf den Lernseiten erscheint während
  der Unterrichtszeit ein kleiner Chip in der Werkzeugleiste.
- **Stundenplan-Seite:** Wochenraster (Handy: Tagesansicht), Blättern nach Kalenderwoche, „Heute“-Knopf, freie Tage mit Grund.
- **Außerhalb des hinterlegten Plans** zeigt die Anzeige „Kein aktueller Stundenplan“ und nennt das Ende der Gültigkeit.
- **Zeit:** Gerechnet wird mit der Wiener Ortszeit. Zum Ausprobieren hängt man `?zeit=2026-11-24T10:15` an die Adresse,
  die Seite läuft dann ab diesem Zeitpunkt weiter.
- **Grenzen:** Der Plan wird von Hand gepflegt. Entfall, Vertretungen und Ferien, die nicht eingetragen sind, kennt er nicht.

## Schularbeiten und Tests

`schularbeiten.json` enthält die Termine (`datum`, `fach`, optional `art`, `titel` und `stoff`). `art` ist `Schularbeit`
(Standard) oder `Test`. Der Build markiert den Block des Fachs an diesem Tag im Stundenplan gelb mit der Art
(„Schularbeit“ oder „Test“), die Live-Anzeige nennt sie („AWL Schularbeit · noch 1 h 30 min“, „AEE Test · noch 2 h 20 min“),
und `schularbeiten.html` zeigt den nächsten Termin mit Countdown und die Stunde laut Stundenplan. Liegen an einem Tag
mehrere Termine (zum Beispiel Schularbeit und Test), stehen sie in der Reihenfolge der Datei. Hat das Fach an dem
Tag laut Plan keinen Unterricht oder liegt der Tag außerhalb des Plans, gibt der Build einen Hinweis aus.

## Lernzielkontrollen

Die wöchentlichen Lernzielkontrollen stehen in `stundenplan.json` unter `lernzielkontrollen`: je Regel `fach`, `tag` (`mi`, `do`, …),
optional `ab` und `bis` (Datum), `name` (Standard „Lernzielkontrolle“) und `seite` (Zusammenfassung, muss in `faecher.json` stehen).
Aktuell: AM am Mittwoch und AEE am Donnerstag, ab 20.11.2026.

- **Stundenplan:** Der Build kennzeichnet den Block des Fachs an diesem Wochentag mit „LZK“ (türkis, gestrichelt). An Tagen mit Test
  oder Schularbeit im selben Fach, bei Entfall und an freien Tagen entfällt die Kennzeichnung (der Test ersetzt die Kontrolle).
  Unter „Jetzt und danach“ stehen die nächsten drei Kontrollen mit Countdown und Link zur Zusammenfassung, die Live-Karte zeigt
  „Lernzielkontrolle“, wenn gerade eine läuft.
- **Menü:** Die Pille mit der Glocke zeigt die nächste Kontrolle. Sie ist ruhig, wenn die Kontrolle weiter weg ist, und gelb, wenn sie
  heute oder morgen ist; heute zählt, bis die Stunde zu Ende ist. Ein Klick führt zur Zusammenfassung. Mit `?zeit=2026-11-24T18:00`
  an der Adresse lässt sich ein anderer Zeitpunkt ausprobieren.
- **Zusammenfassung und Beispielaufgaben:** `faecher/mathematik/lzk-am3.html` und `faecher/aee/lzk-aee3.html` entstehen in
  `tools/seiten.py` (`lzk_am()` und `lzk_aee()`). Für die nächste Woche einen neuen Eintrag in der jeweiligen Funktion ergänzen
  (Lernziele, Zusammenfassung, typische Fehler, Aufgaben mit Lösung; die Rechenwerte werden im Skript berechnet) und
  `python3 tools/seiten.py lzk` sowie `node tools/build.mjs` ausführen. Die Seiten fassen die Unterlagen der letzten Einheiten zusammen,
  was genau abgefragt wird, entscheidet die Lehrkraft.
