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
- Geschützte Inhalte anderer (zum Beispiel Seiten von Lehrkräften hinter deren eigener Anmeldung) werden nicht kopiert.
