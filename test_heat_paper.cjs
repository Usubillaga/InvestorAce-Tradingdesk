const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./dist/heat-paper-model.js');

const buy = {side:'BUY', signal_day:'2026-11-20',heat:15.4,submitted:'2026-11-23T17:57:19Z',
  target:'2026-11-23',leaders:[{symbol:'AAPL'},{symbol:'AAPL'},{symbol:'GS'}]};
const legs = [['leader','AAPL',2],['etf','SPY',3],['leader','AAPL',2],['leader','GS',2]]
  .map(([side,symbol,entry_units]) => ({side,symbol,entry_units,entry_price:10,value:entry_units*11}));
const trade = {entry:'2026-11-23',order:buy,legs};

test('overlapping sleeves aggregate by security, preserving units, costs and account value', () => {
  const view=model.original({initial:100,cash:0,equity:66,benchmark:60,as_of:trade.entry,history:[],position:trade});
  assert.equal(view.holdings.length,2);
  assert.deepEqual(view.holdings.map(h=>h.symbol),['AAPL','GS']);
  assert.equal(view.holdings[0].units,4);
  assert.equal(view.holdings[0].cost,40*1.001);
  assert.equal(view.holdings.reduce((sum,h)=>sum+h.value,0),view.nav);
  assert.deepEqual(model.audit(view.events[0]).symbols,['AAPL','GS']);
  assert.equal(model.audit(view.events[0]).dayOfSignal,'2026-11-20');
});

test('older closing or missing readings cannot suppress a later actual observation', () => {
  const earlier={as_of:'2026-11-23T23:40:00Z',heat:50};
  const newest={as_of:'2026-11-24T11:40:00-05:00',heat:27};
  assert.equal(model.latestReading({monitor:earlier,intraday_monitor:newest},{monitor:null}),newest);
  assert.equal(model.latestReading({monitor:newest},{monitor:{as_of:'2026-11-25',heat:null}}),newest);
  assert.equal(model.latestReading(null,null),null);
});

test('cash accounts have no positions, carry independent controls and preserve an unfilled order', () => {
  const pending={side:'BUY',target:trade.entry,signal:{day:trade.entry,heat:16,as_of:'2026-11-23T17:20Z',url:'https://example.test'},
    submitted:'2026-11-23T17:22Z',picks:[{symbol:'AAPL'}]};
  const book={cash:10000,nav:10000,pending,holdings:[],events:[],controls:{SPY:10000,QQQ:10000}};
  const view=model.concentrated({books:{5:book},as_of:'2026-11-20',started:'2026-11-23T15:00Z'},5);
  assert.equal(view.holdings.length,0);
  assert.equal(view.events.length,0);
  assert.equal(view.pending,pending);
  assert.equal(view.initial,10000);
  assert.equal(model.audit({day:trade.entry,status:'BUY',order:pending}).signalTime,pending.signal.as_of);
});

test('closed legacy trades retain distinct buy and sell records and remove benchmark legs', () => {
  const sell={side:'SELL',signal_day:'2026-12-10',heat:81,target:'2026-12-11',submitted:'2026-12-10T23:10:00Z'};
  const view=model.original({initial:100,cash:62,equity:62,benchmark:65,as_of:sell.target,
    history:[{entry:trade.entry,buy,exit:sell.target,sell,legs}],position:null});
  assert.deepEqual(view.events.map(e=>e.status),['bought','sold']);
  assert.deepEqual(model.audit(view.events[1]).symbols,['AAPL','GS']);
  assert.equal(view.holdings.length,0);
});
