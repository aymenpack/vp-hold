/* ================================
   PRACTICE MODE — CLIENT ONLY
   ================================ */

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];
const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

const PAYTABLES = {
  DDB_9_6:{baseEV:0.9861},
  DDB_9_5:{baseEV:0.9836},
  DDB_8_5:{baseEV:0.9723},
  DDB_7_5:{baseEV:0.9610}
};

const cardsBox = document.getElementById("cardsBox");
const resultBox = document.getElementById("resultBox");
const checkBtn = document.getElementById("checkBtn");
const nextBtn = document.getElementById("nextBtn");

let hand = [];
let held = [false,false,false,false,false];

/* ---- utilities ---- */

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

/* ---- render ---- */

function render(){
  cardsBox.innerHTML="";
  hand.forEach((c,i)=>{
    const el=document.createElement("div");
    el.className =
      "card"+
      (held[i]?" held":"")+
      ((c.suit==="H"||c.suit==="D")?" red":"");

    el.innerHTML=`
      <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
      <div class="pip">${SUIT[c.suit]}</div>
      <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
    `;

    el.onclick=()=>{
      held[i]=!held[i];
      render();
    };

    cardsBox.appendChild(el);
  });
}

/* ---- game flow ---- */

function newHand(){
  hand = dealHand();
  held = [false,false,false,false,false];
  resultBox.style.display="none";
  render();
}

checkBtn.onclick=()=>{
  resultBox.style.display="block";
  resultBox.innerHTML=`
    <b>Your hold:</b><br>
    ${held.map(v=>v?"H":"D").join(" ")}<br><br>
    <i>(Optimal EV comparison coming next)</i>
  `;
};

nextBtn.onclick=newHand;

/* init */
newHand();
