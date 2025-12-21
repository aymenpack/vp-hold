export const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
export const SUITS = ["S","H","D","C"];

export function rv(r){
  if(r==="A") return 14;
  if(r==="K") return 13;
  if(r==="Q") return 12;
  if(r==="J") return 11;
  if(r==="T") return 10;
  return parseInt(r,10);
}

export function uniqSorted(vals){
  return [...new Set(vals)].sort((a,b)=>a-b);
}

export function isFlush(hand){
  return new Set(hand.map(c=>c.suit)).size===1;
}

export function isStraight(hand){
  const v = uniqSorted(hand.map(c=>rv(c.rank)));
  if(v.length!==5) return false;
  if(v.join(",")==="2,3,4,5,14") return true;
  return v[4]-v[0]===4;
}

export function countRanks(hand){
  const m={};
  hand.forEach(c=>m[c.rank]=(m[c.rank]||0)+1);
  return m;
}

export function buildDeck(exclude){
  const used=new Set(exclude.map(c=>c.rank+c.suit));
  const deck=[];
  for(const r of RANKS){
    for(const s of SUITS){
      if(!used.has(r+s)) deck.push({rank:r,suit:s});
    }
  }
  return deck;
}

export function comboIter(arr,k,fn){
  if(k===0){ fn([]); return; }
  const n=arr.length;
  const idx=Array.from({length:k},(_,i)=>i);
  while(true){
    fn(idx.map(i=>arr[i]));
    let i=k-1;
    while(i>=0 && idx[i]===i+n-k) i--;
    if(i<0) break;
    idx[i]++;
    for(let j=i+1;j<k;j++) idx[j]=idx[j-1]+1;
  }
}
