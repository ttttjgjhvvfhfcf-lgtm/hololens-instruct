# Hinweise für Claude-Sitzungen in diesem Repository

## Lernportal (`lernseiten/`)

Die veröffentlichte Seite (GitHub Pages) ist **verschlüsselt** und liegt hinter einer Anmeldung (E-Mail-Adresse der LBS 4 und Passwort). Im Repository steht der Inhalt nur als
`lernseiten/inhalt/*.enc`; der Klartext liegt in `lernseiten/klar/` und ist vom Git ausgeschlossen. Beschreibung, Befehle und Grenzen: `lernseiten/README.md`.

**Vor jeder Änderung am Portal**

1. Prüfen, ob `LERNPORTAL_PASSWORT` gesetzt ist (Umgebungsvariable der Sitzung). Fehlt sie, den Nutzer bitten, sie in den Einstellungen der Cloud-Umgebung einzutragen
   (Umgebungsmenü in der Titelleiste → Bearbeiten → Umgebungsvariablen). Das Passwort nie im Chat erfragen und nie ins Repository schreiben.
2. `node lernseiten/zugang/zugang.mjs auspacken` stellt `lernseiten/klar/` her.
3. Arbeiten wie gewohnt, siehe `lernseiten/klar/README.md` (`cd lernseiten/klar && node tools/build.mjs`, Tests mit `node tools/test-live.mjs`).
4. `node lernseiten/zugang/zugang.mjs einpacken`, dann `node lernseiten/zugang/zugang.mjs pruefe`; erst danach committen. **Klartext nie committen**
   (`lernseiten/klar/` nie mit `git add -f` hinzufügen).

## Zusammenarbeit

- Pull Requests, die nur `lernseiten/` ändern, darf Claude nach bestandenen Tests selbst mergen (Zusage des Eigentümers). Alles andere vorher fragen:
  `.github/`, andere Ordner dieses Repositorys und andere Repositories.
- Aus hochgeladenen Unterlagen werden keine Namen, Logos, Fußzeilen oder Autorenkennungen übernommen. Erkennbar Privates (Namen, Noten, Mailadressen, lokale Dateipfade)
  nicht veröffentlichen, sondern erst nachfragen.
- Geschützte Inhalte anderer (zum Beispiel Seiten von Lehrkräften hinter deren eigener Anmeldung) werden nur mit Erlaubnis des Urhebers übernommen, mit Credit auf jeder
  Seite und als eigene Fächer, getrennt von den eigenen Inhalten. Ohne Erlaubnis nichts kopieren.
- Vorhanden, laut Eigentümer erlaubt: die Fächer „Hr. Klein“ (K-AEE, K-AM, K-MET), Inhalt des Mechatronik-Lernportals von Ing. Michael Klein (mechatronik.web.app), Credit auf
  jeder Seite. Bedingung von Herrn Klein: Niemand sonst, auch keine andere Schule, bekommt Zugriff. Darum nur verschlüsselt ausliefern, das Repository privat halten und das
  Portal-Passwort allein beim Eigentümer lassen (nicht an die Klasse weitergeben). Seine Programme (Rechner, Test- und Schularbeitensimulator, Simulationen) sind nicht
  kopiert, sondern auf seine Seite verlinkt; kopiert werden sie nur, wenn Herr Klein das ausdrücklich erlaubt. Aufbau, Regeln und Neuerzeugung: `lernseiten/klar/README.md`,
  Abschnitt „Fächer Hr. Klein“.
- Zugangsdaten zu fremden Seiten, die der Eigentümer für eine Aufgabe nennt, nur dafür und nur lesend verwenden, nirgends speichern (nicht ins Repository, in keine Datei) und
  danach darauf hinweisen, dass er das Passwort wieder ändert.
