# Lernportal 2Md

Startseite: `index.html` – Fächerübersicht, Themenindex A–Z und Suche über alle Lernseiten.

```
index.html            Portal (Fächer, Index, Suche)
faecher.json          Liste der Fächer und Seiten
faecher/<fach>/*.html die Lernseiten
shared/hub.js         „← Alle Fächer“-Link + Sprung zum Suchtreffer (in jede Lernseite eingebunden)
shared/daten.js       Suchindex – wird erzeugt, nicht von Hand ändern
tools/build.mjs       erzeugt shared/daten.js
```

## Neue Seite oder neues Fach hinzufügen

1. HTML-Datei nach `faecher/<fach>/` legen und vor `</body>` einfügen:
   `<script src="../../shared/hub.js"></script>`
2. Seite (oder neues Fach mit Kürzel und Farbe) in `faecher.json` eintragen.
3. Index neu erzeugen: `node tools/build.mjs` (braucht Node.js und Playwright).

Bedienung der Suche: `Strg+K` oder `/` springt ins Suchfeld, `↑ ↓` wählt einen Treffer, `Enter` öffnet ihn
direkt an der passenden Stelle, `Esc` leert die Suche.

## Seiten aus Rohmaterial erzeugen

`python3 tools/seiten.py` baut aus den Vorlagen in `quellen/` (Markdown, einfache HTML-Seiten) Lernseiten im
einheitlichen Stil: MET-Lernübersicht, AEE2-Formelübersicht, AEE2-Merksätze und die Mathematik-Probeschularbeit.
Danach `node tools/build.mjs` ausführen, damit die Suche die neuen Seiten kennt.
