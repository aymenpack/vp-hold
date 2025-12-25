import { captureGreenFrame } from "../capture/capture.js";

export function wireSnapWorker({
  video,
  scanner,
  band,
  spinner,
  resultsContainer,
  welcomeBox,
  modeSelect,
  onSnapComplete
}) {
  const API_URL = "https://vp-hold-production.up.railway.app/analyze";
  let busy=false;

  scanner.addEventListener("click", async ()=>{
    if(busy) return;
    busy=true;
    spinner.style.display="block";

    try{
      const imageBase64=captureGreenFrame({video,scanner,band});

      const res=await fetch(API_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({
          imageBase64,
          paytable:"DDB_9_6",
          mode:modeSelect.value
        })
      });

      const d=await res.json();
      if(!d||!d.cards) return;

      welcomeBox.style.display="none";
      resultsContainer.innerHTML=renderResults(d);
      onSnapComplete();

    }finally{
      spinner.style.display="none";
      busy=false;
    }
  });
}

function renderResults(d){
  const SUIT={S:"♠",H:"♥",D:"♦",C:"♣"};

  const cards=d.cards.map((c,i)=>{
    const r=c.rank==="T"?"10":c.rank;
    return `
      <div class="card ${d.best_hold[i]?"held":""} ${(c.suit==="H"||c.suit==="D")?"red":""}">
        <div class="corner top">${r}<br>${SUIT[c.suit]}</div>
        <div class="pip">${SUIT[c.suit]}</div>
        <div class="corner bottom">${r}<br>${SUIT[c.suit]}</div>
      </div>`;
  }).join("");

  const multRow=(label,val)=>`
    <div class="multRow">
      <div class="multLabel">${label}</div>
      <div class="multCells">
        ${Array.from({length:12},(_,i)=>`<div class="multCell ${i<val?"filled":""}"></div>`).join("")}
      </div>
      <div class="multValue">×${val}</div>
    </div>`;

  return `
    <div class="evRow">
      <div class="evLabel">Base EV</div>
      <div class="evTrack"><div class="evFill" style="width:50%"></div></div>
      <div class="evValue">${d.ev_without_multiplier.toFixed(4)}</div>
    </div>

    <div class="evRow">
      <div class="evLabel">Ultimate X EV</div>
      <div class="evTrack"><div class="evFill" style="width:100%"></div></div>
      <div class="evValue">${d.ev_with_multiplier.toFixed(4)}</div>
    </div>

    <div class="cards">${cards}</div>

    ${multRow("Top",d.multipliers.top)}
    ${multRow("Middle",d.multipliers.middle)}
    ${multRow("Bottom",d.multipliers.bottom)}

    <div id="whyBox">
      💡 This play maximizes <b>expected value</b> given the current hand,
      the paytable, and the active Ultimate X multipliers.
    </div>
  `;
}
