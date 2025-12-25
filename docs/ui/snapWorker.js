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
  let busy = false;

  scanner.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    spinner.style.display = "block";

    try {
      const imageBase64 = captureGreenFrame({ video, scanner, band });

      const res = await fetch(API_URL, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({
          imageBase64,
          paytable:"DDB_9_6",
          mode:modeSelect.value
        })
      });

      const d = await res.json();
      if(!d||!d.cards) return;

      welcomeBox.style.display="none";
      resultsContainer.innerHTML = renderResults(d);
      onSnapComplete();

    } catch(e){
      console.error(e);
    } finally {
      spinner.style.display="none";
      busy=false;
    }
  });
}

function renderResults(d){
  const SUIT={S:"♠",H:"♥",D:"♦",C:"♣"};

  const cards = d.cards.map((c,i)=>{
    const r=c.rank==="T"?"10":c.rank;
    return `
      <div class="card ${d.best_hold[i]?"held":""} ${(c.suit==="H"||c.suit==="D")?"red":""}">
        <div class="corner top">${r}<br>${SUIT[c.suit]}</div>
        <div class="pip">${SUIT[c.suit]}</div>
        <div class="corner bottom">${r}<br>${SUIT[c.suit]}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="cards">${cards}</div>
    <div class="evSection">
      <div><b>Base EV:</b> ${d.ev_without_multiplier.toFixed(4)}</div>
      <div><b>Ultimate X EV:</b> ${d.ev_with_multiplier.toFixed(4)}</div>
    </div>
    <div class="multSection">
      <div>Top ×${d.multipliers.top}</div>
      <div>Middle ×${d.multipliers.middle}</div>
      <div>Bottom ×${d.multipliers.bottom}</div>
    </div>
    <div id="whyBox">
      💡 This play maximizes <b>expected value</b> given the current hand and active multipliers.
    </div>
  `;
}
