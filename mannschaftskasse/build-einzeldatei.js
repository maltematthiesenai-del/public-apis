#!/usr/bin/env node
/* Baut aus den Projektdateien eine einzige, in sich geschlossene HTML-Datei.
   Praktisch zum Weitergeben: herunterladen, doppelklicken, fertig.

   Aufruf:  node build-einzeldatei.js [zieldatei]
*/

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const out = process.argv[2] || path.join(DIR, 'mannschaftskasse-app.html');

const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

const css = read('styles.css');
const js = read('app.js');
const iconData = 'data:image/svg+xml;base64,' + Buffer.from(read('icon.svg'), 'utf8').toString('base64');

let html = read('index.html');

// Ersetzt wird über eine Funktion: in einem Ersetzungs-String hätte JavaScript
// Muster wie `$$` oder `$&` ausgewertet und damit den eingebetteten Code verfälscht.
const inline = (needle, replacement) => {
  if (html.indexOf(needle) < 0) throw new Error('Nicht gefunden in index.html: ' + needle);
  html = html.replace(needle, () => replacement);
};

// Stylesheet einbetten
inline('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>');

// Skript einbetten
inline('<script src="app.js"></script>', '<script>\n' + js + '\n</script>');

// Manifest und Service Worker gibt es in der Einzeldatei nicht.
html = html.split('<link rel="manifest" href="manifest.webmanifest">\n').join('');

// Icons als Daten-URI
html = html.split('href="icon.svg"').join('href="' + iconData + '"');

fs.writeFileSync(out, html);
console.log('Geschrieben: ' + out + '  (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
