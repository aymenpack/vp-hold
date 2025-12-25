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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          paytable: "DDB_9_6",
          mode: modeSelect.value
        })
      });

      const d = await res.json();
      if (!d || !d.cards || !d.best_hold) return;

      /* ===== SHOW RESULT SECTIONS ===== */
      welcomeBox.style.display = "none";
      evSection.style.display = "block";
      multSection.style.display = "block";

      /* ===== EV ===== */
      const baseEV = d.ev_without_multiplier;
      const uxEV   = d.ev_with_multiplier;
      const maxEV  = Math.max(baseEV, uxEV, 0.0001);

      evBaseValue.textContent = baseEV.toFixed(4);
      evUXValue.textContent   = uxEV.toFixed(4);
      evBaseBar.style.width = (baseEV / maxEV * 100) + "%";
      evUXBar.style.width   = (uxEV   / maxEV * 100) + "%";

      /* ===== MULTIPLIERS (1–12 boxes) ===== */
      multTopValue.textContent = "×" + d.multipliers.top;
      multMidValue.textContent = "×" + d.multipliers.middle;
      multBotValue.textContent = "×" + d.multipliers.bottom;

      fill(multTopCells, d.multipliers.top);
      fill(multMidCells, d.multipliers.middle);
      fill(multBotCells, d.multipliers.bottom);

      /* ===== CARDS ===== */
      cardsBox.innerHTML = "";
      const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };

      d.cards.forEach((c, i) => {
        const rank = c.rank === "T" ? "10" : c.rank;

        const el = document.createElement("div");
        el.className =
          "card" +
          (d.best_hold[i] ? " held" : "") +
          ((c.suit === "H" || c.suit === "D") ? " red" : "");

        el.innerHTML = `
          <div class="corner top">${rank}<br>${SUIT[c.suit]}</div>
          <div class="pip">${SUIT[c.suit]}</div>
          <div class="corner bottom">${rank}<br>${SUIT[c.suit]}</div>
        `;
        cardsBox.appendChild(el);
      });

      /* ===== WHY ===== */
      whyBox.innerHTML = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:18px">💡</span>
          <div>
            <b>Why this hold?</b><br>
            This play maximizes <b>expected value</b> for the current hand,
            given the paytable and the active Ultimate X multipliers.
          </div>
        </div>
      `;

      if (onSnapComplete) onSnapComplete();

    } catch (err) {
      console.error("Snap failed:", err);
    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };

  /* ===== MULTIPLIER FILL HELPERS ===== */
  function fill(cells, n) {
    cells.forEach((c, i) => {
      c.className = "multCell";
      if (i < n) {
        c.classList.add(
          i < 3 ? "g" :
          i < 6 ? "y" :
          i < 9 ? "o" : "r"
        );
      }
    });
  }
}
