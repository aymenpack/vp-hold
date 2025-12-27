document.addEventListener("DOMContentLoaded", () => {

  /* ===============================
     CONSTANTS
     =============================== */

  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

  const PAYTABLES = {
    DDB_9_6:{full_house:9,flush:6},
    DDB_9_5:{full_house:9,flush:5},
    DDB_8_5:{full_house:8,flush:5},
    DDB_7_5:{full_house:7,flush:5}
  };

  const AWARD = {
    nothing:1,
    jacks_or_better:2,
    two_pair:2,
    three_kind:3,
    straight:4,
    flush:5,
    full_house:6,
    four_kind:10,
    straight_flush:12,
    royal_flush:12
  };

  /* ===============================
     DOM
     =============================== */

  const topBox = document.getElementById("topBox");
  const midBox = document.getElementById("midBox");
  const botBox = document.getElementById("cardsBox");

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

  /* ===============================
     STATE
     =============================== */

  let baseHand = [];
  let held = [false,false,false,false,false];

  let currentMult = {top:1,mid:1,bot:1};
  let earnedNext  = {top:1,mid:1,bot:1};

  /* ===============================
     HELPERS
     =============================== */

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function newDeck(){
    const d=[];
    for(const r of RANKS) for(const s of SUITS) d.push({rank:r,suit:s});
    shuffle(d);
    return d;
  }

  function dealBaseHand(){
    return newDeck().slice(0,5);
  }

  function remainingDeck(exclude){
    return newDeck().filter(c=>!exclude.has(c.rank+c.suit));
  }

  /* ===============================
     RENDERING
     =============================== */

  function renderFacedown(box){
    box.innerHTML="";
    for(let i=0;i<5;i++){
      const el=document.createElement("div");
      el.className="card facedown";
      box.appendChild(el);
    }
  }

  function renderFaceup(box, cards, clickable){
    box.innerHTML="";
    cards.forEach((c,i)=>{
      const el=document.createElement("div");
      el.className="card";
      if(c.suit==="H"||c.suit==="D") el.classList.add("red");

      if(clickable && held[i]) el.classList.add("held");

      el.innerHTML=`
        <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
        <div class="pip">${SUIT[c.suit]}</div>
        <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
      `;

      if(clickable){
        el.onclick=()=>{
          held[i]=!held[i];
          renderFaceup(botBox, baseHand, true);
        };
      }

      box.appendChild(el);
    });
  }

  function updateMultipliers(){
    multTopEl.textContent=currentMult.top;
    multMidEl.textContent=currentMult.mid;
    multBotEl.textContent=currentMult.bot;

    nextTopEl.textContent=earnedNext.top;
    nextMidEl.textContent=earnedNext.mid;
    nextBotEl.textContent=earnedNext.bot;
  }

  /* ===============================
     GAME FLOW
     =============================== */

  function startRound(){
    baseHand = dealBaseHand();
    held = [false,false,false,false,false];
    earnedNext = {top:1,mid:1,bot:1};
    resultBox.style.display="none";

    updateMultipliers();

    // ALL THREE FACE DOWN
    renderFacedown(topBox);
    renderFacedown(midBox);
    renderFacedown(botBox);

    dealBtn.disabled=false;
    checkBtn.disabled=true;
    nextBtn.disabled=true;
  }

  dealBtn.onclick = () => {
    // ONLY BOTTOM FLIPS
    renderFacedown(topBox);
    renderFacedown(midBox);
    renderFaceup(botBox, baseHand, true);

    dealBtn.disabled=true;
    checkBtn.disabled=false;
  };

  checkBtn.onclick = () => {
    const pt = PAYTABLES[paytableEl.value];

    const heldCards = baseHand.filter((_,i)=>held[i]);
    const used = new Set(heldCards.map(c=>c.rank+c.suit));
    const need = 5-heldCards.length;

    const deck = remainingDeck(used);

    shuffle(deck);
    const topFinal = heldCards.concat(deck.slice(0,need));
    shuffle(deck);
    const midFinal = heldCards.concat(deck.slice(0,need));
    shuffle(deck);
    const botFinal = heldCards.concat(deck.slice(0,need));

    renderFaceup(topBox, topFinal, false);
    renderFaceup(midBox, midFinal, false);
    renderFaceup(botBox, botFinal, false);

    const evalHand = cards=>{
      const ranks=cards.map(c=>c.rank);
      const suits=cards.map(c=>c.suit);
      const rc={};
      for(const r of ranks) rc[r]=(rc[r]||0)+1;
      const counts=Object.values(rc).sort((a,b)=>b-a);
      const uniq=Object.keys(rc);
      const flush=suits.every(s=>s===suits[0]);
      const vals=[...new Set(ranks.map(r=>RANKS.indexOf(r)))].sort((a,b)=>a-b);
      const straight=vals.length===5&&(vals[4]-vals[0]===4||JSON.stringify(vals)==='[0,1,2,3,12]');

      if(flush&&straight){
        if(ranks.includes("A")&&ranks.includes("T"))return"royal_flush";
        return"straight_flush";
      }
      if(counts[0]===4)return"four_kind";
      if(counts[0]===3&&counts[1]===2)return"full_house";
      if(flush)return"flush";
      if(straight)return"straight";
      if(counts[0]===3)return"three_kind";
      if(counts[0]===2&&counts[1]===2)return"two_pair";
      if(counts[0]===2&&["J","Q","K","A"].includes(uniq.find(r=>rc[r]===2)))return"jacks_or_better";
      return"nothing";
    };

    const t=evalHand(topFinal);
    const m=evalHand(midFinal);
    const b=evalHand(botFinal);

    earnedNext={
      top:AWARD[t]||1,
      mid:AWARD[m]||1,
      bot:AWARD[b]||1
    };

    updateMultipliers();

    resultBox.style.display="block";
    resultBox.innerHTML=`
      Top: ${t} → ×${earnedNext.top}<br>
      Mid: ${m} → ×${earnedNext.mid}<br>
      Bot: ${b} → ×${earnedNext.bot}
    `;

    checkBtn.disabled=true;
    nextBtn.disabled=false;
  };

  nextBtn.onclick = () => {
    currentMult = {...earnedNext};
    startRound();
  };

  /* INIT */
  startRound();

});
