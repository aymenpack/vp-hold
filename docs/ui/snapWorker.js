/*
  SAFE FILE
  Snap handling + result rendering
*/

import { captureGreenFrame } from "../capture/capture.js";

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
  modeSelect,
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

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          imageBase64,
          paytable: "DDB_9_6",
          mode: modeSelect?.value || "conservative"
        })
      });

      const d = await res.json();
      if (!d || !d.cards) return;

      renderResults(d);
      if (onSnapComplete) onSnapComplete();

    } catch (err) {
      console.error("Snap failed:", err);
    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };

  function renderResults(d) {
    /* show sections */
    welcomeBox.style.display = "none";
    evSection.style.display = "block";
    multSection.style.display = "block";

    /* EV (continuous) */
    const baseEV = d.ev_without_multiplier;
    const uxEV   = d.ev_with_multiplier;
    const maxEV  = Math.max(baseEV, uxEV, 0.0001);

    evBaseValue.textContent = baseEV.toFixed(4);
    evUXValue.textContent   = uxEV.toFixed(4);

    evBaseBar.style.width = (baseEV / maxEV * 100) + "%";
    evUXBar.style.width   = (uxEV   / maxEV * 100) + "%";

    /* multipliers (1–12 discrete) */
    multTopValue.textContent = "×" + d.multipliers.top;
    multMidValue.textContent = "×" + d.multipliers.middle;
    multBotValue.textContent = "×" + d.multipliers.bottom;

    fillMultiplier(multTopCells, d.multipliers.top);
    fillMultiplier(multMidCells, d.multipliers.middle);
    fillMultiplier(multBotCells, d.multipliers.bottom);

    /* cards */
    cardsBox.innerHTML = "";
    const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

    d.cards.forEach((c, i) => {
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
    whyBox.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:18px">💡</span>
        <div>
          <b>Why this hold?</b><br>
          This play maximizes <b>expected value</b>, meaning it produces
          the best long-term return given the current hand,
          paytable, and active multipliers.
        </div>
      </div>
    `;
    whyBox.classList.add("show");
  }

  function fillMultiplier(cells, value){
    cells.forEach((c,i)=>{
      c.className = "multCell";
      if (i < value) c.classList.add(colorFor(i+1));
    });
  }

  function colorFor(v){
    if (v <= 3) return "g";
    if (v <= 6) return "y";
    if (v <= 9) return "o";
    return "r";
  }
}
