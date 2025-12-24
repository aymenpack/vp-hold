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
  onSnapComplete,
  onHaptic
}) {
  const API_URL = "https://vp-hold-production.up.railway.app/analyze";
  let busy = false;

  scanner.onclick = async () => {
    if (busy) return;
    busy = true;

    if (onHaptic) onHaptic("light");
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
      if (!d || !d.cards) return;

      renderResults(d);

      if (onSnapComplete) onSnapComplete();
      if (onHaptic) onHaptic("success");

    } catch (err) {
      console.error("Snap failed:", err);
    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };

  function renderResults(d) {
    multTop.textContent = "×" + d.multipliers.top;
    multMid.textContent = "×" + d.multipliers.middle;
    multBot.textContent = "×" + d.multipliers.bottom;

    evBase.textContent = d.ev_without_multiplier.toFixed(4);
    evUX.textContent   = d.ev_with_multiplier.toFixed(4);

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

    whyBox.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:18px">💡</span>
        <div>
          <b>Why this hold?</b><br>
          This play maximizes <b>expected value</b> given the
          current hand, paytable, and multipliers.
        </div>
      </div>
    `;
    whyBox.classList.add("show");
  }
}
