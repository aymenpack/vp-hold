/*
  ✏️ SAFE FILE
  UI interaction + rendering + camera collapse
*/

import { captureGreenFrame } from "../capture/capture.js";

export function wireSnapWorker({
  video,
  scanner,
  band,
  spinner,
  cardsBox,
  multTop,
  multMid,
  multBot,
  evBase,
  evUX,
  whyBox,
  modeSelect,
  onCollapseCamera
}){
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
        body:JSON.stringify({
          imageBase64,
          paytable: "DDB_9_6",
          mode: modeSelect?.value || "conservative"
        })
      });

      const d = await res.json();

      // collapse camera AFTER successful response
      if (typeof onCollapseCamera === "function") {
        onCollapseCamera();
      }

      renderResults(d);

    } catch (err) {
      console.error("Analyze failed:", err);
    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };

  function renderResults(d){
    if (!d || !d.cards || !d.best_hold) return;

    /* multipliers */
    multTop.textContent = "×" + d.multipliers.top;
    multMid.textContent = "×" + d.multipliers.middle;
    multBot.textContent = "×" + d.multipliers.bottom;

    /* EVs */
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

    /* extended WHY */
    whyBox.innerHTML = buildWhyExplanation(
      d.cards,
      d.best_hold,
      d.multipliers.bottom,
      modeSelect?.value || "conservative"
    );
    whyBox.classList.add("show");
  }

  function buildWhyExplanation(cards, hold, mult, mode){
    const held = cards.filter((_,i)=>hold[i]);
    const counts = {};
    held.forEach(c=>counts[c.rank]=(counts[c.rank]||0)+1);
    const vals = Object.values(counts);

    let reason = "";

    if (vals.includes(4)) {
      reason = `
        <b>Four of a Kind</b> is already made.
        In Double Double Bonus, quads dominate the EV table.
        Any draw would strictly reduce expected value.
      `;
    } else if (vals.includes(3)) {
      reason = `
        Holding <b>Three of a Kind</b> preserves strong
        <b>Full House</b> and <b>Four of a Kind</b> outs.
        Breaking trips sacrifices too much guaranteed value.
      `;
    } else if (vals.includes(2)) {
      reason = `
        A <b>pair</b> provides the highest baseline EV
        among all incomplete hands.
        Drawing to trips, two pair, and full house
        outperforms any speculative discard.
      `;
    } else if (mode === "aggressive") {
      reason = `
        In <b>Aggressive mode</b>, the strategy prioritizes
        future multiplier growth and high-variance outcomes.
        This increases long-term return at the cost of volatility.
      `;
    } else {
      reason = `
        This hold maximizes <b>expected value</b>
        given the current paytable and multiplier state.
        Alternative holds produce lower average return.
      `;
    }

    if (mult > 1) {
      reason += `
        <br><br>
        The active <b>${mult}× multiplier</b> further increases
        the value of made hands, reinforcing this choice.
      `;
    }

    return `
      <div style="font-weight:700;margin-bottom:6px">Why this hold?</div>
      <div style="color:#e5e7eb;line-height:1.45">${reason}</div>
    `;
  }
}
