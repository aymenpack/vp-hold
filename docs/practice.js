document.addEventListener("DOMContentLoaded", () => {

  const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const SUITS = ["S","H","D","C"];
  const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

  const AWARD = {
    nothing:1, jacks:2, two_pair:2, trips:3,
    straight:4, flush:5, full_house:6,
    quads:10, straight_flush:12, royal_flush:12
  };

  const PAYTABLES = {
    DDB_9_6:{fh:9, fl:6, baseEV:0.9861}
  };

  const topBox = document.getElementById("topBox");
  const midBox = document.getElementById("midBox");
  const botBox = document.getElementById("cardsBox");

  const multTopEl = document.getElementById("multTop");
  const multMidEl = document.getElementById("multMid");
  const multBotEl = document.getElementById("multBot");

  const dealBtn = document.getElementById("dealBtn");
  const checkBtn = document.getElementById("checkBtn");
  const nextBtn = document.getElementById("nextBtn");
  const resultBox = document.getElementById("resultBox");

  let state = "facedown";
  let hand = [];
  let held = [false,false,false,false,false];
  let mult = {top:1, mid:1, bot:1};

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function deal(){
    const d=[];
    for(const r of RANKS) for(const s of SUITS) d.push({rank:r,suit:s});
    shuffle(d);
    return d.slice(0,5);
  }

  function render(box, cards, opts={}){
    box.innerHTML="";
    cards.forEach((c,i)=>{
      const el=document.createElement("div");
      el.className="card";

      if(opts.facedown){
        el.classList.add("facedown");
      } else {
        el.classList.add((c.suit==="H"||c.suit==="D")?"red":"");
        el.innerHTML=`
          <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
          <div class="pip">${SUIT[c.suit]}</div>
          <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
        `;
        if(opts.clickable){
          el.onclick=()=>{
            held[i]=!held[i];
            renderAll();
          };
          if(held[i]) el.classList.add("held");
        }
      }
      box.appendChild(el);
    });
  }

  function renderAll(){
    render(topBox,hand,{facedown:state==="facedown"});
    render(midBox,hand,{facedown:state==="facedown"});
    render(botBox,hand,{facedown:state==="facedown", clickable:state==="choosing"});
    multTopEl.textContent=mult.top;
    multMidEl.textContent=mult.mid;
    multBotEl.textContent=mult.bot;
  }

  function newRound(){
    state="facedown";
    hand=deal();
    held=[false,false,false,false,false];
    resultBox.style.display="none";
    dealBtn.disabled=false;
    checkBtn.disabled=true;
    nextBtn.disabled=true;
    renderAll();
  }

  dealBtn.onclick=()=>{
    state="choosing";
    dealBtn.disabled=true;
    checkBtn.disabled=false;
    renderAll();
  };

  checkBtn.onclick=()=>{
    state="resolved";
    checkBtn.disabled=true;
    nextBtn.disabled=false;

    // simplified result: award multipliers randomly (placeholder)
    // NEXT STEP: plug exact evaluator (already built earlier)

    mult.top = Math.max(1, Math.min(12, mult.top + (Math.random()<0.4?1:0)));
    mult.mid = Math.max(1, Math.min(12, mult.mid + (Math.random()<0.4?1:0)));
    mult.bot = Math.max(1, Math.min(12, mult.bot + (Math.random()<0.4?1:0)));

    resultBox.style.display="block";
    resultBox.innerHTML="Round resolved. Multipliers updated.";
    renderAll();
  };

  nextBtn.onclick=newRound;

  newRound();
});
