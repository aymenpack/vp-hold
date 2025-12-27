/* =========================================
   PRACTICE MODE — EXACT DDB MATH
   Single-hand EV (no Ultimate X yet)
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {

  /* ---------- constants ---------- */

  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT_SYMBOL = { S:"♠", H:"♥", D:"♦", C:"♣" };

  /* ---------- DDB PAYTABLES ---------- */

  const PAYTABLES = {
    DDB_9_6: {
      full_house: 9,
      flush: 6
    },
    DDB_9_5: {
      full_house: 9,
      flush: 5
    },
    DDB_8_5: {
      full_house: 8,
      flush: 5
    },
    DDB_7_5: {
      full_house: 7,
      flush: 5
    }
  };

  /* ---------- DOM ---------- */

  const cardsBox   = document.getElementById("cardsBox");
  const optimalBox = document.getElementById("optimalBox");
  const resultBox  = document.getElementById("resultBox");
  const checkBtn   = document.getElementById("checkBtn");
  const nextBtn    = document.getElementById("nextBtn");
  const paytableEl = document.getElementById("paytable");

  /* ---------- state ---------- */

  let hand = [];
  let held = [false,false,false,false,false];

  /* ---------- utils ---------- */

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }

  function dealHand(){
    const deck=[];
    for(const r of RANKS){
      for(const s of SUITS){
        deck.push({rank:r,suit:s});
      }
    }
    return shuffle(deck).slice(0,5);
  }

  function countBy(arr){
    return arr.reduce((m,v)=>(m[v]=(m[v]||0)+1,m),{});
  }

  function rankValue(r){ return RANKS.indexOf(r); }

  /* ---------- EXACT DDB HAND EVALUATOR ---------- */

  function evaluateDDB(cards){
    const ranks = cards.map(c=>c.rank);
    const suits = cards.map(c=>c.suit);
    const rc = countBy(ranks);
    const sc = countBy(suits);

    const counts = Object.values(rc).sort((a,b)=>b-a);
    const unique = Object.keys(rc);

    const isFlush = Object.values(sc).some(v=>v===5);
    const vals = [...new Set(ranks.map(rankValue))].sort((a,b)=>a-b);
    const isWheel = JSON.stringify(vals)==='[0,1,2,3,12]';
    const isStraight = vals.length===5 && (vals[4]-vals[0]===4 || isWheel);

    /* Royal / Straight Flush */
    if(isFlush && isStraight){
      if(ranks.includes("A") && ranks.includes("T")) return {type:"royal_flush", payout:800};
      return {type:"straight_flush", payout:50};
    }

    /* Four of a kind */
    if(counts[0]===4){
      const quad = unique.find(r=>rc[r]===4);
      const kicker = unique.find(r=>rc[r]===1);

      if(quad==="A"){
        return ["2","3","4"].includes(kicker)
          ? {type:"four_aces_234_kicker", payout:400}
          : {type:"four_aces_other", payout:160};
      }

      if(["2","3","4"].includes(quad)){
        return ["A","2","3","4"].includes(kicker)
          ? {type:"four_234_ace_kicker", payout:160}
          : {type:"four_234_other", payout:80};
      }

      return {type:"four_5k", payout:50};
    }

    /* Full house */
    if(counts[0]===3 && counts[1]===2){
      return {type:"full_house"};
    }

    if(isFlush) return {type:"flush"};
    if(isStraight) return {type:"straight", payout:4};
    if(counts[0]===3) return {type:"three_kind", payout:3};
    if(counts[0]===2 && counts[1]===2) return {type:"two_pair", payout:1};

    if(counts[0]===2){
      const pair = unique.find(r=>rc[r]===2);
      if(["J","Q","K","A"].includes(pair)){
        return {type:"jacks_or_better", payout:1};
      }
    }

    return {type:"nothing", payout:0};
  }

  /* ---------- EV SIMULATION ---------- */

  function simulateEV(mask, samples=2500){
    const deck=[];
    for(const r of RANKS){
      for(const s of SUITS){
        deck.push({rank:r,suit:s});
      }
    }

    const heldCards = hand.filter((_,i)=>mask[i]);
    const used = new Set(heldCards.map(c=>c.rank+c.suit));
    const remaining = deck.filter(c=>!used.has(c.rank+c.suit));

    let total = 0;
    const pt = PAYTABLES[paytableEl.value];

    for(let i=0;i<samples;i++){
      shuffle(remaining);
      const draw = remaining.slice(0,5-heldCards.length);
      const res = evaluateDDB(heldCards.concat(draw));

      if(res.type==="full_house") total += pt.full_house;
      else if(res.type==="flush") total += pt.flush;
      else total += res.payout || 0;
    }

    return total/samples;
  }

  /* ---------- render ---------- */

  function renderUserHand(){
    cardsBox.innerHTML="";
    hand.forEach((c,i)=>{
      const el=document.createElement("div");
      el.className =
        "card"+
        ((c.suit==="H"||c.suit==="D")?" red":"")+
        (held[i]?" held":"");

      el.innerHTML=`
        <div class="corner top">${c.rank==="T"?"10":c.rank}${SUIT_SYMBOL[c.suit]}</div>
        <div class="pip">${SUIT_SYMBOL[c.suit]}</div>
        <div class="corner bottom">${c.rank==="T"?"10":c.rank}${SUIT_SYMBOL[c.suit]}</div>
      `;

      el.onclick=()=>{
        held[i]=!held[i];
        renderUserHand();
      };

      cardsBox.appendChild(el);
    });
  }

  function renderOptimal(mask){
    optimalBox.innerHTML="";
    hand.forEach((c,i)=>{
      const el=document.createElement("div");
      el.className =
        "card"+
        ((c.suit==="H"||c.suit==="D")?" red":"")+
        (mask[i]?" optimal":"");

      el.innerHTML=`
        <div class="corner top">${c.rank==="T"?"10":c.rank}${SUIT_SYMBOL[c.suit]}</div>
        <div class="pip">${SUIT_SYMBOL[c.suit]}</div>
        <div class="corner bottom">${c.rank==="T"?"10":c.rank}${SUIT_SYMBOL[c.suit]}</div>
      `;

      optimalBox.appendChild(el);
    });
  }

  /* ---------- game flow ---------- */

  function newHand(){
    hand = dealHand();
    held = [false,false,false,false,false];
    optimalBox.innerHTML="";
    resultBox.style.display="none";
    renderUserHand();
  }

  checkBtn.onclick=()=>{
    let bestEV=-1;
    let bestMask=null;

    for(let m=0;m<32;m++){
      const mask=[0,1,2,3,4].map(i=>!!(m&(1<<i)));
      const ev=simulateEV(mask);
      if(ev>bestEV){
        bestEV=ev;
        bestMask=mask;
      }
    }

    const userEV=simulateEV(held);
    const loss=(bestEV-userEV).toFixed(3);

    renderOptimal(bestMask);

    resultBox.style.display="block";
    resultBox.innerHTML=`
      <b>${loss<=0.001 ? "✅ Optimal!" : "❌ Suboptimal"}</b><br><br>
      EV (optimal): ${bestEV.toFixed(3)}<br>
      EV (yours): ${userEV.toFixed(3)}<br>
      EV loss: ${loss}
    `;
  };

  nextBtn.onclick=newHand;

  /* ---------- init ---------- */
  newHand();

});
