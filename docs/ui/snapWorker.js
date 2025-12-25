import { captureGreenFrame } from "../capture/capture.js";

/* Haptics helper */
function haptic(pattern){
  if (navigator.vibrate) navigator.vibrate(pattern);
}

/* Animate EV bars */
function animateBar(el, targetPercent, duration = 450){
  el.style.width = "0%";
  const start = performance.now();

  function step(now){
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out
    el.style.width = (eased * targetPercent) + "%";
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* Animate multiplier cells */
function animateMult(cells, n){
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

  /* 🔒 CLICK ONLY — NO TOUCH / POINTER */
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          paytable: "DDB_9_6",
          mode: modeSelect.value
        })
      });

      const d = await res.json();
      if (!d || !d.cards || !d.best_hold) return;

      /* Hide welcome, show result sections */
      welcomeBox.style.display = "none";
      evSection.style.display = "block";
      multSection.style.display = "block";

      /* ===== EV ===== */
      const baseEV = d.ev_without_multiplier;
      const uxEV   = d.ev_with_multiplier;
      const maxEV  = Math.max(baseEV, uxEV, 0.0001);

      evBaseValue.textContent = baseEV.toFixed(4);
      evUXValue.textContent   = uxEV.toFixed(4);

      animateBar(evBaseBar, (baseEV / maxEV) * 100);
      animateBar(evUXBar,   (uxEV   / maxEV) * 100);

      /* ===== MULTIPLIERS ===== */
      multTopValue.textContent = "×" + d.multipliers.top;
      multMidValue.textContent = "×" + d.multipliers.middle;
      multBotValue.textContent = "×" + d.multipliers.bottom;

      animateMult(multTopCells, d.multipliers.top);
      animateMult(multMidCells, d.multipliers.middle);
      animateMult(multBotCells, d.multipliers.bottom);

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

      /* HOLD emphasis */
      if (d.best_hold.some(Boolean)) {
        haptic([15, 15, 15]);
      }

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
