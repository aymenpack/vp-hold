/* =========================================================
   PRACTICE MODE — CLIENT-SIDE ONLY
   No backend, no vision, no camera
   GitHub Pages safe
   ========================================================= */

/* -------------------------
   CONSTANTS
------------------------- */

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];
const SUIT_SYMBOL = { S:"♠", H:"♥", D:"♦", C:"♣" };

/* -------------------------
   PAYTABLES (DDB)
------------------------- */

const PAYTABLES = {
  DDB_9_6: {
    name: "Double Double Bonus 9/6",
    baseEV: 0.9861,
    payouts: {
      royal_flush: 800,
      straight_flush: 50,
      four_aces_234_kicker: 400,
      four_aces_other: 160,
      four_234_ace_kicker: 160,
      four_234_other: 80,
      four_5k: 50,
      full_house: 9,
      flush: 6,
      straight: 4,
      three_kind: 3,
      two_pair: 1,
      jacks_or_better: 1
    }
  },
  DDB_9_5: {
    name: "Double Double Bonus 9/5",
    baseEV: 0.9836,
    payouts: {
      royal_flush: 800,
      straight_flush: 50,
      four_aces_234_kicker: 400,
      four_aces_other: 160,
      four_234_ace_kicker: 160,
      four_234_other: 80,
      four_5k: 50,
      full_house: 9,
      flush: 5,
      straight: 4,
      three_kind: 3,
      two_pair: 1,
      jacks_or_better: 1
    }
  },
  DDB_8_5: {
    name: "Double Double Bonus 8/5",
    baseEV: 0.9723,
    payouts: {
      royal_flush: 800,
      straight_flush: 50,
      four_aces_234_kicker: 400,
      four_aces_other: 160,
      four_234_ace_kicker: 160,
      four_234_other: 80,
      four_5k: 50,
      full_house: 8,
      flush: 5,
      straight: 4,
      three_kind: 3,
      two_pair: 1,
      jacks_or_better: 1
    }
  },
  DDB_7_5: {
    name: "Double Double Bonus 7/5",
    baseEV: 0.9610,
    payouts: {
      royal_flush: 800,
      straight_flush: 50,
      four_aces_234_kicker: 400,
      four_aces_other: 160,
      four_234_ace_kicker: 160,
      four_234_other: 80,
      four_5k: 50,
      full_house: 7,
      flush: 5,
      straight: 4,
      three_kind: 3,
      two_pair: 1,
      jacks_or_better: 1
    }
  }
};

/* -------------------------
   HAND EVALUATOR
------------------------- */

function countBy(arr){
  return arr.reduce((m,v)=>{
    m[v]=(m[v]||0)+1;
    return m;
  },{});
}

function rankValue(r){ return RANKS.indexOf(r); }

function evaluateHand(cards){
  const ranks = cards.map(c=>c.rank);
  const suits = cards.map(c=>c.suit);
  const rc = countBy(ranks);
  const sc = countBy(suits);
  const counts = Object.values(rc).sort((a,b)=>b-a);
  const unique = Object.keys(rc);

  const isFlush = Object.values(sc).some(v=>v===5);
  const vals = [...new Set(ranks.map(rankValue))].sort((a,b)=>a-b);
  const isWheel = JSON.stringify(vals) === JSON.stringify([0,1,2,3,12]);
  const isStraight = vals.length===5 && (vals[4]-vals[0]===4 || isWheel);

  if(isFlush && isStraight){
    if(ranks.includes("A") && ranks.includes("T")){
      return { payout:"royal_flush", type:"royal_flush" };
    }
    return { payout:"straight_flush", type:"straight_flush" };
  }

  if(counts[0]===4){
    const quad = unique.find(r=>rc[r]===4);
    const kicker = unique.find(r=>rc[r]===1);
    if(quad==="A"){
      return ["2","3","4"].includes(kicker)
        ? { payout:"four_aces_234_kicker", type:"four_kind" }
        : { payout:"four_aces_other", type:"four_kind" };
    }
    if(["2","3","4"].includes(quad)){
      return ["A","2","3","4"].includes(kicker)
        ? { payout:"four_234_ace_kicker", type:"four_kind" }
        : { payout:"four_234_other", type:"four_kind" };
    }
    return { payout:"four_5k", type:"four_kind" };
  }

  if(counts[0]===3 && counts[1]===2) return { payout:"full_house", type:"full_house" };
  if(isFlush) return { payout:"flush", type:"flush" };
  if(isStraight) return { payout:"straight", type:"straight" };
  if(counts[0]===3) return { payout:"three_kind", type:"three_kind" };
  if(counts[0]===2 && counts[1]===2) return { payout:"two_pair", type:"two_pair" };

  if(counts[0]===2){
    const pair = unique.find(r=>rc[r]===2);
    if(["J","Q","K","A"].includes(pair)){
      return { payout:"jacks_or_better", type:"jacks_or_better" };
    }
  }

  return { payout:null, type:"nothing" };
}

/* -------------------------
   PRACTICE GAME LOGIC
------------------------- */

function randomHand(){
  const deck=[];
  for(const r of RANKS) for(const s of SUITS) deck.push({rank:r,suit:s});
  deck.sort(()=>Math.random()-0.5);
  return deck.slice(0,5);
}

/* -------------------------
   UI
------------------------- */

const cardsEl = document.getElementById("cards");
const resultEl = document.getElementById("result");
const paytableEl = document.getElementById("paytable");
const modeEl = document.getElementById("mode");
const checkBtn = document.getElementById("checkBtn");

let hand
