/*
  ✏️ SAFE FILE
  Handles snap interaction, rendering, and camera collapse
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
          mode: "conservative"
        })
      });

      const data = await res.json();

      if (!data || !data.cards || !data.best_hold) {
        console.warn("Invalid response from backend", data);
        return;
      }

      renderResults(data);

      // 🔥 collapse camera after successful snap
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
    /* multipliers */
    multTop.textContent = "×" + d.multipliers.top;
    multMid.textContent = "×" + d.multipliers.middle;
    multBot.textContent = "×" + d.multipliers.bottom;

    /* EVs */
    evBase.textContent = d.ev_without_multiplier.toFixed(4);
    evUX.textContent   = d.ev_with_multiplier.toFixed(4);

    /* cards */
    cardsBox.innerHTML = "";
    const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };

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

    /* extended WHY explanation */
    whyBox.innerHTML = buildWhyExplanation(
      d.cards,
      d.best_hold,
      d.multipliers.bottom
    );
    whyBox.classList.add("show");
  }

  function buildWhyExplanation(cards, hold, multiplier) {
    const held = cards.filter((_, i) => hold[i]);
    const counts = {};
    held.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);
    const values = Object.values(counts);

    let explanation = "";

    if (values.includes(4)) {
      explanation = `
        <b>Four of a Kind</b> is already complete.
        In Double Double Bonus, quads dominate the EV table.
        Any draw would strictly reduce expected value.
      `;
    } else if (values.includes(3)) {
      explanation = `
        Holding <b>Three of a Kind</b> preserves strong
        <b>Full House</b> and <b>Four of a Kind</b> outs.
        Breaking trips sacrifices too much guaranteed value.
      `;
    } else if (values.includes(2)) {
      explanation = `
        A <b>pair</b> provides the highest baseline EV
        among all incomplete hands.
        Drawing to trips, two pair, and full house
        outperforms any speculative discard.
      `;
    } else {
      explanation = `
        This hold maximizes <b>expected value</b>
        based on the current paytable and visible multipliers.
        Alternative holds produce lower average return.
      `;
    }

    if (multiplier > 1) {
      explanation += `
        <br><br>
        The active <b>${multiplier}× multiplier</b>
        further increases the value of made hands,
        reinforcing this choice.
      `;
    }

    return `
      <div style="font-weight:800;margin-bottom:8px">
        Why this hold?
      </div>
      <div style="color:#e5e7eb;line-height:1.5">
        ${explanation}
      </div>
    `;
  }
}
