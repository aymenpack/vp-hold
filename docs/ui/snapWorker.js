import { captureGreenFrame } from "../capture/capture.js";

export function wireSnapWorker({
  video,
  scanner,
  band,
  spinner,
  cardsBox,
  evBase,
  evUX,
  evBaseBar,
  evUXBar,
  multTop,
  multMid,
  multBot,
  multTopCells,
  multMidCells,
  multBotCells,
  whyBox,
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 })
      });

      const d = await res.json();
      if (!d || !d.cards) throw new Error("Invalid response");

      // EV
      const base = d.ev_without_multiplier;
      const ux   = d.ev_with_multiplier;
      const max  = Math.max(base, ux, 0.0001);

      evBase.textContent = base.toFixed(4);
      evUX.textContent   = ux.toFixed(4);
      evBaseBar.style.width = (base / max * 100) + "%";
      evUXBar.style.width   = (ux   / max * 100) + "%";

      // Multipliers
      multTop.textContent = "×" + d.multipliers.top;
      multMid.textContent = "×" + d.multipliers.middle;
      multBot.textContent = "×" + d.multipliers.bottom;

      fill(multTopCells, d.multipliers.top);
      fill(multMidCells, d.multipliers.middle);
      fill(multBotCells, d.multipliers.bottom);

      // Cards
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

      // WHY
      whyBox.innerHTML = `
        <b>Why this hold?</b><br>
        This choice maximizes expected value for the current hand
        given the active multipliers.
      `;

      onSnapComplete();

    } catch (err) {
      console.error("Snap failed:", err);
    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  });

  function fill(cells, n){
    cells.forEach((c,i)=>{
      c.className = "multCell";
      if (i < n) c.classList.add("g");
    });
  }
}
