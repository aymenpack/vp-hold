import { captureGreenFrame } from "../capture/capture.js";

function animateBar(el, percent){
  el.style.width = percent + "%";
}

function animateMult(cells, n){
  [...cells].forEach((c,i)=>{
    c.className = "multCell";
    if(i < n){
      c.classList.add(i<3?"g":i<6?"y":i<9?"o":"r");
    }
  });
}

export function wireSnapWorker({
  video,
  scanner,
  band,
  spinner,
  cardsBox,

  evSection,
  evBaseValue,
  evUXValue,
  evBaseBar,
  evUXBar,

  multSection,
  multTopValue,
  multMidValue,
  multBotValue,
  multTopCells,
  multMidCells,
  multBotCells,

  whyBox,
  welcomeBox,
  onSnapComplete
}) {
  const API_URL = "https://vp-hold-production.up.railway.app/analyze";
  let busy = false;

  scanner.onclick = async () => {
    if (busy) return;
    busy = true;
    spinner.style.display = "block";

    try {
      const imageBase64 = captureGreenFrame({ video, scanner, band });

      const res = await fetch(API_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ imageBase64 })
      });

      const d = await res.json();
      if (!d || !d.cards) return;

      welcomeBox.style.display="none";
      evSection.style.display="block";
      multSection.style.display="block";

      const baseEV = d.ev_without_multiplier;
      const uxEV   = d.ev_with_multiplier;
      const maxEV  = Math.max(baseEV, uxEV, 0.0001);

      evBaseValue.textContent = baseEV.toFixed(4);
      evUXValue.textContent   = uxEV.toFixed(4);
      animateBar(evBaseBar, baseEV/maxEV*100);
      animateBar(evUXBar, uxEV/maxEV*100);

      multTopValue.textContent = "×"+d.multipliers.top;
      multMidValue.textContent = "×"+d.multipliers.middle;
      multBotValue.textContent = "×"+d.multipliers.bottom;
      animateMult(multTopCells, d.multipliers.top);
      animateMult(multMidCells, d.multipliers.middle);
      animateMult(multBotCells, d.multipliers.bottom);

      cardsBox.innerHTML="";
      const SUIT={S:"♠",H:"♥",D:"♦",C:"♣"};
      d.cards.forEach((c,i)=>{
        const r=c.rank==="T"?"10":c.rank;
        const el=document.createElement("div");
        el.className="card"+(d.best_hold[i]?" held":"")+((c.suit==="H"||c.suit==="D")?" red":"");
        el.innerHTML=`
          <div class="corner top">${r}<br>${SUIT[c.suit]}</div>
          <div class="pip">${SUIT[c.suit]}</div>
          <div class="corner bottom">${r}<br>${SUIT[c.suit]}</div>
        `;
        cardsBox.appendChild(el);
      });

      whyBox.innerHTML="💡 This hold maximizes expected value.";
      onSnapComplete();

    } finally {
      spinner.style.display="none";
      busy=false;
    }
  };
}
