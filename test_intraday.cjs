const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const ctx=vm.createContext({finite:Number.isFinite});
vm.runInContext(fs.readFileSync('dist/market.js','utf8'),ctx);
const {stepPaper,book}=vm.runInContext('({stepPaper,book:newPaperBook()})',ctx);
const o={status:'Pending',id:'1',strategy:'timing',ticker:'T',symbol:'T',run:'r',side:'Buy',currency:'USD',euros:100,
  entryPolicy:'fundamental-and-technical-v1',entryMarket:'UPTREND',
  inputs:{signalExpiry:'1970-01-02',signal:'Buy',fundamental:8,opportunity:7.5,status:'AVAILABLE',
    trend:'ABOVE_SMA200',close:10,sma36:9,sma50:8,sma200:7,extension_atr:1},expires:'1970-01-02',submitted:'1970-01-01T00:01Z'};
const s={current:'r',builds:{r:{}},paper:{orders:[o]},commit:'abc'};
const q={start:1000,end:5000,at:2000,price:10,currency:'USD'};
const sample={sampled:2000,snapshot:'r',quotes:{T:q,'EURUSD=X':{...q,price:2}}};
for (const patch of [
  {entryPolicy:undefined}, {strategy:'fundamental'}, {strategy:'opportunity'}, {entryMarket:'CORRECTION'},
  {inputs:{...o.inputs,fundamental:6.9}}, {inputs:{...o.inputs,sma50:11}},
  {inputs:{...o.inputs,sma36:null}}, {inputs:{...o.inputs,signal:'Hold Positive'}},
]) {
  const blocked={...s,paper:{orders:[{...o,...patch}]}};
  stepPaper(book,blocked,sample,1999);
  stepPaper(book,blocked,sample,2000);
  assert.equal(Object.keys(book.fills).length,0);
  assert.equal(Object.keys(book.armed).length,0);
}
stepPaper(book,s,sample,2000);
assert.equal(Object.keys(book.fills).length,0);
q.at=2001;
for(const override of [{snapshot:'missing'},{sampled:1600},{quotes:{T:q}},{quotes:{...sample.quotes,T:{...q,end:2000}}}]){
  stepPaper(book,s,{...sample,...override},2001);assert.equal(Object.keys(book.fills).length,0);
}
stepPaper(book,s,sample,2001);stepPaper(book,s,sample,2002);
assert.equal(Object.keys(book.fills).length,1);assert.equal(book.accounts.timing.holdings.T.shares,20);
o.side='Sell';o.inputs.signalExpiry=null;stepPaper(book,s,sample,2003);q.at=2004;q.price=12;stepPaper(book,s,sample,2004);
assert.equal(Object.keys(book.fills).length,2);assert.ok(Math.abs(book.accounts.timing.cash-10019.78)<1e-8);
console.log('Forward fills, freshness, FX, hours, snapshot binding, idempotence, fees and exit passed.');
const isMarketTrend = vm.runInContext('isMarketTrend', ctx);
const breadth = [{pct200:50, pct50:60}, {pct200:52, pct50:62}];
const trend = {schema:'market-trend-v1', as_of:'2026-11-20', breadth, new_uptrends:[], leaders:[]};
assert.ok(isMarketTrend(trend));
assert.ok(!isMarketTrend({...trend, breadth:[null, breadth[1]]}));
assert.ok(!isMarketTrend({...trend, breadth:[{pct50:105, pct200:10}, breadth[1]]}));
assert.ok(!isMarketTrend({...trend, leaders:[{ticker:'X', name:42}]}));

const returnTable = vm.runInContext('openReturnTable',ctx);
Object.assign(ctx, {esc:String,badge:text=>text,cells:(headers,rows)=>JSON.stringify({headers,rows})});
const opened_on='2026-11-23', marked_on='2026-11-24';
const long={side:'LONG',opened_on,marked_on,entry_close:100,mark_close:95,marked_notional:475,net_return_pct:-5.1};
const short={...long,side:'SHORT',net_return_pct:4.89};
const tableFor=(positions,base=500,lang='en')=>returnTable({parameters:{position_usd:base},paper:{positions,last:marked_on}},lang);
const columns=output=>JSON.parse(output.split('<div')[0]);
assert.deepEqual(columns(tableFor({L:long,S:short})).rows.map(row=>row.slice(0,5)),[
  ['L','LONG','-5.10%','-5.00%',marked_on], ['S','SHORT','+4.89%','+5.00%',marked_on]
]);
assert.match(tableFor({S:{...short,marked_notional:525,net_return_pct:-5.11}}),/-5.11%.*-5.00%/);
assert.match(tableFor({L:{...long,marked_notional:500,net_return_pct:-.1}}),/-0.10%.*0.00%/);
assert.match(tableFor({L:{...long,marked_on:opened_on}}),/Earlier close/);
assert.deepEqual(columns(tableFor({L:{...long,marked_notional:null}})).rows[0].slice(2,4),['—','—']);
assert.deepEqual(columns(tableFor({S:{...short,net_return_pct:undefined}})).rows[0].slice(2,4),['—','+5.00%']);
assert.deepEqual(columns(tableFor({},500,'es')).headers.slice(2,4),['Neto %','Bruto %']);
assert.deepEqual(columns(tableFor({},500,'de')).headers.slice(2,4),['Netto %','Brutto %']);
