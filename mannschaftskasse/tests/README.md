# Prüfungen der Rechenwege

Drei Tests, die die Beträge der App gegen eine unabhängige Nachrechnung
stellen. Sie brauchen Node und Playwright:

```bash
NODE_PATH=$(npm root -g) node tests/formeln.js      # alle Summen der App
node tests/betrag.js                                 # Betragserkennung
NODE_PATH=$(npm root -g) node tests/csv.js           # Spaltensummen im CSV
NODE_PATH=$(npm root -g) node tests/invarianten.js   # Zahlen gegeneinander
NODE_PATH=$(npm root -g) node tests/rollen.js        # Rollen im Kader
NODE_PATH=$(npm root -g) node tests/teilen.js        # Liste der offenen Beträge
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

**`rollen.js`** legt Trainer und Betreuer an, prüft die Gruppierung und die
Zählung im Kader, ändert eine Rolle nachträglich und sieht nach, ob die Person
in die andere Gruppe wandert. Außerdem: Daten ohne Rollenangabe erscheinen als
Spieler, und der Sammelbeitrag trifft nur die gewählte Gruppe.

**`teilen.js`** prüft die Liste für die Mannschaftsgruppe: dass der Trainer
ab Werk fehlt und sich dazuschalten lässt, dass Buchungen ohne Person und
bereits bezahlte Posten draußen bleiben, dass bei Teilzahlungen nur der Rest
erscheint, dass die Gesamtsumme stimmt, dass der Text in der Zwischenablage
landet und dass im Druck nur das Dokument übrig bleibt. Dazu die Unterteilung:
Strafen und Beiträge stehen bei jeder Person in eigenen Spalten, leere Spalten
fallen weg und die Spaltensummen ergeben zusammen die Gesamtsumme. Und das
Aussehen des Blattes: hell bis auf den Briefkopf, der über die volle
Blattbreite läuft, dabei links wie rechts um genau 15 mm über den
Satzspiegel ragt und dessen Text mit der Tabelle fluchtet. Keine Schrift ist
so hell, dass sie auf Weiß untergeht — die Klasse `.pos` der Oberfläche
hatte genau das einmal ins Blatt getragen.

Zuletzt wird das fertige PDF auseinandergenommen: Seitengröße ISO A4 hoch
(210 × 297 mm, 0,2 mm Spielraum für Chromes Rundung), eine kurze Liste auf
genau einer Seite, kein Rand und keine feste Höhe am `body`, eine
Summenzeile, die sich nicht auf jeder Seite wiederholt — und die
Zeichenbefehle selbst: Die Inhaltsströme werden entpackt und jede
Flächenfüllung nachgesehen. Keine Fläche, die mehr als ein halbes Blatt
bedeckt, darf etwas anderes als Weiß sein. Nimmt man `color-scheme: light`
aus dem Stylesheet, meldet der Test „794x1123 rgb 0.0706,0.0706,0.0706" —
genau das schwarze Papier, das im Betrachter als Rahmen zu sehen war.

Die Tests sind so gebaut, dass sie gegen fehlerhafte Fassungen durchfallen —
gegen den Stand vor der Prüfung vom August 2026 melden sie acht Abweichungen.
