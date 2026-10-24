# Einkaufszettel

Eine gemeinsame Einkaufsliste als installierbare App für Android und iPhone.
Sie öffnet sich in einem eigenen Fenster ohne Browserleiste und synchronisiert
zwei Handys live. Es gibt eigene Listen für Lidl, Aldi Nord und Rewe. Artikel,
die gerade irgendwo im Angebot sind, bekommen ein gelbes Preisschild.

- **App:** https://maltematthiesenai-del.github.io/public-apis/einkaufszettel/
- **Demo ohne Konto:** dieselbe Adresse mit `#demo` am Ende

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `index.html`, `styles.css` | Oberfläche |
| `app.js` | Bedienung, Anzeige, Anmeldung, Prospekte auslesen |
| `core.js` | Reine Logik: Eingaben verstehen, Gänge zuordnen, Angebote zuordnen |
| `store.js` | Firebase (Login + Firestore) oder Demo-Speicher |
| `config.js` | Firebase-Zugangsdaten dieses Haushalts |
| `firestore.rules` | Wer lesen und schreiben darf (nur die zwei E-Mail-Adressen) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installation als App |
| `vendor/` | Firebase 12.19.0 und Anthropic SDK 0.133.0, gebündelt mit esbuild |
| `claude-artifact.html` | Frühere Fassung als Claude-Artifact |

## Einrichtung (einmalig, ca. 15 Minuten)

1. Auf <https://console.firebase.google.com> ein Projekt anlegen, z. B.
   „einkaufszettel“. Google Analytics wird nicht gebraucht.
2. **Authentication** → *Los geht's* → Anbieter **E-Mail/Passwort** aktivieren.
3. **Firestore Database** → *Datenbank erstellen* → Standort `europe-west3
   (Frankfurt)` → *Produktionsmodus*.
4. Firestore → Reiter **Regeln**: den Inhalt von `firestore.rules` einfügen,
   die beiden Beispieladressen durch eure echten E-Mail-Adressen ersetzen,
   **Veröffentlichen**.
5. **Authentication → Einstellungen → Autorisierte Domains**:
   `maltematthiesenai-del.github.io` hinzufügen.
6. Projektübersicht → **Web-App hinzufügen** (`</>`) → Name eingeben →
   das angezeigte `firebaseConfig`-Objekt in `config.js` eintragen.
7. Den Ordner auf den Branch bringen, von dem GitHub Pages ausliefert (`master`).

## Auf dem Handy installieren

- **Android (Chrome):** Adresse öffnen → Menü ⋮ → **App installieren**.
- **iPhone (Safari):** Adresse öffnen → Teilen → **Zum Home-Bildschirm**.

Danach startet die App wie jede andere App vom Startbildschirm aus.
Jede Person erstellt beim ersten Start ein eigenes Konto und bestätigt ihre
E-Mail. Danach sieht sie die gemeinsamen Listen.

## Angebote

Die Märkte bieten keine offene Schnittstelle für ihre Angebote an. Angebote
kommen deshalb auf zwei Wegen in die App:

1. **Prospekt-Screenshots auslesen:** Claude erkennt die Angebote auf den
   Bildern, man prüft sie und übernimmt sie. Dafür braucht die App einen
   API-Schlüssel von <https://console.anthropic.com>, den man unter
   Einstellungen einträgt. Er bleibt nur auf dem eigenen Gerät gespeichert.
   Ein Prospekt kostet etwa 5–15 Cent.
2. **Von Hand** eintragen.

Ein Artikel gilt als „im Angebot“, wenn das letzte Wort seines Namens mit dem
Kopfwort eines Angebots zusammenpasst. Im Deutschen steht das Grundwort eines
zusammengesetzten Worts am Ende: „Milch“ findet „Vollmilch“, aber „Butter“
findet nicht „Butterkekse“.

## Updates ausliefern

Bei jeder Änderung `CACHE` in `sw.js` und `APP_VERSION` in `app.js`
hochzählen. Die App lädt die neue Fassung beim nächsten Start. Unter
Einstellungen kann man mit **Nach Update suchen** sofort aktualisieren.
