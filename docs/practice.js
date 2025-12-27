/* ================================
   PRACTICE MODE — OPTIMAL HOLD
   ================================ */

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];
const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

const cardsBox = document.getElementById("cardsBox");
const optimalBox = document.getElementById("optimalBox");
const resultBox = document.getElementById("resultBox");
const checkBtn = document.getElementById("checkBtn");
const nextBtn = document.getElementById("nextBtn");

let hand = [];
let held = [false,false,false,false,false];

/* -------- utilities -------- */

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function dealHand(){
  const deck=[];
  for(const r of RANKS) for(const s of SUITS) deck.push({rank:r,suit:s});
  return shuffle(deck).slice(0,5);
}

/* -------- evaluate payout (simplified) -------- */

function countBy(arr){
  return arr.reduce((m,v)=>(m[v]=(m[v]||0)+1,m),{});
}

function evaluateHand(cards){
  const ranks=cards.map(c=>c.rank);
  const suits=cards.map(c=>c.suit);
  const rc=countBy(ranks);
  const sc=countBy(suits);
  const counts=Object.values(rc).sort((a,b)=>b-a);
  const unique=Object.keys(rc);

  const isFlush=Object.values(sc).some(v=>v===5);
  const vals=[...new Set(ranks.map(r=>RANKS.indexOf(r)))].sort((a,b)=>a-b);
  const isWheel=JSON.stringify(vals)==='[0,1,2,3,12]';
  const isStraight=vals.length===5&&(vals[4]-vals[0]===4||isWheel);

  if(isFlush&&isStraight){
    if(ranks.includes("A")&&ranks.includes("T")) return 800;
    return 50;
  }
  if(counts[0]===4) return 50;
  if(counts[0]===3&&counts[1]===2) return 9;
  if(isFlush) return 6;
  if(isStraight) return 4;
  if(counts[0]===3) return 3;
  if(counts[0]===2&&counts[1]===2) return 1;
  if(counts[0]===2&&["J","Q","K","A"].includes(unique.find(r=>rc[r]===2))) return 1;
  return 0;
}

/* -------- EV simulation -------- */

function simulateEV(holdMask, samples=2000){
  const deck=[];
  for(const r of RANKS) for(const s of SUITS) deck.push({rank:r,suit:s});
  const heldCards = hand.filter((_,i)=>holdMask[i]);
  const used = new Set(heldCards.map(c=>c.rank+c.suit));
  const remaining = deck.filter(c=>!used.has(c.rank+c.suit));
  let total=0;

  for(let i=0;i<samples;i++){
    shuffle(remaining);
    const draw = remaining.slice(0,5-heldCards.length);
    total += evaluateHand(heldCards.concat(draw));
  }
  return total/samples;
}

/* -------- render -------- */

function render(box, cards, mask=[], clickable=false){
  box.innerHTML="";
  cards.forEach((c,i)=>{
    const el=document.createElement("div");
    el.className =
      "card"+
      ((c.suit==="H"||c.suit==="D")?" red":"")+
      (mask[i]?" held":"");

    el.innerHTML=`
      <div class="corner top">${c.rank==="T"?"10":c.rank}${SUIT[c.suit]}</div>
      <div class="pip">${SUIT[c.suit]}</div>
      <div class="corner bottom">${c.rank==="T"?"10":c.rank}${SUIT[c.suit]}</div>
    `;

    if(clickable){
      el.onclick=()=>{
        held[i]=!held[i];
        render(cardsBox,hand,held,true);
      };
    }

    box.appendChild(el);
  });
}

/* -------- game flow -------- */

function newHand(){
  hand = dealHand();
  held = [false,false,false,false,false];
  resultBox.style.display="none";
  optimalBox.innerHTML="";
  render(cardsBox,hand,held,true);
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

  render(optimalBox,hand,bestMask,false);

  resultBox.style.display="block";
  resultBox.innerHTML=`
    <b>${loss<=0.001?"✅ Optimal!":"❌ Suboptimal"}</b><br><br>
    EV (optimal): ${bestEV.toFixed(3)}<br>
    EV (yours): ${userEV.toFixed(3)}<br>
    EV loss: ${loss}
  `;
};

nextBtn.onclick=newHand;

/* init */
newHand();
