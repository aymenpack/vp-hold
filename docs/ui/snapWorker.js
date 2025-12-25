import { captureGreenFrame } from "../capture/capture.js";

function haptic(pattern){
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function animateBar(el, targetPercent, duration = 450){
  el.style.width = "0%";
  const start = performance.now();

  function step(now){
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.style.width = (eased * targetPercent) + "%";
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function animateMult(cells, n){
  // reset
  cells.forEach(c => c.className = "multCell");

  cells.slice(0, n).forEach((c, i) => {
    setTimeout(() => {
      c.classList.add(
        i < 3 ? "g" :
        i < 6 ? "y" :
        i < 9 ? "o" : "r"
      );
    }, i * 40);
  });
}

export function wireSnapWorker({
  video,
  scanner,
  band,
  spinner,
  cardsBox,

  evSection,
  multSection,

  whyBox,
  welcomeBox,
  modeSelect,
  makeCells,
  onSnapComplete
}) {
  const API_URL = "https://vp-hold-production.up.railway.app/analyze";
  let busy = false;

  scanner.onclick = async () => {
    if (busy) return;
    busy = true;

    haptic(10);
    spinner.style.display = "block";

    try {
      const imageBase64 = captureGreenFrame({ video, scanner, band });
      haptic(20);

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          imageBase64,
          paytable: "DDB_9_6",
          mode: modeSelect.value
        })
      });

      const d = await res.json();
      if (!d || !d.cards || !d.best_hold) return;

      // Hide welcome + show sections by filling them
      welcomeBox.style.display = "none";

      /* ===== EV SECTION (build HTML fresh each time) ===== */
      evSection.innerHTML = `
        <div class="evRow">
          <div class="evLabel">Base EV</div>
          <div class="evTrack"><div class="evFill base" id="evBaseBar"></div></div>
          <div class="evValue" id="evBase">—</div>
        </div>
        <div class="evRow">
          <div class="evLabel">Ultimate X EV</div>
          <div class="evTrack"><div class="evFill ux" id="evUXBar"></div></div>
          <div class="evValue" id="evUX">—</div>
        </div>
      `;

      const evBaseValue = evSection.querySelector("#evBase");
      const evUXValue   = evSection.querySelector("#evUX");
      const evBaseBar   = evSection.querySelector("#evBaseBar");
      const evUXBar     = evSection.querySelector("#evUXBar");

      const baseEV = d.ev_without_multiplier;
      const uxEV   = d.ev_with_multiplier;
      const maxEV  = Math.max(baseEV, uxEV, 0.0001);

      evBaseValue.textContent = baseEV.toFixed(4);
      evUXValue.textContent   = uxEV.toFixed(4);

      animateBar(evBaseBar, (baseEV / maxEV) * 100);
      animateBar(evUXBar,   (uxEV   / maxEV) * 100);

      /* ===== MULTIPLIERS SECTION (build rows + cells) ===== */
      multSection.innerHTML = `
        <div class="multRow">
          <div class="multLabel">Top</div>
          <div class="multCells" id="mTopCells"></div>
          <div class="multValue" id="mTopVal">—</div>
        </div>
        <div class="multRow">
          <div class="multLabel">Middle</div>
          <div class="multCells" id="mMidCells"></div>
          <div class="multValue" id="mMidVal">—</div>
        </div>
        <div class="multRow">
          <div class="multLabel">Bottom</div>
          <div class="multCells" id="mBotCells"></div>
          <div class="multValue" id="mBotVal">—</div>
        </div>
      `;

      const topCellsWrap = multSection.querySelector("#mTopCells");
      const midCellsWrap = multSection.querySelector("#mMidCells");
      const botCellsWrap = multSection.querySelector("#mBotCells");

      const topVal = multSection.querySelector("#mTopVal");
      const midVal = multSection.querySelector("#mMidVal");
      const botVal = multSection.querySelector("#mBotVal");

      const topCells = makeCells();
      const midCells = makeCells();
      const botCells = makeCells();

      topCells.forEach(x => topCellsWrap.appendChild(x));
      midCells.forEach(x => midCellsWrap.appendChild(x));
      botCells.forEach(x => botCellsWrap.appendChild(x));

      topVal.textContent = "×" + d.multipliers.top;
      midVal.textContent = "×" + d.multipliers.middle;
      botVal.textContent = "×" + d.multipliers.bottom;

      animateMult(topCells, d.multipliers.top);
      animateMult(midCells, d.multipliers.middle);
      animateMult(botCells, d.multipliers.bottom);

      /* ===== CARDS ===== */
      cardsBox.innerHTML = "";
      const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

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

      if (d.best_hold.some(Boolean)) haptic([15,15,15]);

      /* ===== WHY ===== */
      whyBox.innerHTML = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:18px">💡</span>
          <div>
            <b>Why this hold?</b><br>
            This play maximizes <b>expected value</b> given the current hand,
            the paytable, and the active Ultimate X multipliers.
          </div>
        </div>
      `;

      haptic(30);
      onSnapComplete();

    } catch (err) {
      console.error("Snap failed:", err);
    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };
}
