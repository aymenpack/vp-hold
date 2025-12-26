import { captureGreenFrame } from "../capture/capture.js";

function haptic(pattern){
  if (navigator.vibrate) navigator.vibrate(pattern);
}

export function wireSnapWorker({
  video,
  scanner,
  band,

  processingEl,   // 👈 NEW: overlay passed in

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

  function showProcessing(on){
    if (processingEl) {
      processingEl.style.display = on ? "flex" : "none";
    }
  }

  function showError(msg){
    if (!paytableErrorBox) return;
    paytableErrorBox.textContent = msg;
    paytableErrorBox.style.display = "block";
  }

  scanner.onclick = async () => {
    if (busy) return;
    busy = true;

    showError("");
    showProcessing(true);
    haptic(10);

    try {
      const imageBase64 = captureGreenFrame({ video, scanner, band });

      const body = {
        imageBase64,
        mode: modeSelect.value
      };

      const ptMode = paytableModeGetter?.() || "preset";

      if (ptMode === "custom") {
        const custom = paytableCustomGetter?.();
        if (!custom) throw new Error("Custom paytable incomplete");
        body.customPaytable = custom;
      } else {
        body.paytableKey = paytablePresetGetter?.() || "DDB_9_6";
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d?.message || "Analyze failed");

      /* ===== render ===== */
      welcomeBox && (welcomeBox.style.display = "none");
      evSection && (evSection.style.display = "block");
      multSection && (multSection.style.display = "block");

      if (evBaseValue) evBaseValue.textContent = d.ev_without_multiplier.toFixed(4);
      if (evUXValue)   evUXValue.textContent   = d.ev_with_multiplier.toFixed(4);

      /* cards */
      cardsBox.innerHTML = "";
      const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

      d.cards.forEach((c,i)=>{
        const el = document.createElement("div");
        el.className =
          "card" +
          (d.best_hold[i] ? " held" : "") +
          ((c.suit==="H"||c.suit==="D")?" red":"");
        el.innerHTML = `
          <div class="corner top">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
          <div class="pip">${SUIT[c.suit]}</div>
          <div class="corner bottom">${c.rank==="T"?"10":c.rank}<br>${SUIT[c.suit]}</div>
        `;
        cardsBox.appendChild(el);
      });

      whyBox && (whyBox.innerHTML = `
        <b>Why this hold?</b><br>
        This play maximizes expected value given the hand,
        paytable, and active Ultimate X multipliers.
      `);

      onSnapComplete?.();

    } catch (err) {
      console.error(err);
      showError(err.message || "Analysis failed");
    } finally {
      showProcessing(false);
      busy = false;
    }
  };
}
