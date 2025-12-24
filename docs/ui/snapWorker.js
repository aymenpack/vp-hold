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
  multTop,
  multMid,
  multBot,
  multTopBar,
  multMidBar,
  multBotBar,
  evBase,
  evUX,
  evBaseBar,
  evUXBar,
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
    /* ===== EV NUMBERS ===== */
    const baseEV = d.ev_without_multiplier;
    const uxEV   = d.ev_with_multiplier;

    evBase.textContent = baseEV.toFixed(4);
    evUX.textContent   = uxEV.toFixed(4);

    const maxEV = Math.max(baseEV, uxEV, 0.0001);
    evBaseBar.style.width = (baseEV / maxEV * 100) + "%";
    evUXBar.style.width   = (uxEV   / maxEV * 100) + "%";

    /* ===== MULTIPLIERS ===== */
    const maxMult = Math.max(
      d.multipliers.top,
      d.multipliers.middle,
      d.multipliers.bottom,
      1
    );

    multTop.textContent = "×" + d.multipliers.top;
    multMid.textContent = "×" + d.multipliers.middle;
    multBot.textContent = "×" + d.multipliers.bottom;

    multTopBar.style.width = (d.multipliers.top    / maxMult * 100) + "%";
    multMidBar.style.width = (d.multipliers.middle / maxMult * 100) + "%";
    multBotBar.style.width = (d.multipliers.bottom / maxMult * 100) + "%";

    /* ===== CARDS ===== */
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

    /* ===== WHY ===== */
    whyBox.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:18px">💡</span>
        <div>
          <b>Why this hold?</b><br>
          This play maximizes <b>expected value</b> given the current hand,
          the paytable, and the active multipliers.
        </div>
      </div>
    `;
    whyBox.classList.add("show");
  }
}
