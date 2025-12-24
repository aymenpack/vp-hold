/*
  ✏️ SAFE FILE
  Snap handling + result rendering
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          paytable: "DDB_9_6",
          mode: modeSelect?.value || "conservative"
        })
      });

      const d = await res.json();
      if (!d || !d.cards || !d.best_hold) return;

      renderResults(d);

      // ✅ notify UI AFTER render
      if (typeof onSnapComplete === "function") {
        onSnapComplete();
      }

    } catch (err) {
      console.error("Snap failed:", err);
    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };

  function renderResults(d) {
    // multipliers
    multTop.textContent = "×" + d.multipliers.top;
    multMid.textContent = "×" + d.multipliers.middle;
    multBot.textContent = "×" + d.multipliers.bottom;

    // EVs
    evBase.textContent = d.ev_without_multiplier.toFixed(4);
    evUX.textContent   = d.ev_with_multiplier.toFixed(4);

    // cards
    cardsBox.innerHTML = "";
    const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

    d.cards.forEach((c, i) => {
      const el = document.createElement("div");
      el.className =
        "card" +
        (d.best_hold[i] ? " held" : "") +
        ((c.suit === "H" || c.suit === "D") ? " red" : "");

      el.innerHTML = `
        <div class="corner top">${c.rank}<br>${SUIT[c.suit]}</div>
        <div class="pip">${SUIT[c.suit]}</div>
        <div class="corner bottom">${c.rank}<br>${SUIT[c.suit]}</div>
      `;
      cardsBox.appendChild(el);
    });

    cardsBox.classList.add("show");

    // extended WHY
    whyBox.innerHTML = `
      <div style="font-weight:800;margin-bottom:8px">Why this hold?</div>
      <div style="line-height:1.5">
        This choice maximizes <b>expected value</b> given the current hand,
        paytable, and active multipliers.  
        Holding these cards preserves the strongest payout paths
        while avoiding lower-EV speculative draws.
      </div>
    `;
    whyBox.classList.add("show");
  }
}
