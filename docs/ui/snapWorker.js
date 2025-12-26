import { captureGreenFrame } from "../capture/capture.js";

/* -------------------- helpers -------------------- */

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
  cells.forEach(c => c.className = "multCell");
  const nn = Math.max(0, Math.min(12, Number(n) || 0));
  cells.slice(0, nn).forEach((c, i) => {
    setTimeout(() => {
      c.classList.add(
        i < 3 ? "g" :
        i < 6 ? "y" :
        i < 9 ? "o" : "r"
      );
    }, i * 40);
  });
}

/* -------------------- main -------------------- */

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

  paytableModeGetter,
  paytablePresetGetter,
  paytableCustomGetter,
  paytableErrorBox,

  onSnapComplete
}) {
  const API_URL = "https://vp-hold-production.up.railway.app/analyze";
  let busy = false;

  function showPTError(msg){
    if (!paytableErrorBox) return;
    paytableErrorBox.textContent = msg || "";
    paytableErrorBox.style.display = msg ? "block" : "none";
  }

  function setProcessing(on){
    spinner.style.display = on ? "block" : "none";
    scanner.style.pointerEvents = on ? "none" : "auto";
  }

  /* 🔒 CLICK ONLY */
  scanner.onclick = async () => {
    if (busy) return;
    busy = true;

    showPTError("");
    setProcessing(true);
    haptic(10);

    try {
      /* ---------- capture ---------- */
      const imageBase64 = captureGreenFrame({ video, scanner, band });
      haptic(20);

      /* ---------- paytable ---------- */
      const ptMode = paytableModeGetter ? paytableModeGetter() : "preset";
      const body = {
        imageBase64,
        mode: modeSelect.value
      };

      if (ptMode === "custom") {
        const custom = paytableCustomGetter ? paytableCustomGetter() : null;
        if (!custom) {
          throw new Error("Custom paytable is incomplete.");
        }
        body.customPaytable = custom;
      } else {
        body.paytableKey = paytablePresetGetter
          ? paytablePresetGetter()
          : "DDB_9_6";
      }

      /* ---------- backend ---------- */
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const d = await res.json();
      if (!res.ok) {
        throw new Error(d?.message || d?.error || "Analysis failed");
      }

      /* ---------- UI reveal ---------- */
      welcomeBox.style.display = "none";
      evSection.style.display = "block";
      multSection.style.display = "block";

      /* ---------- EV ---------- */
      const baseEV = Number(d.ev_without_multiplier);
      const uxEV   = Number(d.ev_with_multiplier);
      const maxEV  = Math.max(baseEV, uxEV, 0.0001);

      evBaseValue.textContent = baseEV.toFixed(4);
      evUXValue.textContent   = uxEV.toFixed(4);

      animateBar(evBaseBar, (baseEV / maxEV) * 100);
      animateBar(evUXBar,   (uxEV   / maxEV) * 100);

      /* ---------- multipliers ---------- */
      multTopValue.textContent = "×" + d.multipliers.top;
      multMidValue.textContent = "×" + d.multipliers.middle;
      multBotValue.textContent = "×" + d.multipliers.bottom;

      animateMult(multTopCells, d.multipliers.top);
      animateMult(multMidCells, d.multipliers.middle);
      animateMult(multBotCells, d.multipliers.bottom);

      /* ---------- cards ---------- */
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

      if (d.best_hold.some(Boolean)) {
        haptic([15,15,15]);
      }

      /* ---------- explanation ---------- */
      whyBox.innerHTML = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:18px">💡</span>
          <div>
            <b>Why this hold?</b><br>
            This play maximizes <b>expected value</b> given the hand,
            paytable, and active Ultimate X multipliers.
          </div>
        </div>
      `;

      haptic(30);
      onSnapComplete();

    } catch (err) {
      console.error("❌ Analyze failed:", err);
      showPTError(err.message || "Analysis failed");
    } finally {
      setProcessing(false);
      busy = false;
    }
  };
}
