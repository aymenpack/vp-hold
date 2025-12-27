/* =====================================================
   PRACTICE MODE — Ultimate X (Correct Flip Order)
   - Bottom hand flips first (hold decision)
   - Top/Mid stay face-down until hold is locked
   - Check resolves all three
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {

  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

  const PAYTABLES = {
    DDB_9_6:{full_house:9,flush:6,baseEV:0.9861},
    DDB_9_5:{full_house:9,flush:5,baseEV:0.9836},
    DDB_8_5:{full_house:8,flush:5,baseEV:0.9723},
    DDB_7_5:{full_house:7,flush:5,baseEV:0.9610}
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

  /* DOM */
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

  const dealBtn = document.getElementById("dealBtn");
  const checkBtn = document.getElementById("checkBtn");
  const nextBtn = document.getElementById("nextBtn");
  const resultBox = document.getElementById("resultBox");
  const paytableEl = document.getElementById("paytable");

  /* State */
  let phase = "facedown"; // facedown → choosing → resolved
  let baseHand = [];
  let held = [false,false,false,false,false];

  let currentMult = {top:1,mid:1,bot:1};
  let earnedNext  = {top:1,mid:1,bot:1};

  /* Utils */
  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function newBaseHand(){
    const d=[];
    for(const r of RANKS)for(const s of SUITS)d.push({rank:r,suit:s});
    shuffle(d);
    return d.slice(0,5);
  }

  function remainingDeck(exclude){
    const d=[];
    for(const r of RANKS)for(const s of SUITS){
      const k=r+s;
      if(!exclude.has(k))d.push({rank:r,suit:s});
    }
    shuffle(d);
    return d;
  }

  function countBy(arr){
    return arr.reduce((m,v)=>(m[v]=(m[v]||0)+1,m),{});
  }
  function rv(r){return RANKS.indexOf(r);}

  /* DDB evaluator */
  function evalDDB(cards, pt){
    const ranks=cards.map(c=>c.rank);
    const suits=cards.map(c=>c.suit);
    const rc=countBy(ranks);
    const sc=countBy(suits);
    const cnt=Object.values(rc).sort((a,b)=>b-a);
    const uniq=Object.keys(rc);

    const flush=Object.values(sc).some(v=>v===5);
    const vals=[...new Set(ranks.map(rv))].sort((a,b)=>a-b);
    const wheel=JSON.stringify(vals)==='[0,1,2,3,12]';
    const straight=vals.length===5&&(vals[4]-vals[0]===4||wheel);

    if(flush&&straight){
      if(ranks.includes("A")&&ranks.includes("T"))
        return{cat:"royal_flush",pay:800};
      return{cat:"straight_flush",pay:50};
    }
    if(cnt[0]===4){
      const q=uniq.find(r=>rc[r]===4);
      const k=uniq.find(r=>rc[r]===1);
      if(q==="A") return ["2","3","4"].includes(k)
        ?{cat:"four_kind",pay:400}:{cat:"four_kind",pay:160};
      if(["2","3","4"].includes(q)) return ["A","2","3","4"].includes(k)
        ?{cat:"four_kind",pay:160}:{cat:"four_kind",pay:80};
      return{cat:"four_kind",pay:50};
    }
    if(cnt[0]===3&&cnt[1]===2) return{cat:"full_house",pay:pt.full_house};
    if(flush) return{cat:"flush",pay:pt.flush};
    if(straight) return{cat:"straight",pay:4};
    if(cnt[0]===3) return{cat:"three_kind",pay:3};
    if(cnt[0]===2&&cnt[1]===2) return{cat:"two_pair",pay:1};
    if(cnt[0]===2&&["J","Q","K","A"].includes(uniq.find(r=>rc[r]===2)))
      return{cat:"jacks_or_better",pay:1};
    return{cat:"nothing",pay:0};
  }

  /* Rendering */
  function render(box, cards, faceDown, clickable){
    box.innerHTML="";
    for(let i=0;i<5;i++){
      const el=document.createElement("div");
      el.className="card";

      if(faceDown){
        el.classList.add("facedown");
        box.appendChild(el);
        continue;
      }

      const c=cards[i];
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
          drawChoosing();
        };
      }
      box.appendChild(el);
    }
  }

  function drawFacedown(){
    render(topBox, baseHand, true, false);
    render(midBox, baseHand, true, false);
    render(botBox, baseHand, true, false);
  }

  function drawChoosing(){
    render(topBox, baseHand, true, false);   // stay facedown
    render(midBox, baseHand, true, false);   // stay facedown
    render(botBox, baseHand, false, true);   // face-up & clickable
  }

  function drawResolved(out){
    render(topBox, out.top, false, false);
    render(midBox, out.mid, false, false);
    render(botBox, out.bot, false, false);
  }

  function updateMult(){
    multTopEl.textContent=currentMult.top;
    multMidEl.textContent=currentMult.mid;
    multBotEl.textContent=currentMult.bot;
    nextTopEl.textContent=earnedNext.top;
    nextMidEl.textContent=earnedNext.mid;
    nextBotEl.textContent=earnedNext.bot;
  }

  /* Round lifecycle */
  function startRound(){
    phase="facedown";
    baseHand=newBaseHand();
    held=[false,false,false,false,false];
    earnedNext={top:1,mid:1,bot:1};
    optimalBox.innerHTML="";
    resultBox.style.display="none";
    updateMult();
    drawFacedown();
    dealBtn.disabled=false;
    checkBtn.disabled=true;
    nextBtn.disabled=true;
  }

  dealBtn.onclick=()=>{
    phase="choosing";
    drawChoosing();
    dealBtn.disabled=true;
    checkBtn.disabled=false;
  };

  checkBtn.onclick=()=>{
    phase="resolved";
    checkBtn.disabled=true;
    nextBtn.disabled=false;

    const pt=PAYTABLES[paytableEl.value];
    const heldCards=baseHand.filter((_,i)=>held[i]);
    const used=new Set(heldCards.map(c=>c.rank+c.suit));
    const need=5-heldCards.length;
    const deck=remainingDeck(used);

    shuffle(deck);
    const top=heldCards.concat(deck.slice(0,need));
    shuffle(deck);
    const mid=heldCards.concat(deck.slice(0,need));
    shuffle(deck);
    const bot=heldCards.concat(deck.slice(0,need));

    const rTop=evalDDB(top,pt);
    const rMid=evalDDB(mid,pt);
    const rBot=evalDDB(bot,pt);

    earnedNext={
      top:AWARD[rTop.cat]||1,
      mid:AWARD[rMid.cat]||1,
      bot:AWARD[rBot.cat]||1
    };
    updateMult();

    drawResolved({top,mid,bot});

    resultBox.style.display="block";
    resultBox.innerHTML=`
      Top: ${rTop.cat} → earns ×${earnedNext.top}<br>
      Mid: ${rMid.cat} → earns ×${earnedNext.mid}<br>
      Bot: ${rBot.cat} → earns ×${earnedNext.bot}
    `;
  };

  nextBtn.onclick=()=>{
    currentMult={...earnedNext};
    startRound();
  };

  /* Init */
  startRound();

});
