const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const ctx=vm.createContext({finite:Number.isFinite});
vm.runInContext(fs.readFileSync('dist/market.js','utf8'),ctx);
const {stepPaper,book}=vm.runInContext('({stepPaper,book:newPaperBook()})',ctx);
const o={status:'Pending',id:'1',strategy:'timing',ticker:'T',symbol:'T',run:'r',side:'Buy',currency:'USD',euros:100,
  inputs:{signalExpiry:'1970-01-02'},expires:'1970-01-02',submitted:'1970-01-01T00:01Z'};
const s={current:'r',builds:{r:{}},paper:{orders:[o]},commit:'abc'};
const q={start:1000,end:5000,at:2000,price:10,currency:'USD'};
const sample={sampled:2000,snapshot:'r',quotes:{T:q,'EURUSD=X':{...q,price:2}}};
stepPaper(book,s,sample,2000);
assert.equal(Object.keys(book.fills).length,0);
q.at=2001;
for(const override of [{snapshot:'missing'},{sampled:1600},{quotes:{T:q}},{quotes:{...sample.quotes,T:{...q,end:2000}}}]){
  stepPaper(book,s,{...sample,...override},2001);assert.equal(Object.keys(book.fills).length,0);
}
stepPaper(book,s,sample,2001);stepPaper(book,s,sample,2002);
assert.equal(Object.keys(book.fills).length,1);assert.equal(book.accounts.timing.holdings.T.shares,20);
o.side='Sell';stepPaper(book,s,sample,2003);q.at=2004;q.price=12;stepPaper(book,s,sample,2004);
assert.equal(Object.keys(book.fills).length,2);assert.ok(Math.abs(book.accounts.timing.cash-10019.78)<1e-8);
console.log('Forward fills, freshness, FX, hours, snapshot binding, idempotence, fees and exit passed.');
