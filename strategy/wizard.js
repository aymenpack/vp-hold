import { BASE_PAY_65, AWARD_MULT_3PLAY, UXP_ROYAL } from "./paytables.js";
import {
  rv, uniqSorted, isFlush, isStraight,
  countRanks, buildDeck, comboIter
} from "./ev.js";

// Wizard adjusted win formula
function adjustedWin(cat, progressive=false){
  const base = (cat==="RF" && progressive) ? UXP_ROYAL : BASE_PAY_65[cat];
  return 2*base + AWARD_MULT_3PLAY[cat] - 1;
}

function classify(hand){
  const vals = uniqSorted(hand.map(c=>rv(c.rank)));
  const flush = isFlush(hand);
  const straight = isStraight(hand);
  const royal = vals.join(",")==="10,11,12,13,14";
  const freq = Object.values(countRanks(hand)).sort((a,b)=>b-a);
  const counts = countRanks(hand);

  if(straight && flush && royal) return "RF";
  if(straight && flush) return "SF";
  if(freq[0]===4){
    const r = Object.keys(counts).find(k=>counts[k]===4);
    if(r==="A") return "K4A";
    const v=rv(r);
    if(v>=2 && v<=4) return "K42_4";
    return "K45K";
  }
  if(freq[0]===3 && freq[1]===2) return "FH";
  if(flush) return "FL";
  if(straight) return "ST";
  if(freq[0]===3) return "K3";
  if(freq[0]===2 && freq[1]===2) return "TP";
  if(freq[0]===2){
    const p = Object.keys(counts).find(k=>counts[k]===2);
    if(rv(p)>=11) return "JOB";
  }
  return "N";
}

function evForHold(cards, hold, progressive){
  const kept = cards.filter((_,i)=>hold[i]);
  const need = 5-kept.length;
  const deck = buildDeck(cards);
  let total=0,count=0;

  const payoff = h => adjustedWin(classify(h), progressive);

  if(need<=2){
    comboIter(deck, need, d=>{
      total+=payoff(kept.concat(d));
      count++;
    });
    return total/count;
  }

  // bounded Monte Carlo
  const S = need===3?6000:need===4?4000:2500;
  const d=deck.slice();
  for(let t=0;t<S;t++){
    for(let i=0;i<need;i++){
      const j=i+((Math.random()*(d.length-i))|0);
      [d[i],d[j]]=[d[j],d[i]];
    }
    total+=payoff(kept.concat(d.slice(0,need)));
  }
  return total/S;
}

export function wizardBestHold(cards, totalMultiplier, progressive=false){
  let bestEV=-1e9,bestMask=0;
  for(let mask=0;mask<32;mask++){
    const hold=[0,1,2,3,4].map(i=>!!(mask&(1<<i)));
    const ev=evForHold(cards, hold, progressive);
    if(ev>bestEV){ bestEV=ev; bestMask=mask; }
  }
  return {
    hold:[0,1,2,3,4].map(i=>!!(bestMask&(1<<i))),
    ev_single:bestEV,
    ev_total:bestEV*totalMultiplier
  };
}
