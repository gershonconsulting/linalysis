// v0.3.5 — SSI industry/network rank reader. Fixtures are the real rank blocks captured from the
// German (david.liese12, 2026-10-12) and French (zeitount, 2026-10-13) Sales Navigator pages, plus
// the English one (abougel, 2026-10-13). Before 0.3.5 the DE/FR pages lost the industry rank and
// stored the INDUSTRY percentile as the network rank.
//   node test/ssi-ranks.test.js
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, '..', 'content-ssi.js'), 'utf8');
const tail = src.lastIndexOf('})();');
src = 'var document={documentElement:{getAttribute:function(){return null}}},navigator={language:"en"},location={pathname:"/sales/ssi",href:""};'
    + 'var chrome={runtime:{sendMessage:function(){return Promise.resolve({})},onMessage:{addListener:function(){}}}};'
    + 'var setTimeout=function(){};var window={};'
    + src.slice(0, tail) + ' window.__T={ranksFromLines:ranksFromLines,pctAfterLabel:pctAfterLabel,labels:labels}; })(); window;';
const win = eval(src);
const T = win.__T;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}
const IND = ['Branche', 'Branchenrang', 'secteur', 'sector', 'settore', 'setor', 'industry', 'branche'];
const NET = ['Netzwerk', 'réseau', 'rete', 'rede', 'netwerk', 'network', 'red'];

const DE = `Ihr Social Selling Index
Ihr Ranking
SSI-Ranking des Teams
1 von 1
SSI-Ranking der Branche
Top 3 %
SSI-Ranking des Netzwerks
Top 12 %
Aktueller Social Selling Index
Chart`;
const FR = `Votre Social Selling Index
Votre classement
Classement SSI Équipes
1 sur 1
Classement SSI Secteurs
Top 1%
Classement SSI Réseaux
Top 6%
Social Selling Index actuel`;
const EN = `Your Social Selling Index
How you rank
Team SSI rank
13 of 163
Industry SSI rank
Top 2%
Network SSI rank
Top 6%
Current Social Selling Index`;
// Hypothetical number-BEFORE layout must still resolve without swapping values.
const BEFORE = `Top 14 %
Branchenrang
Top 7 %
Netzwerkrang
Aktueller Social Selling Index`;

let r = T.ranksFromLines(DE, IND, NET); eq('DE industry', r.industry, 3); eq('DE network', r.network, 12);
r = T.ranksFromLines(FR, IND, NET);     eq('FR industry', r.industry, 1); eq('FR network', r.network, 6);
r = T.ranksFromLines(EN, IND, NET);     eq('EN industry', r.industry, 2); eq('EN network', r.network, 6);
r = T.ranksFromLines(BEFORE, IND, NET); eq('before-layout industry', r.industry, 14); eq('before-layout network', r.network, 7);
r = T.ranksFromLines('Nothing here\nChart', IND, NET); eq('empty -> null', r.industry, null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
