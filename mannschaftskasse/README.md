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

**Übersicht** — Kassenstand als große Zahl, Einnahmen und Ausgaben, offene
Forderungen und offene Auslagen, ein Balkendiagramm der letzten sechs Monate
(mit Tabellenansicht) sowie die letzten Buchungen und die größten Außenstände.

**Buchungen** — jede Buchung hat Betrag, Kategorie, Datum, optional einen
Spieler, eine Notiz und einen Status. Suchen und filtern nach Art, Status und
Spieler; nach Monaten gruppiert. Antippen öffnet die Buchung zum Bearbeiten,
Löschen lässt sich rückgängig machen.

**Spieler** — Kader mit Trikotnummer, pro Spieler die offene Summe und die
komplette Buchungshistorie. Ein Tipp aufs Detail bucht direkt etwas Neues für
diesen Spieler.

**Strafen** — ein vorbelegter Strafenkatalog (zu spät zum Training, gelbe Karte,
Geburtstag ohne Kuchen …), frei anpassbar. Eine Strafe antippen, Spieler
ankreuzen, fertig — auch für mehrere Spieler auf einmal.

**Mehr** — Mannschaftsname, Saison, Beitragshöhe; Beiträge für den ganzen Kader
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

Strafen und Beiträge werden deshalb standardmäßig als *offen* angelegt. Zahlt der
Spieler, wird die Buchung auf *bezahlt* gesetzt und wandert in den Kassenstand.

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

Kein Build-Schritt, keine Abhängigkeiten. Wer etwas ändert, lädt einfach neu —
nach Änderungen an den Dateien in `sw.js` die `CACHE`-Version hochzählen, damit
installierte Kopien die neue Fassung ziehen.

Das Diagramm zeigt Einnahmen in Grün und Ausgaben in Rot. Dieses Paar ist für
rot-grün-blinde Menschen das schwierigste überhaupt, deshalb sind die Töne
bewusst unterschiedlich hell gewählt: Sie bleiben auch dann unterscheidbar,
wenn der Farbton wegfällt (gemessener Abstand ΔE 9,3 im hellen und 11,1 im
dunklen Design, Zielwert ≥ 8). Zusätzlich steht die Reihenfolge fest —
Einnahmen immer links, Ausgaben immer rechts —, es gibt eine Legende und die
Tabellenansicht, sodass die Werte nie allein an der Farbe hängen.

Beträge werden bewusst selbst formatiert statt über `Intl`: So steht auf jedem
Gerät derselbe Euro-Betrag in deutscher Schreibweise — auch wenn das Handy auf
Englisch läuft. In den Listen darf Text auf zwei Zeilen umbrechen statt
abgeschnitten zu werden; das ist der Grund für den Rasteraufbau der Zeilen.
