# Lernportal – veröffentlichter Ordner (verschlüsselt)

Dieser Ordner wird auf GitHub Pages veröffentlicht. Er enthält **keinen lesbaren Inhalt**: Alle Seiten, Bilder und Daten des Portals liegen
verschlüsselt unter `inhalt/`. Wer die Adresse öffnet, sieht zuerst die Anmeldung (E-Mail-Adresse der LBS 4 und Passwort). Danach entschlüsselt
der Browser die Seiten beim Aufruf; sie sehen und funktionieren genau wie vorher.

## Wie die Anmeldung funktioniert

- **E-Mail:** Die Anmeldeseite akzeptiert nur Adressen der Schule (`…@lbs4.salzburg.at`, auch Subdomains). Die Adresse wird nicht bestätigt, es wird keine
  E-Mail verschickt, und sie verlässt das Gerät nicht. Sie dient nur der Anzeige („Angemeldet als …“) und dem Ausschluss fremder Adressen.
- **Passwort:** Ein gemeinsames Passwort der Klasse öffnet den Inhalt. Groß-/Kleinschreibung, Leerzeichen und Bindestriche zählen nicht.
  Aus dem Passwort wird mit PBKDF2-SHA-256 (600 000 Runden) ein Schlüssel abgeleitet, der den eigentlichen Inhaltsschlüssel auspackt
  (die „Hülle“ steht in `shared/zugang.json`). Der Inhalt selbst ist mit AES-256-GCM verschlüsselt.
- **Angemeldet bleiben:** Der Schlüssel liegt danach in IndexedDB des Browsers (30 Tage, ohne Haken 12 Stunden). Der Service Worker `sw.js` liefert
  jede Seite unter ihrer gewohnten Adresse entschlüsselt aus und merkt sich die verschlüsselten Dateien für den Betrieb ohne Netz.
  „Abmelden“ (Menü oben, auf Lernseiten in der Leiste) löscht Schlüssel und Zwischenspeicher.
- Ohne gültigen Schlüssel führt jede Adresse im Portal (auch alte Lesezeichen) zur Anmeldung und danach zurück zur gewünschten Seite.

## Was liegt wo

```
index.html              Anmeldeseite (öffentlich)
404.html                leitet unbekannte Adressen zur Anmeldung (wird von zugang.mjs erzeugt)
sw.js                   Service Worker: entschlüsselt beim Abruf
shared/zugang-kern.js   Kryptokern (Browser, Service Worker, Node)
shared/zugang.json      erlaubte Domain, Basis-Pfad und die Schlüsselhülle (kein Geheimnis ohne das Passwort)
shared/icons/           Seiten-Symbole (öffentlich)
inhalt/<hash>.enc       alle Dateien des Portals, verschlüsselt; der Dateiname verbirgt den Pfad
zugang/zugang.mjs       Kommandozeile: einpacken, auspacken, pruefe, passwort, init
zugang/test-*.mjs       Tests (Kern, Kommandozeile, Browser)
klar/                   Klartext des Portals – NICHT im Git (nur .gitignore), siehe unten
```

## Arbeiten am Portal (am Anfang jeder Sitzung)

Der Klartext liegt nur in `klar/` und wird nie committet. Dort sieht alles aus wie früher (`klar/README.md`: Stundenplan, Schularbeiten, Lernseiten, Build).

```bash
export LERNPORTAL_PASSWORT='xxxx-xxxx-xxxx'                 # in der Umgebung der Sitzung hinterlegt, nie im Repo
node lernseiten/zugang/zugang.mjs auspacken                 # inhalt/ -> klar/
cd lernseiten/klar && node tools/build.mjs                  # ändern, bauen, testen wie gewohnt
cd ../.. && node lernseiten/zugang/zugang.mjs einpacken     # klar/ -> inhalt/ (verschlüsselt)
node lernseiten/zugang/zugang.mjs pruefe                    # nur Erlaubtes öffentlich? alles entschlüsselbar und aktuell?
git add lernseiten && git commit                            # klar/ ist vom Git ausgeschlossen
```

`einpacken` ändert nur Dateien, deren Inhalt sich geändert hat (gleicher Inhalt ergibt dieselbe verschlüsselte Datei), der Git-Verlauf bleibt klein.
`pruefe` schlägt an, wenn etwas Lesbares im veröffentlichten Ordner liegt, ein Passwort oder Schlüssel darin steht oder `klar/` und `inhalt/` auseinanderlaufen.
**Nie `klar/` mit `git add -f` hinzufügen.**

Tests: `node lernseiten/zugang/test-kern.mjs`, `node lernseiten/zugang/test-cli.mjs` und (mit Passwort und ausgepacktem `klar/`)
`node lernseiten/zugang/test-e2e.mjs` (Browser; mit `--live https://…/hololens-instruct/` gegen die veröffentlichte Seite).

## Passwort

- Ein neues Passwort gibt es mit `node lernseiten/zugang/zugang.mjs passwort` (oder `--passwort wunsch`). Das erzeugt zugleich einen **neuen Schlüssel** und
  verschlüsselt alles neu; wer nur das alte Passwort kennt, kommt nicht an neue Inhalte. Angemeldete Browser werden beim nächsten Aufruf zur neuen Anmeldung geschickt.
- Das erzeugte Passwort hat rund 60 Bit (12 Zeichen). Ein selbst gewähltes sollte mindestens so lang und zufällig sein.
- Der Wiederherstellungsschlüssel (`LERNPORTAL_SCHLUESSEL`, 43 Zeichen) öffnet den Bestand auch ohne Passwort. Er gehört an einen sicheren Ort, nicht ins Repo.

## Grenzen

- **Das Passwort ist der Schutz.** Die verschlüsselten Dateien sind öffentlich; jeder kann dort offline Passwörter durchprobieren. Darum ein langes, zufälliges Passwort
  (kein Wort, kein Datum) und kein Weitergeben außerhalb der Klasse. Wer es kennt, kann alles lesen; auch Kopien, die er früher gespeichert hat, bleiben lesbar.
- **Die E-Mail-Adresse schützt nichts.** Sie wird nicht bestätigt; die Prüfung auf `@lbs4.salzburg.at` läuft im Browser und hält nur Unbeteiligte ab.
- **Frühere Stände bleiben öffentlich sichtbar**, soweit sie vor der Umstellung veröffentlicht wurden: im Git-Verlauf dieses Repositorys, in alten Pull Requests und
  möglicherweise in Suchmaschinen oder Web-Archiven. Ist das Repository öffentlich, kann man sie dort lesen. Wirklich entfernen lässt sich das nur mit einem neuen Repository
  oder einem privaten Repository (GitHub Pages aus privaten Repositories braucht einen Tarif, der das erlaubt).
- Alle Seiten unter derselben `…github.io`-Adresse teilen sich den Browser-Speicher. Fremde Skripte auf anderen Projektseiten derselben Adresse könnten den gemerkten Schlüssel lesen.
- Der Service Worker braucht HTTPS und einen normalen (nicht privaten Firefox-)Browser.
