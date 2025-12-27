document.addEventListener("DOMContentLoaded", () => {

  /* =======================
     CONFIG
     ======================= */
  const START_CREDITS = 1000;
  const COST_PER_HAND = 1;
  const NUM_HANDS = 3;

  /* =======================
     STATE
     ======================= */
  let credits = Number(localStorage.getItem("ux_credits"));
  if (!Number.isFinite(credits)) credits = START_CREDITS;

  let baseHand = [];
  let held = [false,false,false,false,false];
  let currentMult = {top:1,mid:1,bot:1};
  let earned = {top:1,mid:1,bot:1};

  /* =======================
     DOM
     ======================= */
  const topBox = document.getElementById("topBox");
  const midBox = document.getElementById("midBox");
  const botBox = document.getElementById("botBox");

  const multTop = document.getElementById("multTop");
  const multMid = document.getElementById("multMid");
  const multBot = document.getElementById("multBot");

  const nextTop = document.getElementById("nextTop");
  const nextMid = document.getElementById("nextMid");
  const nextBot = document.getElementById("nextBot");

  const dealBtn = document.getElementById("dealBtn");
  const checkBtn = document.getElementById("checkBtn");
  const nextBtn = document.getElementById("nextBtn");
  const creditsEl = document.getElementById("creditsValue");
  const resultBox = document.getElementById("resultBox");

  /* =======================
     CARD DATA
     ======================= */
  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT = {S:"♠",H:"♥",D:"♦",C:"♣"};

  const AWARD = {
    nothing:1,
    jacks:2,
    two_pair:2,
    trips:3,
    straight:4,
    flush:5,
    full_house:6,
    quads:10,
    straight_flush:12,
    royal_flush:12
  };

  /* =======================
     HELPERS
     ======================= */
  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function dealHand(){
    const d=[];
    for(const r of RANKS)for(const s of SUITS)d.push({rank:r,suit:s});
    shuffle(d);
    return d.slice(0,5);
  }

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
          renderFaceup(botBox,baseHand,true);
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

  /* =======================
     GAME FLOW
     ======================= */
  function startRound(){
    baseHand = dealHand();
    held = [false,false,false,false,false];
    earned = {top:1,mid:1,bot:1};
    renderFacedown(topBox);
    renderFacedown(midBox);
    renderFacedown(botBox);
    dealBtn.disabled=false;
    checkBtn.disabled=true;
    nextBtn.disabled=true;
    resultBox.style.display="none";
    updateUI();
  }

  dealBtn.onclick=()=>{
    const cost = COST_PER_HAND * NUM_HANDS;
    if(credits < cost){
      alert("Not enough credits");
      return;
    }
    credits -= cost;
    renderFacedown(topBox);
    renderFacedown(midBox);
    renderFaceup(botBox,baseHand,true);
    dealBtn.disabled=true;
    checkBtn.disabled=false;
    updateUI();
  };

  checkBtn.onclick=()=>{
    renderFaceup(topBox,baseHand,false);
    renderFaceup(midBox,baseHand,false);
    renderFaceup(botBox,baseHand,false);

    // simple award demo (logic placeholder)
    earned={top:2,mid:1,bot:2};
    const win = (currentMult.top+currentMult.mid+currentMult.bot);
    credits+=win;

    resultBox.style.display="block";
    resultBox.innerHTML=`Win +${win} credits`;
    updateUI();

    checkBtn.disabled=true;
    nextBtn.disabled=false;
  };

  nextBtn.onclick=()=>{
    currentMult={...earned};
    startRound();
  };

  /* INIT */
  updateUI();
  startRound();
});
