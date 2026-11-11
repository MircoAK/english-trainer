// Testet die reine Logik aus app.js mit Browser-Attrappen
const fs=require('fs');let src=fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
src=src.replace(/\nhome\(\);\s*$/,'\n');
const store={};global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v}};
global.document={addEventListener(){},visibilityState:'visible',querySelector:()=>({replaceChildren(){}}),createElement:()=>({append(){},setAttribute(){},classList:{toggle(){}}})};
global.window={scrollTo(){}};global.speechSynthesis={cancel(){}};global.location={hostname:'x',origin:'o'};global.navigator={};
const f=new Function(src+';return {S,streak,saveChunks,matches,fixDeck,mark,today,inDays}');
const m=f();const assert=require('assert');
// matches
assert(m.matches('We could reduce ... if you ...','We could reduce the price if you order more'));
assert(!m.matches('We could reduce ... if you ...','I like pizza'));
assert(m.matches('Could we agree on ...?','could we agree on a date'));
// fixDeck verwirft Defekte, behält Gültige
const d=m.fixDeck([{de:'a',en:'b'},{x:1},null,{de:'c',en:'d',box:3,due:'2026-01-01'}]);assert.equal(d.length,2);assert.equal(d[0].box,0);assert.equal(d[1].box,3);
assert.deepEqual(m.fixDeck({}),[]);
// saveChunks: Duplikate, Tageslimit 4 sofort fällig
m.S.deck=[];let n=0;
for(let i=0;i<6;i++) n+=m.saveChunks([{de:'s'+i,en:'e'+i}]);
assert.equal(n,6);assert.equal(m.S.deck.filter(c=>c.due===m.today()).length,4);assert.equal(m.S.deck.filter(c=>c.due===m.inDays(1)).length,2);
assert.equal(m.saveChunks([{de:'s0',en:'e0'}]),0);
assert.equal(m.saveChunks([{de:'',en:'x'}]),0);
// defekter Speicher: App startet trotzdem
store.bt='{kaputt';const g=new Function(src+';return S');assert(Array.isArray(g().deck));
// Zahlen müssen stimmen, Apostrophe/Zahlwörter werden vereinheitlicht
assert(!m.matches('We need 50 percent upfront','We need 15 percent upfront'));
assert(m.matches('We need 50 percent upfront','we need fifty percent upfront'));
assert(m.matches("I'm happy to do that","I’m happy to do that"));
// Tageslimit streng: nie mehr als 4 neue Karten (Stufe 0) pro Fälligkeitstag
m.S.deck=[];for(let i=0;i<10;i++)m.saveChunks([{de:'q'+i,en:'w'+i}]);
const per={};m.S.deck.forEach(c=>per[c.due]=(per[c.due]||0)+1);assert(Object.values(per).every(v=>v<=4),JSON.stringify(per));
// fixDeck klemmt Stufen
assert.equal(m.fixDeck([{de:'a',en:'b',box:-5}])[0].box,0);assert.equal(m.fixDeck([{de:'a',en:'b',box:99}])[0].box,6);
// defekter Typ für bridge/token
store.bt=JSON.stringify({bridge:{x:1},token:5});assert.equal(new Function(src+';return S')().bridge,'');
console.log('LOGIC_OK');
