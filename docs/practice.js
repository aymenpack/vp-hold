/* =====================================================
   PRACTICE MODE — ULTIMATE X (3 HANDS)
   Exact DDB math + Ultimate X carry
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  /* ---------- CONSTANTS ---------- */

  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT_SYMBOL = { S:"♠", H:"♥", D:"♦", C:"♣" };

  /* ---------- PAYTABLES (DDB) ---------- */

  const PAYTABLES = {
    DDB_9_6: { full_house:9, flush:6, baseEV:0.9861 },
    DDB_9_5: { full_house:9, flush:5, baseEV:0.9836 },
    DDB_8_5: { full_house:8, flush:5, baseEV:0.9723 },
    DDB_7_5: { full_house:7, flush:5, baseEV:0.9610 }
  };

  /* ---------- DOM ---------- */

  const cardsBox   = document.getElementById("cardsBox");
  const optimalBox = document.getElementById("optimalBox");
  const resultBox  = document.getElementById("resultBox");
  const checkBtn   = document.getElementById("checkBtn");
  const nextBtn    = document.getElementById("nextBtn");
  const paytableEl = document.getElementById("paytable");

  /* ---------- MULTIPLIERS (3 HANDS) ---------- */

  // Training defaults – you can randomize later
  const MULTIPLIERS = {
    top: 2,
    middle: 2,
    bottom: 4
  };

  /* ---------- STATE ---------- */

  let hand = [];
  let held = [false,false,false,false,false];

  /* ---------- UTILS ---------- */

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }

  function dealHand(){
    const deck=[];
    for(const r of RANKS) for(const s of SUITS) deck.push({rank:r,suit:s});
    return shuffle(deck).slice(0,5);
  }

  function countBy(arr){
    return arr.reduce((m,v)=>(m[v]=(m[v]||0)+1,m),{});
  }

  function rankValue(r){ return RANKS.indexOf(r); }

  /* ---------- EXACT DDB EVALUATOR ---------- */

  function evaluateDDB(cards, pt){
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

    if(isFlush && isStraight){
      if(ranks.includes("A") && ranks.includes("T"))
        return { payout:800, qualifies:true };
      return { payout:50, qualifies:true };
    }

    if(counts[0]===4){
      const quad = unique.find(r=>rc[r]===4);
      const kicker = unique.find(r=>rc[r]===1);

      if(quad==="A"){
        return ["2","3","4"].includes(kicker)
          ? { payout:400, qualifies:true }
          : { payout:160, qualifies:true };
      }

      if(["2","3","4"].includes(quad)){
        return ["A","2","3","4"].includes(kicker)
          ? { payout:160, qualifies:true }
          : { payout:80, qualifies:true };
      }

      return { payout:50, qualifies:true };
    }

    if(counts[0]===3 && counts[1]===2)
      return { payout:pt.full_house, qualifies:true };

    if(isFlush) return { payout:pt.flush, qualifies:true };
    if(isStraight) return { payout:4, qualifies:true };
    if(counts[0]===3) return { payout:3, qualifies:true };
    if(counts[0]===2 && counts[1]===2) return { payout:1, qualifies:true };

    if(counts[0]===2){
      const pair = unique.find(r=>rc[r]===2);
      if(["J","Q","K","A"].includes(pair))
        return { payout:1, qualifies:true };
    }

    return { payout:0, qualifies:false };
  }

  /* ---------- EV SIMULATION (ULTIMATE X) ---------- */

  function simulateEV(mask, samples=3000){
    const deck=[];
    for(const r of RANKS) for(const s of SUITS) deck.push({rank:r,suit:s});

    const heldCards = hand.filter((_,i)=>mask[i]);
    const used = new Set(heldCards.map(c=>c.rank+c.suit));
    const remaining = deck.filter(c=>!used.has(c.rank+c.suit));

    const pt = PAYTABLES[paytableEl.value];
    let totalEV = 0;

    for(let i=0;i<samples;i++){
      shuffle(remaining);
      const draw = remaining.slice(0,5-heldCards.length);
      const res = evaluateDDB(heldCards.concat(draw), pt);

      const immediate = res.payout * MULTIPLIERS.bottom;
      const future = res.qualifies ? pt.baseEV : 0;

      totalEV += immediate + future;
    }

    return totalEV / samples;
  }

  /* ---------- RENDER ---------- */

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

  /* ---------- GAME FLOW ---------- */

  function newHand(){
    hand = dealHand();
    held = [false,false,false,false,false];
    optimalBox.innerHTML="";
    resultBox.style.display="none";
    renderUserHand();
  }

  checkBtn.onclick=()=>{
    let bestEV=-Infinity;
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
      <b>${loss<=0.001 ? "✅ Optimal Ultimate X play!" : "❌ Suboptimal Ultimate X play"}</b><br><br>
      EV (optimal): ${bestEV.toFixed(3)}<br>
      EV (yours): ${userEV.toFixed(3)}<br>
      EV loss: ${loss}<br><br>
      <b>Multipliers:</b><br>
      Top ×${MULTIPLIERS.top}, Middle ×${MULTIPLIERS.middle}, Bottom ×${MULTIPLIERS.bottom}
    `;
  };

  nextBtn.onclick=newHand;

  /* ---------- INIT ---------- */
  newHand();

});
