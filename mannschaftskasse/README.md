# Mannschaftskasse ⚽

Eine kleine, schnelle App für die Buchführung der Mannschaftskasse — gedacht für
den Kassenwart einer Fußballmannschaft, der Beiträge, Strafen und Ausgaben im
Blick behalten will, ohne sich durch eine Buchhaltungssoftware zu kämpfen.

Kein Server, kein Konto, keine Installation: eine HTML-Datei, etwas CSS und
JavaScript. Alle Daten bleiben auf dem Gerät.

## Starten

**Direkt öffnen:** `index.html` im Browser öffnen — fertig.

**Als App auf dem Handy** (empfohlen, dann läuft sie auch offline und liegt als
Icon auf dem Homescreen): die Dateien über HTTPS ausliefern, z. B. per GitHub
Pages, und die Seite im Handy-Browser über „Zum Startbildschirm hinzufügen“
installieren.

Lokal mit einem Mini-Server testen:

```bash
cd mannschaftskasse
python3 -m http.server 8000   # oder: npx http-server -p 8000
# danach http://localhost:8000 aufrufen
```

> Der Offline-Modus (Service Worker) funktioniert nur über `http://localhost`
> oder HTTPS, nicht beim direkten Öffnen per `file://`. Die App selbst läuft
> auch dort.

**Als eine einzige Datei zum Weitergeben:**

```bash
node build-einzeldatei.js        # erzeugt mannschaftskasse-app.html
```

Darin stecken HTML, CSS, JavaScript und das Icon zusammen — die Datei lässt sich
verschicken, doppelklicken und sofort nutzen. Nur Installation als App und
Offline-Cache fehlen dort, dafür braucht es die Einzeldateien auf einem Server.

## Was die App kann

**Übersicht** — ein Dashboard aus Karten, das sich auf breiten Schirmen in drei
Spalten legt und auf dem Handy zu einer Spalte stapelt (dort steht der
Kassenstand oben):

- Verlaufsdiagramm über 6 oder 12 Monate mit Saldo des Zeitraums und
  Tabellenansicht
- Kassenstand mit Veränderung der letzten 30 Tage und den Kennzahlen
- Offene Beträge je Spieler als Tabelle mit Anteilsbalken
- Ausgaben nach Kategorie, letzte Buchungen, Strafenkasse nach Spielern

Auf breiten Schirmen liegt die App als gerundetes Panel auf der Seitenfläche;
die Seitenleiste trennt die Hauptnavigation von der unteren Gruppe ab.

**Buchungen** — jede Buchung hat Betrag, Kategorie, Datum, optional einen
Spieler, eine Notiz und einen Status. Suchen und filtern nach Art, Status und
Spieler; nach Monaten gruppiert. Antippen öffnet die Buchung zum Bearbeiten,
Löschen lässt sich rückgängig machen.

**Spieler** — Kader nach Trikotnummer sortiert (aufsteigend, ohne Nummer
zuletzt, inaktive Spieler ganz am Ende), pro Spieler die offene Summe und die
komplette Buchungshistorie. Ein Tipp aufs Detail bucht direkt etwas Neues für
diesen Spieler.

**Strafen** — ein vorbelegter Strafenkatalog (zu spät zum Training, gelbe Karte,
Geburtstag ohne Kuchen …), frei anpassbar. Eine Strafe antippen, Spieler
ankreuzen, fertig — auch für mehrere Spieler auf einmal.

**Saisons** — die App führt beliebig viele Spielzeiten. Oben rechts schaltet
der Umschalter zwischen ihnen um; alles, was die App zeigt und rechnet —
Kassenstand, Diagramm, offene Beträge, Auswertungen, CSV-Export — bezieht sich
immer auf die gewählte Saison.

Beim Anlegen einer neuen Saison schlägt die App den Folgenamen vor
(„2026/27" → „2027/28") und übernimmt auf Wunsch den Kassenstand der
laufenden Saison als Buchung „Anfangsbestand". Ein negativer Bestand wird
dabei als Ausgabe übernommen, damit der Kassenstand nahtlos weiterläuft.
Offene Forderungen bleiben in der alten Saison stehen — der Dialog weist
darauf hin, wenn es welche gibt.

**Mehr** — Mannschaftsname, Saisonverwaltung, Beitragshöhe; Beiträge für den ganzen Kader
in einem Rutsch buchen; alle offenen Forderungen auf einmal abhaken; Hell-,
Dunkel- oder Automatik-Design; CSV-Export, Sicherung und Wiederherstellung,
Beispieldaten.

## Bezahlt oder offen — das Prinzip

Der Unterschied ist der Kern der App:

- **Bezahlt** heißt: Das Geld ist tatsächlich geflossen. Nur solche Buchungen
  verändern den **Kassenstand**.
- **Offen** heißt: Der Betrag steht noch aus. Eine offene Einnahme ist eine
  **Forderung** (ein Spieler schuldet der Kasse etwas), eine offene Ausgabe eine
  **Auslage** (die Kasse schuldet jemandem etwas, der vorgestreckt hat).

Strafen und Beiträge werden deshalb standardmäßig als *offen* angelegt.

**Abhaken:** Jede offene Zeile trägt rechts einen Haken. Ein Tipp darauf bucht
den Betrag als Einnahme, entfernt ihn aus den offenen Forderungen und hält den
Tag der Zahlung fest — versehentlich abgehakt lässt sich über „Rückgängig" im
Hinweis sofort zurücknehmen.

Der Zahltag wird getrennt vom Buchungstag geführt: Eine Strafe aus dem März,
die im August bezahlt wird, erscheint im Diagramm im August. Im Buchungsdialog
lässt sich das Feld „Bezahlt am" jederzeit korrigieren.

Alle Buchungen bleiben nach dem Anlegen änderbar — antippen öffnet sie zum
Bearbeiten oder Löschen.

## Daten & Sicherung

Alles liegt im `localStorage` des Browsers — nichts wird hochgeladen, nichts
verlässt das Gerät. Das heißt aber auch: Wer den Browser-Speicher löscht, löscht
die Kasse.

Deshalb regelmäßig unter **Mehr → Sicherung speichern** eine JSON-Datei ablegen.
Über **Sicherung laden** kommt sie zurück — das ist auch der Weg, die Kasse an
den nächsten Kassenwart oder auf ein neues Handy zu übergeben. Der
**CSV-Export** öffnet sich direkt in Excel oder LibreOffice, etwa für die
Jahresabrechnung.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst, Navigation, Icon-Sprite |
| `styles.css` | Design-Tokens (hell/dunkel) und alle Komponenten |
| `app.js` | Daten, Berechnungen, Ansichten, Dialoge, Import/Export |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `manifest.webmanifest`, `icon.svg` | Installation als App |
| `build-einzeldatei.js` | baut alles zu einer einzigen HTML-Datei zusammen |

Kein Build-Schritt, keine Abhängigkeiten. Nach Änderungen zwei Zähler
hochsetzen: `CACHE` in `sw.js` und `APP_VERSION` in `app.js` — Letzteres wird
unter „Mehr" angezeigt, daran erkennt man auf dem Handy, welche Fassung
angekommen ist.

## Wie Aktualisierungen auf dem Handy ankommen

Der Service Worker fragt **zuerst das Netz** und greift erst auf den
Zwischenspeicher zurück, wenn nichts antwortet (nach 3,5 Sekunden) oder gar
kein Empfang da ist. Damit zeigt die installierte App beim Start immer den
neuesten Stand, funktioniert aber ohne Netz weiter.

Drei Details sind dafür nötig, und jedes einzelne davon reicht aus, um
Aktualisierungen zu verhindern, wenn es fehlt:

1. Die Anfrage ans Netz läuft mit `cache: 'no-cache'` — sonst schiebt sich der
   Zwischenspeicher des Browsers davor (GitHub Pages erlaubt zehn Minuten).
2. Die Registrierung nutzt `updateViaCache: 'none'`, damit `sw.js` selbst
   nicht aus dem Zwischenspeicher kommt.
3. Beim Start und beim Zurückholen aus dem Hintergrund wird nach einer neuen
   Fassung gesucht; übernimmt eine neue, lädt die Seite genau einmal neu.

Unter **Mehr → Version** steht die installierte Fassung, daneben ein Knopf für
die Suche von Hand. Die Einzeldatei-Fassung hat keinen Service Worker und
aktualisiert sich deshalb nicht selbst — die muss man neu herunterladen.

## Zum Design

Dunkles Anthrazit mit Grünstich, abgesetzte Karten mit großen Radien und ein
einziger lauter Akzent in Limette (`#b4f038`) — auf Knöpfen als Fläche mit
dunkler Schrift, sonst als Schriftfarbe für alles Aktive. Dunkel ist die
Grundstimmung; unter **Mehr → Darstellung** lässt sich auf Hell oder
Automatisch umstellen. Das helle Design nutzt dieselben Formen, ersetzt die
Limette als Schriftfarbe aber durch ein dunkleres Grün, weil Limette auf Weiß
nur 1,4:1 Kontrast bringt.

Das Diagramm zeigt Einnahmen in Grün und Ausgaben in Rot. Dieses Paar ist für
rot-grün-blinde Menschen das schwierigste überhaupt, deshalb sind die Töne
bewusst unterschiedlich hell gewählt: Sie bleiben auch dann unterscheidbar,
wenn der Farbton wegfällt (gemessener Abstand ΔE 25,8 im dunklen und 10,3 im
hellen Design, Zielwert ≥ 8). Zusätzlich steht die Reihenfolge fest —
Einnahmen immer links, Ausgaben immer rechts —, es gibt eine Legende und die
Tabellenansicht, sodass die Werte nie allein an der Farbe hängen.

Beträge werden bewusst selbst formatiert statt über `Intl`: So steht auf jedem
Gerät derselbe Euro-Betrag in deutscher Schreibweise — auch wenn das Handy auf
Englisch läuft. In den Listen darf Text auf zwei Zeilen umbrechen statt
abgeschnitten zu werden; das ist der Grund für den Rasteraufbau der Zeilen.
