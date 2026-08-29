const fs=require('fs');
const src=fs.readFileSync('/home/user/public-apis/mannschaftskasse/app.js','utf8');
// Die drei Funktionen exakt so herausziehen, wie sie in der App laufen.
const hol=(name)=>{const i=src.indexOf('function '+name+'(');
  let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
eval(hol('pad')); eval(hol('parseAmount')); eval(hol('centsToInput'));

const faelle=[
  ['12,50',1250],['12.50',1250],['0,05',5],['5',500],['5,',500],[',50',50],
  ['1.234,56',123456],['1234,56',123456],['1.234',123400],['12.345,67',1234567],
  ['1.234.567,89',123456789],['12,5',1250],['  9,99 €',999],['€ 3,00',300],
  ['0',0],['0,00',0],['100',10000],['1.000',100000],['0,1',10],
];
let fehler=0;
console.log('=== Eingabe -> Cent ===');
faelle.forEach(([ein,soll])=>{const ist=parseAmount(ein);const ok=ist===soll;if(!ok)fehler++;
  console.log((ok?'  OK  ':'  FEHLER ')+JSON.stringify(ein).padEnd(16)+' -> '+String(ist).padStart(10)+'  erwartet '+soll);});

console.log('=== Ungültige Eingaben ergeben NaN ===');
[['',NaN],['abc',NaN],[null,NaN],[',',NaN],['€',NaN]].forEach(([ein])=>{
  const ist=parseAmount(ein);const ok=Number.isNaN(ist);if(!ok)fehler++;
  console.log((ok?'  OK  ':'  FEHLER ')+JSON.stringify(ein).padEnd(16)+' -> '+ist);});

console.log('=== Hin und zurück: Cent -> Feld -> Cent (0 bis 2.000.000 Cent) ===');
let rt=0;
for(let c=0;c<=2000000;c+=7){ if(parseAmount(centsToInput(c))!==c){rt++;if(rt<4)console.log('  FEHLER bei',c,'->',centsToInput(c),'->',parseAmount(centsToInput(c)));}}
console.log(rt===0?'  OK   alle 285.715 Werte kehren exakt zurück':'  FEHLER '+rt+' Abweichungen');
fehler+=rt;

console.log('=== Kein Gleitkomma-Drift bei krummen Beträgen ===');
[['0,07',7],['0,29',29],['1,15',115],['8,35',835],['12,35',1235],['1234,56',123456],['99999,99',9999999]]
 .forEach(([ein,soll])=>{const ist=parseAmount(ein);const ok=ist===soll;if(!ok)fehler++;
  console.log((ok?'  OK  ':'  FEHLER ')+ein.padEnd(12)+' -> '+ist+'  (alte Rechnung: Math.round('+ein.replace(',','.')+'*100) = '+Math.round(parseFloat(ein.replace(',','.'))*100)+')');});

console.log(fehler===0?'\nBETRAGSERKENNUNG EXAKT':'\n'+fehler+' FEHLER');
process.exit(fehler?1:0);
