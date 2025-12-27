/* =====================================================
   PRACTICE MODE — ULTIMATE X (3 HANDS)
   Step A: Earn multipliers from actual results (3 hands)
   Step B: Optimal hold via EV = immediate + 1-step lookahead
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT_SYMBOL = { S:"♠", H:"♥", D:"♦", C:"♣" };

  /* -------- Paytables + baseEV (DDB) -------- */
  const PAYTABLES = {
    DDB_9_6: { full_house:9, flush:6, baseEV:0.9861 },
    DDB_9_5: { full_house:9, flush:5, baseEV:0.9836 },
    DDB_8_5: { full_house:8, flush:5, baseEV:0.9723 },
    DDB_7_5: { full_house:7, flush:5, baseEV:0.9610 }
  };

  /* -------- Ultimate X multiplier awards (by result category) -------- */
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

  /* -------- DOM -------- */
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

  const resultBox = document.getElementById("resultBox");
  const checkBtn = document.getElementById("checkBtn");
  const nextBtn = document.getElementById("nextBtn");
  const paytableEl = document.getElementById("paytable");

  /* -------- State -------- */
  let baseHand = [];
  let heldMask = [false,false,false,false,false];

  let currentMult = { top:1, mid:1, bot:1 };
  let lastEarned = { top:1, mid:1, bot:1 };

  /* -------- Utils -------- */
  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }

  function deal5Unique(excludeSet){
    const deck=[];
    for(const r of RANKS) for(const s of SUITS) {
      const k=r+s;
      if(!excludeSet.has(k)) deck.push({rank:r,suit:s});
    }
    shuffle(deck);
    return deck;
  }

  function countBy(arr){
    return arr.reduce((m,v)=>(m[v]=(m[v]||0)+1,m),{});
  }
  function rankValue(r){ return RANKS.indexOf(r); }

  /* -------- Exact DDB evaluator that returns category + payout -------- */
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
        return { category:"royal_flush", payout:800, qualifies:true };
      return { category:"straight_flush", payout:50, qualifies:true };
    }

    if(counts[0]===4){
      const quad = unique.find(r=>rc[r]===4);
      const kicker = unique.find(r=>rc[r]===1);

      // DDB quad categories all count as "four_kind" for multiplier awarding
      if(quad==="A"){
        return ["2","3","4"].includes(kicker)
          ? { category:"four_kind", payout:400, qualifies:true }
          : { category:"four_kind", payout:160, qualifies:true };
      }
      if(["2","3","4"].includes(quad)){
        return ["A","2","3","4"].includes(kicker)
          ? { category:"four_kind", payout:160, qualifies:true }
          : { category:"four_kind", payout:80, qualifies:true };
      }
      return { category:"four_kind", payout:50, qualifies:true };
    }

    if(counts[0]===3 && counts[1]===2)
      return { category:"full_house", payout:pt.full_house, qualifies:true };

    if(isFlush) return { category:"flush", payout:pt.flush, qualifies:true };
    if(isStraight) return { category:"straight", payout:4, qualifies:true };
    if(counts[0]===3) return { category:"three_kind", payout:3, qualifies:true };
    if(counts[0]===2 && counts[1]===2) return { category:"two_pair", payout:1, qualifies:true };

    if(counts[0]===2){
      const pair = unique.find(r=>rc[r]===2);
      if(["J","Q","K","A"].includes(pair))
        return { category:"jacks_or_better", payout:1, qualifies:true };
    }

    return { category:"nothing", payout:0, qualifies:false };
  }

  /* -------- Rendering -------- */
  function renderHand(box, cards, mask, clickable){
    box.innerHTML = "";
    cards.forEach((c,i)=>{
      const el = document.createElement("div");
      el.className =
        "card"+
        ((c.suit==="H"||c.suit==="D")?" red":"")+
        (mask[i] ? " held" : "");

      el.innerHTML = `
        <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT_SYMBOL[c.suit]}</div>
        <div class="pip">${SUIT_SYMBOL[c.suit]}</div>
        <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT_SYMBOL[c.suit]}</div>
      `;

      if(clickable){
        el.onclick = () => {
          heldMask[i] = !heldMask[i];
          drawBaseHands(); // keep all 3 in sync visually
        };
      } else {
        el.style.cursor = "default";
      }

      box.appendChild(el);
    });
  }

  function renderOptimal(mask){
    optimalBox.innerHTML = "";
    baseHand.forEach((c,i)=>{
      const el = document.createElement("div");
      el.className =
        "card"+
        ((c.suit==="H"||c.suit==="D")?" red":"")+
        (mask[i] ? " optimal" : "");

      el.innerHTML = `
        <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT_SYMBOL[c.suit]}</div>
        <div class="pip">${SUIT_SYMBOL[c.suit]}</div>
        <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT_SYMBOL[c.suit]}</div>
      `;
      optimalBox.appendChild(el);
    });
  }

  function updateMultUI(){
    multTopEl.textContent = currentMult.top;
    multMidEl.textContent = currentMult.mid;
    multBotEl.textContent = currentMult.bot;

    nextTopEl.textContent = lastEarned.top;
    nextMidEl.textContent = lastEarned.mid;
    nextBotEl.textContent = lastEarned.bot;
  }

  /* -------- Deal base hand and show on all 3 (holds apply to all) -------- */
  function drawBaseHands(){
    renderHand(topBox, baseHand, heldMask, false);
    renderHand(midBox, baseHand, heldMask, false);
    renderHand(botBox, baseHand, heldMask, true);
  }

  function newRound(){
    baseHand = (function(){
      const deck=[];
      for(const r of RANKS) for(const s of SUITS) deck.push({rank:r,suit:s});
      shuffle(deck);
      return deck.slice(0,5);
    })();

    heldMask = [false,false,false,false,false];
    lastEarned = { top:1, mid:1, bot:1 };
    optimalBox.innerHTML = "";
    resultBox.style.display = "none";
    updateMultUI();
    drawBaseHands();
  }

  /* -------- Resolve one concrete outcome (Step A visualization) -------- */
  function resolveOnce(mask){
    const pt = PAYTABLES[paytableEl.value];

    const heldCards = baseHand.filter((_,i)=>mask[i]);
    const used = new Set(heldCards.map(c=>c.rank+c.suit));
    const deck = deal5Unique(used); // remaining cards
    // each hand draws independently:
    shuffle(deck);
    const topDraw = deck.slice(0, 5-heldCards.length);

    shuffle(deck);
    const midDraw = deck.slice(0, 5-heldCards.length);

    shuffle(deck);
    const botDraw = deck.slice(0, 5-heldCards.length);

    const topFinal = heldCards.concat(topDraw);
    const midFinal = heldCards.concat(midDraw);
    const botFinal = heldCards.concat(botDraw);

    const topRes = evaluateDDB(topFinal, pt);
    const midRes = evaluateDDB(midFinal, pt);
    const botRes = evaluateDDB(botFinal, pt);

    const nextTop = AWARD[topRes.category] ?? 1;
    const nextMid = AWARD[midRes.category] ?? 1;
    const nextBot = AWARD[botRes.category] ?? 1;

    const winTop = topRes.payout * currentMult.top;
    const winMid = midRes.payout * currentMult.mid;
    const winBot = botRes.payout * currentMult.bot;

    return {
      topFinal, midFinal, botFinal,
      topRes, midRes, botRes,
      winTop, winMid, winBot,
      nextMult:{ top:nextTop, mid:nextMid, bot:nextBot }
    };
  }

  /* -------- EV for a hold mask: immediate + 1-step lookahead (Step B) -------- */
  function estimateEV(mask, samples=2000){
    const pt = PAYTABLES[paytableEl.value];

    const heldCards = baseHand.filter((_,i)=>mask[i]);
    const used = new Set(heldCards.map(c=>c.rank+c.suit));
    const deck = deal5Unique(used);

    let total = 0;

    for(let t=0;t<samples;t++){
      // draw for each hand independently
      shuffle(deck);
      const topFinal = heldCards.concat(deck.slice(0, 5-heldCards.length));
      shuffle(deck);
      const midFinal = heldCards.concat(deck.slice(0, 5-heldCards.length));
      shuffle(deck);
      const botFinal = heldCards.concat(deck.slice(0, 5-heldCards.length));

      const topRes = evaluateDDB(topFinal, pt);
      const midRes = evaluateDDB(midFinal, pt);
      const botRes = evaluateDDB(botFinal, pt);

      const immediate =
        topRes.payout * currentMult.top +
        midRes.payout * currentMult.mid +
        botRes.payout * currentMult.bot;

      const nextTop = AWARD[topRes.category] ?? 1;
      const nextMid = AWARD[midRes.category] ?? 1;
      const nextBot = AWARD[botRes.category] ?? 1;

      const lookahead = pt.baseEV * (nextTop + nextMid + nextBot);

      total += immediate + lookahead;
    }

    return total / samples;
  }

  function findOptimalMask(){
    let bestEV = -Infinity;
    let bestMask = null;

    for(let m=0;m<32;m++){
      const mask = [0,1,2,3,4].map(i=>!!(m&(1<<i)));
      const ev = estimateEV(mask, 1400);
      if(ev > bestEV){
        bestEV = ev;
        bestMask = mask;
      }
    }

    return { bestMask, bestEV };
  }

  /* -------- Buttons -------- */
  checkBtn.onclick = () => {
    // Show a concrete resolved outcome (Step A)
    const out = resolveOnce(heldMask);

    // Update "next multipliers" display
    lastEarned = out.nextMult;
    updateMultUI();

    // Render the actual final hands (so player sees outcome)
    renderHand(topBox, out.topFinal, [false,false,false,false,false], false);
    renderHand(midBox, out.midFinal, [false,false,false,false,false], false);
    renderHand(botBox, out.botFinal, [false,false,false,false,false], false);

    // Compute optimal EV + optimal mask (Step B)
    const { bestMask, bestEV } = findOptimalMask();
    const userEV = estimateEV(heldMask, 1400);
    const loss = (bestEV - userEV).toFixed(3);

    renderOptimal(bestMask);

    resultBox.style.display = "block";
    resultBox.innerHTML = `
      <b>${loss <= 0.01 ? "✅ Great hold!" : "❌ Suboptimal hold"}</b><br><br>

      <b>Round outcome (one sample):</b><br>
      Top: ${out.topRes.category} → win ${out.winTop.toFixed(0)} → next ×${out.nextMult.top}<br>
      Mid: ${out.midRes.category} → win ${out.winMid.toFixed(0)} → next ×${out.nextMult.mid}<br>
      Bot: ${out.botRes.category} → win ${out.winBot.toFixed(0)} → next ×${out.nextMult.bot}<br><br>

      <b>EV (immediate + next-hand lookahead):</b><br>
      EV (optimal): ${bestEV.toFixed(3)}<br>
      EV (yours): ${userEV.toFixed(3)}<br>
      EV loss: ${loss}
    `;

    // After checking, carry multipliers forward for the next hand
    currentMult = { ...out.nextMult };
  };

  nextBtn.onclick = () => {
    newRound(); // multipliers persist (currentMult carries)
  };

  /* -------- Init -------- */
  updateMultUI();
  newRound();

});
