document.addEventListener("DOMContentLoaded", () => {

  /* ===============================
     CONFIG
     =============================== */
  const START_CREDITS = 1000;
  const COST_PER_HAND = 1;
  const NUM_HANDS = 3;

  /* ===============================
     STATE
     =============================== */
  let credits = Number(localStorage.getItem("ux_credits"));
  if (!Number.isFinite(credits) || credits <= 0) {
    credits = START_CREDITS;
  }

  let baseHand = [];
  let held = [false,false,false,false,false];

  let currentMult = {top:1,mid:1,bot:1};
  let earned = {top:1,mid:1,bot:1};

  /* ===============================
     DOM
     =============================== */
  const topBox = document.getElementById("topBox");
  const midBox = document.getElementById("midBox");
  const botBox = document.getElementById("cardsBox");

  const multTop = document.getElementById("multTop");
  const multMid = document.getElementById("multMid");
  const multBot = document.getElementById("multBot");

  const nextTop = document.getElementById("nextTop");
  const nextMid = document.getElementById("nextMid");
  const nextBot = document.getElementById("nextBot");

  const creditsEl = document.getElementById("creditsValue");
  const resultBox = document.getElementById("resultBox");
  const drawBtn = document.getElementById("drawBtn");
  const paytableEl = document.getElementById("paytable");

  /* ===============================
     CONSTANTS
     =============================== */
  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT = {S:"♠",H:"♥",D:"♦",C:"♣"};

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

  const PAYTABLES = {
    DDB_9_6:{full_house:9,flush:6},
    DDB_9_5:{full_house:9,flush:5},
    DDB_8_5:{full_house:8,flush:5},
    DDB_7_5:{full_house:7,flush:5}
  };

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

  function dealBase(){
    const d=[];
    for(const r of RANKS)for(const s of SUITS)d.push({rank:r,suit:s});
    shuffle(d);
    return d.slice(0,5);
  }

  function facedown(box){
    box.innerHTML="";
    for(let i=0;i<5;i++){
      const el=document.createElement("div");
      el.className="card facedown";
      box.appendChild(el);
    }
  }

  function faceup(box, cards, clickable){
    box.innerHTML="";
    cards.forEach((c,i)=>{
      const el=document.createElement("div");
      el.className="card";
      if(c.suit==="H"||c.suit==="D")el.classList.add("red");
      if(clickable && held[i])el.classList.add("held");

      el.innerHTML=`
        <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
        <div class="pip">${SUIT[c.suit]}</div>
        <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
      `;

      if(clickable){
        el.onclick=()=>{
          held[i]=!held[i];
          faceup(botBox,baseHand,true);
        };
      }
      box.appendChild(el);
    });
  }

  function updateUI(){
    creditsEl.textContent=credits;
    localStorage.setItem("ux_credits",credits);

    multTop.textContent=currentMult.top;
    multMid.textContent=currentMult.mid;
    multBot.textContent=currentMult.bot;

    nextTop.textContent=earned.top;
    nextMid.textContent=earned.mid;
    nextBot.textContent=earned.bot;
  }

  /* ===============================
     GAME FLOW
     =============================== */
  function startRound(){
    baseHand=dealBase();
    held=[false,false,false,false,false];
    earned={top:1,mid:1,bot:1};
    resultBox.style.display="none";

    facedown(topBox);
    facedown(midBox);
    faceup(botBox,baseHand,true);

    updateUI();
  }

  function evaluate(cards){
    const ranks=cards.map(c=>c.rank);
    const suits=cards.map(c=>c.suit);
    const rc={};
    for(const r of ranks)rc[r]=(rc[r]||0)+1;
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
  }

  drawBtn.onclick=()=>{
    const cost=COST_PER_HAND*NUM_HANDS;
    if(credits<cost){
      alert("Out of credits");
      return;
    }
    credits-=cost;

    const pt=PAYTABLES[paytableEl.value];
    const heldCards=baseHand.filter((_,i)=>held[i]);

    const drawHand=()=>{
      const deck=[];
      for(const r of RANKS)for(const s of SUITS){
        const k=r+s;
        if(!heldCards.some(c=>c.rank+c.suit===k))
          deck.push({rank:r,suit:s});
      }
      shuffle(deck);
      return heldCards.concat(deck.slice(0,5-heldCards.length));
    };

    const top=drawHand();
    const mid=drawHand();
    const bot=drawHand();

    const catTop=evaluate(top);
    const catMid=evaluate(mid);
    const catBot=evaluate(bot);

    earned={
      top:AWARD[catTop],
      mid:AWARD[catMid],
      bot:AWARD[catBot]
    };

    faceup(topBox,top,false);
    faceup(midBox,mid,false);
    faceup(botBox,bot,false);

    const win=
      (AWARD[catTop]>1?AWARD[catTop]:0)*currentMult.top +
      (AWARD[catMid]>1?AWARD[catMid]:0)*currentMult.mid +
      (AWARD[catBot]>1?AWARD[catBot]:0)*currentMult.bot;

    credits+=win;

    resultBox.style.display="block";
    resultBox.innerHTML=`Win: +${win} credits`;

    updateUI();

    currentMult={...earned};
    startRound();
  };

  /* INIT */
  updateUI();
  startRound();
});
