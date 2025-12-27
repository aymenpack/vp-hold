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
    nothing:1,jacks_or_better:2,two_pair:2,three_kind:3,
    straight:4,flush:5,full_house:6,
    four_kind:10,straight_flush:12,royal_flush:12
  };

  const topBox = document.getElementById("topBox");
  const midBox = document.getElementById("midBox");
  const botBox = document.getElementById("cardsBox");

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

  let baseHand = [];
  let held = [false,false,false,false,false];
  let currentMult = {top:1,mid:1,bot:1};
  let earned = {top:1,mid:1,bot:1};

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function newHand(){
    const deck=[];
    for(const r of RANKS)for(const s of SUITS)deck.push({rank:r,suit:s});
    shuffle(deck);
    baseHand=deck.slice(0,5);
    held=[false,false,false,false,false];
    earned={top:1,mid:1,bot:1};
    drawAll(true);
    updateMult();
    resultBox.style.display="none";
  }

  function drawAll(facedown){
    render(topBox, facedown);
    render(midBox, facedown);
    render(botBox, facedown);
  }

  function render(box, facedown){
    box.innerHTML="";
    for(let i=0;i<5;i++){
      const el=document.createElement("div");
      el.className="card";
      if(facedown){
        el.classList.add("facedown");
      } else {
        const c=baseHand[i];
        if(c.suit==="H"||c.suit==="D")el.classList.add("red");
        el.innerHTML=`
          <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
          <div class="pip">${SUIT[c.suit]}</div>
          <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
        `;
        if(box===botBox){
          if(held[i])el.classList.add("held");
          el.onclick=()=>{
            held[i]=!held[i];
            drawAll(false);
          };
        }
      }
      box.appendChild(el);
    }
  }

  function updateMult(){
    multTopEl.textContent=currentMult.top;
    multMidEl.textContent=currentMult.mid;
    multBotEl.textContent=currentMult.bot;
    nextTopEl.textContent=earned.top;
    nextMidEl.textContent=earned.mid;
    nextBotEl.textContent=earned.bot;
  }

  function evaluate(cards){
    const pt=PAYTABLES[paytableEl.value];
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
      if(ranks.includes("A")&&ranks.includes("T"))return{cat:"royal_flush",pay:800};
      return{cat:"straight_flush",pay:50};
    }
    if(counts[0]===4)return{cat:"four_kind",pay:50};
    if(counts[0]===3&&counts[1]===2)return{cat:"full_house",pay:pt.full_house};
    if(flush)return{cat:"flush",pay:pt.flush};
    if(straight)return{cat:"straight",pay:4};
    if(counts[0]===3)return{cat:"three_kind",pay:3};
    if(counts[0]===2&&counts[1]===2)return{cat:"two_pair",pay:1};
    if(counts[0]===2&&["J","Q","K","A"].includes(uniq.find(r=>rc[r]===2)))
      return{cat:"jacks_or_better",pay:1};
    return{cat:"nothing",pay:0};
  }

  checkBtn.onclick=()=>{
    const pt=PAYTABLES[paytableEl.value];
    const heldCards=baseHand.filter((_,i)=>held[i]);
    const used=new Set(heldCards.map(c=>c.rank+c.suit));
    const deck=[];
    for(const r of RANKS)for(const s of SUITS){
      const k=r+s;
      if(!used.has(k))deck.push({rank:r,suit:s});
    }
    shuffle(deck);

    const draw=(n)=>heldCards.concat(deck.splice(0,n));

    const top=evaluate(draw(5-heldCards.length));
    const mid=evaluate(draw(5-heldCards.length));
    const bot=evaluate(draw(5-heldCards.length));

    earned={
      top:AWARD[top.cat]||1,
      mid:AWARD[mid.cat]||1,
      bot:AWARD[bot.cat]||1
    };

    updateMult();

    resultBox.style.display="block";
    resultBox.innerHTML=`
      Top: ${top.cat} → ×${earned.top}<br>
      Mid: ${mid.cat} → ×${earned.mid}<br>
      Bot: ${bot.cat} → ×${earned.bot}
    `;
  };

  nextBtn.onclick=()=>{
    currentMult={...earned};
    newHand();
  };

  newHand();
});
