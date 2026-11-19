# Lernübersicht MET – Leitungen, Sicherungen & Schutzmaßnahmen

Zusammenfassung der Unterrichtseinheiten 7–21 (Mechatronik, 2M/2Md)

---

## 1. Elektrische Leitungen – Grundlagen (UE 7–8)

**Zwei Hauptgruppen:**
- **Bewegliche Leitungen** → für ortsveränderliche Verbraucher (müssen *immer* darüber angeschlossen werden)
- **Leitungen für feste Verlegung** → fast ausschließlich mit PVC-Isolierung; Nennspannung darf nie überschritten werden

**Genormte Querschnitte (mm²):**
0,5 / 0,75 / 1,5 / 2,5 / 4 / 6 / 10 / 16 / 25 / 35 / 50 / 70 / 95 / 120

### Bewegliche Leitungen (Anschluss ortsveränderlicher Verbraucher)
| Typ | Kurzzeichen | Spannung | Adern | Verwendung |
|---|---|---|---|---|
| Zwillingsleitung | H03VH-Y | 300/300 V | 2 | kleine Handapparate (z. B. Rasierer) |
| Leichte Kunststoffschlauchltg. | H03VV-F | 300/300 V | 2–3 | geringe Beanspruchung, *nicht* für Kochgeräte |
| Mittlere Kunststoffschlauchltg. | H05VV-F | 300/500 V | 2–5 | Waschmaschinen, Kühlschränke, Wärmegeräte |
| Gummischlauchleitung | H05RR-F | 300/500 V | 2–5 | höhere Beanspruchung (Staubsauger, Lötkolben) |

### Leitungen für feste Verlegung
| Typ | Kurzzeichen | Spannung | Verwendung |
|---|---|---|---|
| Kunststoffaderleitung | H07V-U/-R/-K | 450/750 V | in Rohren, trockene Räume, Verteilung |
| Stegleitung | NYIF | 230/400 V | nur trocken, in/unter Putz; nicht auf Holz/Metall, nicht im Bad |
| Mantelleitung | NYM | 300/500 V | unter Putz, trocken/feucht/nass; **nicht** im Erdreich |

### Bemessung beweglicher Leitungen
- **Kriterium 1:** mechanische Beanspruchung
- **Kriterium 2:** Nennstrom des Verbrauchsgerätes
- **Mindestquerschnitte (Festigkeit):** Schlauchleitungen 0,75 mm² · leichte Schlauchltg. (≤3 A, ≤2 m) 0,5 mm² · vieladrige Steuerltg. (≥7 Adern) 0,1 mm²
- **Nicht zu knapp bemessen!** Bei zulässigem Dauerstrom: Oberfläche 60 °C (Gummi) / 70 °C (PVC)
- **Kabeltrommel:** wegen schlechter Kühlung **abwickeln**, nie mit vollem Strom belasten

**Höchstzulässige Dauerströme (Auswahl):**
| Querschnitt | 0,75 | 1 | 1,5 | 2,5 | 4 | 6 mm² |
|---|---|---|---|---|---|---|
| Haus-/Handgeräte (2 Adern) | 6 A | 10 A | 16 A | 20 A | 25 A | – |
| Auf Flächen liegend | 12 A | 15 A | 18 A | 26 A | 34 A | 44 A |

### Anschlussregeln (Stecker & Verlängerung)
- Adern mit **Aderendhülsen / Kabelschuhen** sichern
- **Schutzleiter (grün/gelb) immer länger** lassen → reißt bei Zugbelastung zuletzt
- Leitung **zug-/schubentlastet und vor Knickung geschützt**
- Verlängerungen: **nie zwei Stecker**, immer mit Schutzleiter
- Drehstrom bis 32 A → **fünfpolige CEE-Steckvorrichtung**, Phasenfolge nie umkehren
- Verboten: Zwischenstecker, Bananenstecker an Lampenfassungen, Mehrfachsteckdosen mit starr angebautem Stecker

---

## 2. Bezeichnungen & Normen – Typkurzzeichen nach HD 361 (UE 9)

Aufbau am Beispiel **H05RR-F 3G2,5**:

| Stelle | Bedeutung | Beispiele |
|---|---|---|
| 1. Kennzeichnung | **H** = harmonisiert · **A** = nationaler Typ | |
| 2. Spannung U₀/U | 01=100/100 · 03=300/300 · 05=300/500 · 07=450/750 V | |
| 3. Isolierwerkstoff | **V**=PVC · **R**=EP-Gummi · **S**=Silikon · **B**=EP-Kautschuk · **Z**=Polyolefin | |
| 4. Mantelwerkstoff | **V**=PVC · **R**=EP-Gummi · **N**=Polychloropren · **T**=Textil · **J**=Glasfaser · **Q**=Polyurethan | |
| (Besonderheit) | **H**=flach aufteilbar · **H2**=flach nicht aufteilbar | |
| 5. Leiterform | **-U**=eindrähtig · **-R**=mehrdrähtig · **-F**=feindrähtig flexibel · **-K**=feindrähtig fest · **-D/-E**=Schweißltg. · **-Y**=Lahnlitze | |
| 6. Schutzleiter | **G**=mit SL · **X**=ohne SL | |
| 7. Aderzahl + Querschnitt | z. B. 3 × 2,5 mm² | |

**Merksätze:**
- U₀ = Spannung Leiter gegen Erde · U = Spannung zwischen den Adern (Systemspannung bei Drehstrom)
- *A05VV-U3×1,5* = nationaler Typ, 300/500 V, PVC, eindrähtig, 3 Adern, ohne SL, 1,5 mm²
- Unterschied *U4G* vs. *R4X*: eindrähtig mit SL ↔ mehrdrähtig ohne SL

---

## 3. Leitungsverlegung, Rohre, Steckdosen, Schalter (UE 11–12)

### Verlegearten
in/unter Putz · in Rohren/Installationskanälen · Mantelleitungen/Kabel direkt

### Installationszonen im Wohnbereich
- Leitungen **immer senkrecht/waagrecht** verlegen
- **waagrecht:** 15–45 cm unter Decke bzw. über Fußboden
- **senkrecht:** 10–30 cm neben Fenstern, Türen, Wandecken
- **Vorzugsmaße:** Schalter 105 cm · Steckdosen 30 cm (Küche/Arbeitsfläche 115 cm) über Fertigfußboden

### Leitungsverbindungen
- Nur auf isolierender Unterlage (Schraubklemmen, Pressverbinder, Löten, Schweißen)
- In Rohren/Kanälen **nur in Dosen/Kästen**; lösbare Verbindungen müssen zugänglich bleiben

### Rohre
- Schützen Leitungen gegen mechanische Beschädigung
- **Aderleitungen müssen immer in Schutzrohren** liegen

### Aderkennzeichnung (Farben)
| Farbe | Verwendung |
|---|---|
| **Grün/Gelb** | ausschließlich Schutzleiter (PE/PEN); PEN-Enden zusätzlich dauerhaft **blau** markieren |
| **Blau (hellblau)** | Neutralleiter |
| **Braun / Schwarz / Grau** | Außenleiter L1 / L2 / L3 |

### Steckvorrichtungen – Beschriftung
- **10/250** → Gleich-/Wechselstrom bis 250 V / 10 A
- **16/250~** → nur Wechselstrom bis 16 A / 250 V
- **10/16 A 250 V** → 10 A Gleichstrom *oder* 16 A Wechselstrom
- CEE-Drehstromsteckdose von vorne: Phasenfolge im **Uhrzeigersinn**

### Schalterarten
| Schalter | Eigenschaft |
|---|---|
| **Leerschalter (Trenner)** | führt Bemessungsstrom dauernd, schaltet nur Bruchteil |
| **Lastschalter** | führt **und** schaltet Bemessungsstrom |
| **Leistungsschalter** | führt + schaltet Vielfaches aus (z. B. LS-Schalter) |
- Einpolige Schalter **nur im nicht geerdeten Leiter**
- Lichtbogen entsteht beim Öffnen; bei induktiven Lasten & Gleichstrom besonders stark → spezielle Schalter
- Beschriftung **32(16)/~250**: Klammer = Bemessungsstrom für Motorlast (16 A), 32 A für Widerstandslast

---

## 4. Schmelzsicherungen (UE 13)

Schützen Leitungen/Betriebsmittel vor **Überlast** (zu hohe Stromaufnahme) und **Kurzschluss** (Isolationsfehler).
**Niemals flicken oder überbrücken!**

### Bauarten
- **Stöpselsicherungen:** DIAZED (älteres D-System) · NEOZED (neueres, platzsparendes D0-System)
- **Unverwechselbarkeit** durch Passeinsatz/Passschraube → verhindert Einsatz höherer Werte
- Schmelzeinsatz: Porzellan-Hohlkörper mit **Quarzsand** (Funkenlöschung), **Kennmelder** zeigt Auslösen
- **NH-Sicherung** (Niederspannungs-Hochleistung): 2 A bis >1250 A; nur durch Fachkräfte mit **Aufsteckgriff, Helm, Gesichtsschutz** wechseln (ÖVE/ÖNORM E 8689)
- **G-Sicherung** (Geräteschutz): 0,032–20 A, 250 V, z. B. 5×20 mm, für Elektronik/Netzteile

### Abschaltcharakteristik (G-Sicherungen)
**FF** superflink · **F** flink · **M** mittelträge · **T** träge · **TT** superträge
→ Beispiel **T 0,1/250** = träge, 0,1 A, 250 V

### Betriebsklassen (NH/gG)
- **gG** allgemeine Verwendung (früher gL) · **gM** Motoren · **gR** Halbleiter · **gTr** Transformator · **aM/aR** Teilbereichsschutz

---

## 5. Schutzschalter (UE 15–18)

Trennen Verbraucher selbständig vom Netz bei Überlast, Kurzschluss oder gefährlicher Berührungsspannung.
**Freiauslösung:** Abschaltung lässt sich durch Festhalten des Knebels nicht verhindern.

### Auslösesysteme
- **Thermischer Auslöser** → Überlast; **Bimetall** (zwei Metalle mit unterschiedl. Ausdehnung) biegt sich, verzögert
- **Elektromagnetischer Auslöser** → Kurzschluss; Spule + **Schlaganker** entklinkt sofort

### Auslösegrenzen
| Strom | Wert | Wirkung |
|---|---|---|
| Nichtauslösestrom | I_N × 1,13 | löst **nie** aus |
| therm. Auslösestrom | I_N × 1,45 | ≤ 1 h |
| elektromag. Auslösestrom | I_N × 5 (Typ B) | ≤ 0,1 s |

### Leitungsschutzschalter (LSS) – Typen
| Typ | Auslösung | Anwendung |
|---|---|---|
| **B** | **3–5fach** | allgemein, Beleuchtung, Haushalt |
| **C** | **5–10fach** | Motoren, Handwerkzeug, hohe Anlaufströme |
| **D** | **10–20fach** | Trafos, Sondergeräte, hohe Stromspitzen |
*Merke: C13 → Motor · B16 → allgemein*

**Auslösekennlinie lesen:** n-facher Bemessungsstrom = I_p / I_N
→ ta1 = frühestmögliches, ta2 = sicheres Auslösen
(Beispiel B16 A bei I_p = 32 A → n = 2 → ta1 ≈ 20 s, ta2 ≈ 3 min)

### Motorschutzschalter
- Motoren ziehen bei Überlast / Ausfall eines Außenleiters mehr Strom → können zerstört werden
- Schalten **allpolig**, Schutz gegen Nichtanlauf, Überlast, Spannungsausfall, Phasenausfall
- Bemessungsstrom **einstellbar** (z. B. 3,1/1,8 A)
- Schutz mit **Kaltleiter (PTC)** im Motor: Widerstand steigt steil bei Ansprechtemperatur
- ⚠️ Schützt **nur das Betriebsmittel** → zusätzlicher **Leitungs-/Kurzschlussschutz** (Sicherung/LS-Schalter) erforderlich

---

## 6. Fehlerarten in elektrischen Anlagen (UE 19)

| Fehler | Definition |
|---|---|
| **Körperschluss** | leitende Verbindung zwischen Gehäuse und aktiven Teilen |
| **Kurzschluss** | Verbindung zwischen spannungsführenden Teilen, **kein** Nutzwiderstand |
| **Leiterschluss** | Verbindung zwischen Leitern **mit** Nutzwiderstand im Fehlerkreis |
| **Erdschluss** | Verbindung aktiver Leiter / N mit Erde oder geerdeten Teilen |

- **Direktes Berühren:** Kontakt mit aktiven Teilen direkt
- **Indirektes Berühren:** Kontakt über Körperschluss (Gehäuse)
- **Fehlerspannung U_F = I_F × R_A** → bei Isolationsfehler zwischen leitfähigem Teil und Bezugserde
- **Berührungsspannung U_T** → liegt am Körper, wenn er durchflossen wird (gilt auch für Nutztiere)
- Stromwirkung auf Körper: Bereiche **AC-1 bis AC-4** (Einwirkdauer × Stromstärke)

---

## 7. Schutzleiter (UE 19)

- Leiter zur Sicherheit gegen elektrischen Schlag, mit Erde verbunden → **Schutzerdungsleiter / PE-Leiter**
- Verhindert bei Körperschluss eine gefährliche Fehlerspannung
- **Abkürzung PE · Farbe grün/gelb · Erdungssymbol**
- ⚠️ Darf **niemals abgesichert, geschaltet oder unterbrochen** werden – Verwechseln = Lebensgefahr!

**Mindestquerschnitt Schutzerdungsleiter:**
| Außenleiter | PE mindestens |
|---|---|
| bis 16 mm² | = wie Außenleiter |
| 25 & 35 mm² | 16 mm² |
| über 35 mm² | halber Außenleiterquerschnitt |

---

## 8. Schutzmaßnahmen gegen elektrischen Schlag (UE 21)

Jede Schutzmaßnahme = **a) Basisschutz UND b) Fehlerschutz** *oder* **verstärkte Schutzvorkehrung**

**Übersicht:** Kleinspannung (SELV/PELV) · Automatische Abschaltung · Schutztrennung · Schutzisolierung

### Basisschutz (gegen direktes Berühren)
a) Basisisolierung · b) Abdeckungen/Umhüllungen · c) Hindernisse · d) Anordnung außerhalb Handbereich

### Schutzisolierung (Schutzklasse II)
- Basisisolierung **+** verstärkte Isolierung, **kein Schutzleiter**
- Arten: Vollisolierung (isolierstoffgekapselter Motor), Zwischenisolierung
- Symbol: **doppeltes Quadrat** · Stecker: Euro-/Flachstecker

### Standortisolierung
- Fußboden + Handbereich isoliert → Person nicht gefährdet
- **Nur zulässig bei ortsfesten Betriebsmitteln**

---

## 9. Schutzarten IP (UE 20)

**IP** = International Protection, gefolgt von 2 Ziffern.

### 1. Ziffer – Fremdkörper-/Berührungsschutz
| Ziffer | Schutz |
|---|---|
| 0 | kein |
| 1 | ≥ 50 mm (Handrücken) |
| 2 | ≥ 12,5 mm (Finger) |
| 3 | ≥ 2,5 mm (Werkzeug) |
| 4 | ≥ 1 mm (Draht) |
| 5 | staubgeschützt |
| 6 | staubdicht, voller Berührungsschutz |

### 2. Ziffer – Wasserschutz
| Ziffer | Schutz |
|---|---|
| 0 | kein |
| 1 | senkrecht tropfend |
| 2 | tropfend (15° gekippt) |
| 3 | Sprühwasser (60°) |
| 4 | Spritzwasser allseitig |
| 5 | Strahlwasser (Düse) |
| 6 | starkes Strahlwasser / schwere See |
| 7 | Eintauchen (Druck/Zeit) |
| 8 | dauerndes Untertauchen |

- Fehlende Angabe → **X** (z. B. IP X3, IP 3X)
- Beispiele: **IP40** (Steckdose innen) · **IP65** (wasserdichte Außenleuchte)

---

## 10. Schutzklassen (UE 20)

| Klasse | Symbol | Merkmal | Beispiele |
|---|---|---|---|
| **SK I** | Erdungszeichen | Schutzleiteranschluss | Waschmaschine, E-Herd, Geschirrspüler, Bügeleisen |
| **SK II** | doppeltes Quadrat | Schutzisoliert, **kein** SL | Rasierer, Handwerkzeug, Radio/TV, Handlampen |
| **SK III** | drei Rauten | Kleinspannung (SELV/PELV), **kein** SL | Kinderspielzeug, med. Geräte, Fassleuchten |

---

### Schnell-Merker fürs Prüfungsgedächtnis
- Schutzleiter = **grün/gelb**, niemals unterbrechen
- LS-Typen: **B 3–5× · C 5–10× · D 10–20×**
- Auslösung: 1,13× nie · 1,45× ≤1 h · 5× ≤0,1 s
- NH-Sicherung nur mit Aufsteckgriff + Schutzausrüstung
- Motorschutzschalter schützt **Motor**, nicht die Leitung
- IP: 1. Ziffer = fest (Fremdkörper), 2. Ziffer = flüssig (Wasser)
