/* =====================================================
   Ultimate X (3-hand) Practice — DDB
   - Round start: all 3 facedown
   - Deal: ONLY bottom flips for hold selection
   - Check: resolve all 3 (independent draws) + award next multipliers
   - Next: chain multipliers (current = earned next) and start new facedown round
   - Optimal Hold: computed using EV = immediate + 1-step lookahead (baseEV × next multipliers)
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT_SYMBOL = { S:"♠", H:"♥", D:"♦", C:"♣" };

  const PAYTABLES = {
    DDB_9_6: { full_house:9, flush:6, baseEV:0.9861 },
    DDB_9_5: { full_house:9, flush:5, baseEV:0.9836 },
    DDB_8_5: { full_house:8, flush:5, baseEV:0.9723 },
    DDB_7_5: { full_house:7, flush:5, baseEV:0.9610 }
  };

  const AWARD = {
    nothing: 1,
    jacks_or_better: 2,
    two_pair: 2,
    three_kind: 3,
    straight: 4,
    flush: 5,
    full_house: 6,
    four_kind: 10,
    straight_flush: 12,
    royal_flush: 12
  };

  // DOM
  const topBox = document.getElementById("topBox");
  const midBox = document.getElementById("midBox");
  const botBox = document.getElementById("cardsBox");
  const optimalBox = document.getElementById("optimalBox");

  const multTopEl = document.getElementById("multTop");
  const multMidEl = document.getElementById("multMid");
  const multBotEl = document.getElementById("multBot");

  const nextTopEl = document.getElementById("nextTop");
  const nextMidEl = document.getElementById("nextMid");
  const nextBotEl = document.getElementById("nextBot");

  const dealBtn  = document.getElementById("dealBtn");
  const checkBtn = document.getElementById("checkBtn");
  const nextBtn  = document.getElementById("nextBtn");

  const resultBox = document.getElementById("resultBox");
  const paytableEl = document.getElementById("paytable");

  // State
  let phase = "facedown"; // facedown → choosing → resolved
  let baseHand = [];
  let heldMask = [false,false,false,false,false];

  let currentMult = { top:1, mid:1, bot:1 };
  let earnedNext  = { top:1, mid:1, bot:1 };

  // Utils
  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }

  function fullDeck(){
    const d=[];
    for(const r of RANKS) for(const s of SUITS) d.push({rank:r,suit:s});
    return d;
  }

  function dealBaseHand(){
    const d = fullDeck();
    shuffle(d);
    return d.slice(0,5);
  }

  function remainingDeck(excludeSet){
    const d = fullDeck().filter(c => !excludeSet.has(c.rank+c.suit));
    shuffle(d);
    return d;
  }

  function countBy(arr){
    return arr.reduce((m,v)=>(m[v]=(m[v]||0)+1,m),{});
  }

  function rankValue(r){ return RANKS.indexOf(r); }

  // Exact DDB evaluator (returns category + payout)
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
        return { category:"royal_flush", payout:800 };
      return { category:"straight_flush", payout:50 };
    }

    if(counts[0]===4){
      const quad = unique.find(r=>rc[r]===4);
      const kicker = unique.find(r=>rc[r]===1);

      if(quad==="A"){
        return ["2","3","4"].includes(kicker)
          ? { category:"four_kind", payout:400 }
          : { category:"four_kind", payout:160 };
      }

      if(["2","3","4"].includes(quad)){
        return ["A","2","3","4"].includes(kicker)
          ? { category:"four_kind", payout:160 }
          : { category:"four_kind", payout:80 };
      }

      return { category:"four_kind", payout:50 };
    }

    if(counts[0]===3 && counts[1]===2)
      return { category:"full_house", payout:pt.full_house };

    if(isFlush) return { category:"flush", payout:pt.flush };
    if(isStraight) return { category:"straight", payout:4 };
    if(counts[0]===3) return { category:"three_kind", payout:3 };
    if(counts[0]===2 && counts[1]===2) return { category:"two_pair", payout:1 };

    if(counts[0]===2){
      const pair = unique.find(r=>rc[r]===2);
      if(["J","Q","K","A"].includes(pair))
        return { category:"jacks_or_better", payout:1 };
    }

    return { category:"nothing", payout:0 };
  }

  // Rendering
  function renderFacedown(box){
    box.innerHTML="";
    for(let i=0;i<5;i++){
      const el=document.createElement("div");
      el.className="card facedown";
      box.appendChild(el);
    }
  }

  function renderFaceup(box, cards, mask, clickable){
    box.innerHTML="";
    for(let i=0;i<5;i++){
      const c = cards[i];
      const el=document.createElement("div");
      el.className="card" + ((c.suit==="H"||c.suit==="D")?" red":"");

      if(clickable && mask[i]) el.classList.add("held");

      el.innerHTML=`
        <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT_SYMBOL[c.suit]}</div>
        <div class="pip">${SUIT_SYMBOL[c.suit]}</div>
        <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT_SYMBOL[c.suit]}</div>
      `;

      if(clickable){
        el.onclick=()=>{
          mask[i]=!mask[i];
          renderDealState(); // rerender bottom only
        };
      }

      box.appendChild(el);
    }
  }

  function renderOptimal(mask){
    optimalBox.innerHTML="";
    for(let i=0;i<5;i++){
      const c = baseHand[i];
      const el=document.createElement("div");
      el.className = "card" + ((c.suit==="H"||c.suit==="D")?" red":"") + (mask[i]?" optimal":"");
      el.innerHTML=`
        <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT_SYMBOL[c.suit]}</div>
        <div class="pip">${SUIT_SYMBOL[c.suit]}</div>
        <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT_SYMBOL[c.suit]}</div>
      `;
      optimalBox.appendChild(el);
    }
  }

  function updateMultUI(){
    multTopEl.textContent=currentMult.top;
    multMidEl.textContent=currentMult.mid;
    multBotEl.textContent=currentMult.bot;

    nextTopEl.textContent=earnedNext.top;
    nextMidEl.textContent=earnedNext.mid;
    nextBotEl.textContent=earnedNext.bot;
  }

  function renderStartState(){
    renderFacedown(topBox);
    renderFacedown(midBox);
    renderFacedown(botBox);
  }

  function renderDealState(){
    // Only bottom face-up for decision
    renderFacedown(topBox);
    renderFacedown(midBox);
    renderFaceup(botBox, baseHand, heldMask, true);
  }

  function renderResolvedState(out){
    renderFaceup(topBox, out.topFinal, [false,false,false,false,false], false);
    renderFaceup(midBox, out.midFinal, [false,false,false,false,false], false);
    renderFaceup(botBox, out.botFinal, [false,false,false,false,false], false);
  }

  // Round logic
  function startRound(){
    phase="facedown";
    baseHand = dealBaseHand();
    heldMask = [false,false,false,false,false];
    earnedNext = { top:1, mid:1, bot:1 };
    optimalBox.innerHTML="";
    resultBox.style.display="none";
    updateMultUI();
    renderStartState();

    dealBtn.disabled=false;
    checkBtn.disabled=true;
    nextBtn.disabled=true;
  }

  // EV: immediate payout with current multipliers + 1-step lookahead with baseEV×(next multipliers)
  function estimateEV(mask, samples=1000){
    const pt = PAYTABLES[paytableEl.value];
    const heldCards = baseHand.filter((_,i)=>mask[i]);
    const used = new Set(heldCards.map(c=>c.rank+c.suit));
    const need = 5-heldCards.length;

    let total=0;
    for(let t=0;t<samples;t++){
      const deck = remainingDeck(used);

      shuffle(deck);
      const topFinal = heldCards.concat(deck.slice(0,need));
      shuffle(deck);
      const midFinal = heldCards.concat(deck.slice(0,need));
      shuffle(deck);
      const botFinal = heldCards.concat(deck.slice(0,need));

      const topRes = evaluateDDB(topFinal, pt);
      const midRes = evaluateDDB(midFinal, pt);
      const botRes = evaluateDDB(botFinal, pt);

      const immediate =
        topRes.payout * currentMult.top +
        midRes.payout * currentMult.mid +
        botRes.payout * currentMult.bot;

      const nt = AWARD[topRes.category] ?? 1;
      const nm = AWARD[midRes.category] ?? 1;
      const nb = AWARD[botRes.category] ?? 1;

      const lookahead = pt.baseEV * (nt+nm+nb);

      total += immediate + lookahead;
    }
    return total/samples;
  }

  function findOptimalMask(){
    let bestEV=-Infinity;
    let bestMask=null;
    for(let m=0;m<32;m++){
      const mask=[0,1,2,3,4].map(i=>!!(m&(1<<i)));
      const ev=estimateEV(mask, 900);
      if(ev>bestEV){
        bestEV=ev;
        bestMask=mask;
      }
    }
    return {bestMask, bestEV};
  }

  function resolveRound(mask){
    const pt = PAYTABLES[paytableEl.value];
    const heldCards = baseHand.filter((_,i)=>mask[i]);
    const used = new Set(heldCards.map(c=>c.rank+c.suit));
    const need = 5-heldCards.length;

    const deck = remainingDeck(used);

    shuffle(deck);
    const topFinal = heldCards.concat(deck.slice(0,need));
    shuffle(deck);
    const midFinal = heldCards.concat(deck.slice(0,need));
    shuffle(deck);
    const botFinal = heldCards.concat(deck.slice(0,need));

    const topRes = evaluateDDB(topFinal, pt);
    const midRes = evaluateDDB(midFinal, pt);
    const botRes = evaluateDDB(botFinal, pt);

    const winTop = topRes.payout * currentMult.top;
    const winMid = midRes.payout * currentMult.mid;
    const winBot = botRes.payout * currentMult.bot;

    const nextMult = {
      top: AWARD[topRes.category] ?? 1,
      mid: AWARD[midRes.category] ?? 1,
      bot: AWARD[botRes.category] ?? 1
    };

    return { topFinal, midFinal, botFinal, topRes, midRes, botRes, winTop, winMid, winBot, nextMult };
  }

  // Buttons
  dealBtn.onclick = () => {
    phase="choosing";
    renderDealState();
    dealBtn.disabled=true;
    checkBtn.disabled=false;
    nextBtn.disabled=true;
  };

  checkBtn.onclick = () => {
    phase="resolved";
    checkBtn.disabled=true;
    nextBtn.disabled=false;

    const out = resolveRound(heldMask);
    earnedNext = out.nextMult;
    updateMultUI();

    renderResolvedState(out);

    const {bestMask, bestEV} = findOptimalMask();
    const userEV = estimateEV(heldMask, 900);
    const loss = (bestEV-userEV).toFixed(3);

    renderOptimal(bestMask);

    resultBox.style.display="block";
    resultBox.innerHTML = `
      <b>${loss <= 0.01 ? "✅ Great hold!" : "❌ Suboptimal hold"}</b><br><br>
      Top: ${out.topRes.category} → win ${out.winTop.toFixed(0)} → next ×${out.nextMult.top}<br>
      Mid: ${out.midRes.category} → win ${out.winMid.toFixed(0)} → next ×${out.nextMult.mid}<br>
      Bot: ${out.botRes.category} → win ${out.winBot.toFixed(0)} → next ×${out.nextMult.bot}<br><br>
      EV (optimal): ${bestEV.toFixed(3)}<br>
      EV (yours): ${userEV.toFixed(3)}<br>
      EV loss: ${loss}
    `;
  };

  nextBtn.onclick = () => {
    // chain multipliers forward
    currentMult = { ...earnedNext };
    startRound();
  };

  // init
  startRound();
});
