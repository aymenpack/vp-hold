/*
  ✏️ SAFE FILE
  UI rendering + interaction logic
*/

import { captureGreenFrame } from "../capture/capture.js";

export function wireSnapWorker({
  video,
  scanner,
  band,
  spinner,
  previewImg,
  cardsBox,
  multTop,
  multMid,
  multBot,
  evBase,
  evUX,
  whyBox,
  modeSelect,
  debugSelect
}){
  const API_URL = "https://vp-hold-production.up.railway.app/analyze";
  let busy = false;

  scanner.onclick = async () => {
    if (busy) return;
    busy = true;
    spinner.style.display = "block";

    try{
      const imageBase64 = captureGreenFrame({ video, scanner, band });

      if (debugSelect?.value === "on" && previewImg) {
        previewImg.src = imageBase64;
        previewImg.style.display = "block";
      }

      const res = await fetch(API_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({
          imageBase64,
          mode: modeSelect?.value || "conservative"
        })
      });

      const d = await res.json();
      renderResults(d);

    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };

  function renderResults(d){
    /* multipliers */
    multTop.textContent = "×" + d.multipliers.top;
    multMid.textContent = "×" + d.multipliers.middle;
    multBot.textContent = "×" + d.multipliers.bottom;

    /* EV */
    evBase.textContent = d.ev_without_multiplier.toFixed(4);
    evUX.textContent   = d.ev_with_multiplier.toFixed(4);

    /* cards */
    cardsBox.innerHTML = "";
    const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

    d.cards.forEach((c,i)=>{
      const el = document.createElement("div");
      el.className =
        "card" +
        (d.best_hold[i] ? " held" : "") +
        ((c.suit==="H"||c.suit==="D") ? " red" : "");

      el.innerHTML = `
        <div class="corner top">${c.rank}<br>${SUIT[c.suit]}</div>
        <div class="pip">${SUIT[c.suit]}</div>
        <div class="corner bottom">${c.rank}<br>${SUIT[c.suit]}</div>
      `;
      cardsBox.appendChild(el);
    });

    cardsBox.classList.add("show");

    /* why */
    whyBox.textContent = explainHold(
      d.cards,
      d.best_hold,
      d.multipliers.bottom,
      modeSelect?.value || "conservative"
    );
    whyBox.classList.add("show");
  }

  function explainHold(cards, hold, mult, mode){
    const counts = {};
    cards.forEach((c,i)=>{
      if (hold[i]) counts[c.rank] = (counts[c.rank]||0)+1;
    });
    const vals = Object.values(counts);

    if (vals.includes(4)) return "Four of a kind locks the highest payout.";
    if (vals.includes(3)) return "Trips maximize full house and quad potential.";
    if (vals.includes(2)) return "Holding a pair maximizes expected value.";
    if (mode==="aggressive") return "Aggressive mode favors multiplier growth.";
    return "Highest expected value play.";
  }
}
