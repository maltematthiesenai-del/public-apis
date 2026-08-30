# Prüfungen der Rechenwege

Drei Tests, die die Beträge der App gegen eine unabhängige Nachrechnung
stellen. Sie brauchen Node und Playwright:

```bash
NODE_PATH=$(npm root -g) node tests/formeln.js      # alle Summen der App
node tests/betrag.js                                 # Betragserkennung
NODE_PATH=$(npm root -g) node tests/csv.js           # Spaltensummen im CSV
NODE_PATH=$(npm root -g) node tests/invarianten.js   # Zahlen gegeneinander
```

**`formeln.js`** erzeugt 140 zufällige, aber reproduzierbare Buchungen — rund
die Hälfte davon in Raten —, rechnet Kassenstand, Einnahmen, Ausgaben, offene
Forderungen, Auslagen, die Monatsreihe des Diagramms, die Kategorien und die
Beträge je Spieler in reiner Ganzzahlarithmetik nach und vergleicht sie mit
dem, was die Oberfläche anzeigt. Zusätzlich geprüft: der Saldo über der
Buchungsliste, der Kassenstand der Saison, der Betrag der Bestandsübernahme
und der Hinweis auf offene Forderungen beim Saisonwechsel.

**`betrag.js`** zieht `parseAmount` und `centsToInput` aus `app.js` heraus und
prüft Eingabeformate, ungültige Eingaben und den Rundlauf Cent → Feld → Cent
für 285.715 Werte.

**`csv.js`** exportiert eine CSV und summiert deren Spalten nach.

**`invarianten.js`** prüft nicht einzelne Zahlen, sondern ob die angezeigten
Zahlen **zueinander** passen — über zwei Saisons und Forderungen mit und ohne
Spieler: Kassenstand gegen Einnahmen minus Ausgaben, die Kachel „Offene
Forderungen" gegen ihre Aufschlüsselung in der Tabelle und im Kader, den Saldo
über der Buchungsliste, die Summe der gefilterten Liste gegen die Kacheln, die
Summe aller Saisons und das Verhalten nach „alle offenen Forderungen abhaken".
Diese Art Prüfung findet Lücken, die eine reine Nachrechnung übersieht: Beide
Seiten können für sich richtig sein und trotzdem nicht zusammenpassen.

Die Tests sind so gebaut, dass sie gegen fehlerhafte Fassungen durchfallen —
gegen den Stand vor der Prüfung vom August 2026 melden sie acht Abweichungen.
