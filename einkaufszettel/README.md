# Einkaufszettel

Eine gemeinsame Einkaufsliste für zwei Personen (Android und iPhone), die sich
live synchronisiert. Es gibt eigene Listen für Lidl, Aldi Nord und Rewe. Artikel,
die gerade irgendwo im Angebot sind, werden mit einem gelben Preisschild markiert.

**App:** https://claude.ai/artifact/7xouBCKbbfSztQL5mHLCUW

Die App läuft als Claude-Artifact. Login und Synchronisierung laufen über das
claude.ai-Konto, die Daten liegen in der Artifact-Datenbank. `index.html` ist
der Quelltext dieser Seite und dient hier als Sicherung. Für Änderungen wird
sie neu veröffentlicht.

## Daten

| Sammlung       | Inhalt                                                       |
| -------------- | ------------------------------------------------------------ |
| `lists`        | Listen: Name, Markt, Reihenfolge der Gänge (`catOrder`)      |
| `items`        | Artikel: `listId`, Name, Menge, Einheit, Gang, Notiz, erledigt, wer/wann |
| `history`      | Gelernte Artikel für Vorschläge (Gang, Einheit, Häufigkeit)  |
| `offers`       | Angebote: Markt, Titel, Preis, Normalpreis, gültig von/bis, Suchwörter |
| `meta/offers`  | Zeitpunkt der letzten Angebots-Aktualisierung                |
| `data/users/<id>/prefs` | Persönliche Einstellung (Hell/Dunkel), privat pro Person |

## Angebote

Die Märkte bieten keine offene Schnittstelle für ihre Angebote an. Angebote
kommen deshalb auf drei Wegen in die App:

1. **Prospekt-Bilder auslesen:** Screenshots aus dem Prospekt hochladen. Claude
   erkennt die Angebote, man prüft sie und übernimmt sie.
2. **Von Hand** eintragen.
3. **Über Claude** direkt in die Datenbank schreiben lassen.

Ein Artikel gilt als „im Angebot“, wenn das letzte Wort seines Namens mit dem
Kopfwort eines Angebots zusammenpasst. Im Deutschen steht das Grundwort eines
zusammengesetzten Worts am Ende: „Milch“ findet „Vollmilch“, aber „Butter“
findet nicht „Butterkekse“.
