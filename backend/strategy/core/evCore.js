// backend/strategy/core/evCore.js
// 🔒 LOCKED — CORE EV ENGINE
// Ultimate X EV math (validated)
// DO NOT MODIFY — create evCore_v2.js if needed

import { evaluateHand } from "../handEvaluator.js";

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];

const FULL_DECK = [];
for (const r of RANKS) for (const s of SUITS) FULL_DECK.push({ rank:r, suit:s });

function cardKey(c){ return c.rank + c.suit; }

function buildDeck(exclude){
  const used = new Set(exclude.map(cardKey));
  return FULL_DECK.filter(c => !used.has(cardKey(c)));
}

function combinations(arr, k, fn){
  const n = arr.length;
  const idx = Array.from({length:k},(_,i)=>i);
  while(true){
    fn(idx.map(i=>arr[i]));
    let i=k-1;
    while(i>=0 && idx[i]===i+n-k) i--;
    if(i<0) break;
    idx[i]++;
    for(let j=i+1;j<k;j++) idx[j]=idx[j-1]+1;
  }
}

function qualifies(result){
  return [
    "jacks_or_better","two_pair","three_kind",
    "straight","flush","full_house",
    "four_kind","straight_flush","royal_flush",
    "four_aces","four_234"
  ].includes(result.type);
}

function evalPayout(cards, paytable, multiplier, baseEV){
  const r = evaluateHand(cards);
  if(!r || !r.payout) return { cash:0, future:0 };

  const pay = paytable?.payouts?.[r.payout] ?? 0;

  return {
    cash: pay * multiplier,
    future: qualifies(r) ? baseEV : 0
  };
}

export function evaluateAllHolds(hand, paytable, multiplier){
  const baseEV = Number(paytable?.baseEV ?? 0) || 0;
  const results = [];

  for(let mask=0;mask<32;mask++){
    const holdMask=[0,1,2,3,4].map(i=>Boolean(mask&(1<<i)));
    const held=hand.filter((_,i)=>holdMask[i]);
    const drawCount=5-held.length;
    const deck=buildDeck(hand);

    let cash=0,future=0,count=0;

    if(drawCount===0){
      const r=evalPayout(held,paytable,multiplier,baseEV);
      results.push({
        holdMask,
        evUX:r.cash+r.future,
        evBase: multiplier ? (r.cash/multiplier) : r.cash,
        heldCount:held.length
      });
      continue;
    }

    if(drawCount<=2){
      combinations(deck,drawCount,draw=>{
        const r=evalPayout(held.concat(draw),paytable,multiplier,baseEV);
        cash+=r.cash; future+=r.future; count++;
      });
    } else {
      const SAMPLES = drawCount===3?20000:drawCount===4?15000:10000;
      const d=deck.slice();
      for(let t=0;t<SAMPLES;t++){
        for(let i=0;i<drawCount;i++){
          const j=i+((Math.random()*(d.length-i))|0);
          [d[i],d[j]]=[d[j],d[i]];
        }
        const r=evalPayout(held.concat(d.slice(0,drawCount)),paytable,multiplier,baseEV);
        cash+=r.cash; future+=r.future; count++;
      }
    }

    results.push({
      holdMask,
      evUX:(cash+future)/count,
      evBase: multiplier ? ((cash/multiplier)/count) : (cash/count),
      heldCount:held.length
    });
  }

  return results;
}
