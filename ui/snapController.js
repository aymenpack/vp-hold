// ui/snapController.js
// 🔒 SNAP CONTROLLER — DO NOT SPLIT / DO NOT WRAP

import { captureFromGreenFrame } from "../capture/capture.js";

if (window.__SNAP_CONTROLLER_LOADED__) {
  throw new Error("Snap controller loaded twice");
}
window.__SNAP_CONTROLLER_LOADED__ = true;

export function initSnapController({
  video,
  band,
  scanner,
  snapButton,
  workerUrl,
  paytableSelect,
  modeSelect,
  statusEl,
  debugEl,
  renderMultipliers,
  renderEVs,
  renderCards,
  explainHold
}) {
  let snapInProgress = false;

  snapButton.onclick = async () => {
    if (snapInProgress) return;
    snapInProgress = true;
    snapButton.disabled = true;

    try {
      statusEl.textContent = "Capturing…";

      const img = await captureFromGreenFrame({
        video,
        band,
        scanner
      });

      statusEl.textContent = "Sending to worker…";

      const res = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: img,
          paytable: paytableSelect.value,
          mode: modeSelect.value
        })
      });

      const data = await res.json();
      debugEl.textContent = JSON.stringify(data, null, 2);

      if (!res.ok) {
        statusEl.textContent = `Worker error (${res.status})`;
        return;
      }

      renderMultipliers(data.multipliers);
      renderEVs(
        data.ev_without_multiplier,
        data.ev_with_multiplier
      );
      renderCards(data.cards, data.best_hold);
      explainHold(
        data.multipliers.bottom,
        data.mode
      );

      statusEl.textContent = "Done ✅";
    } catch (e) {
      statusEl.textContent = "Client error";
      debugEl.textContent = e.stack || e.message;
    } finally {
      snapInProgress = false;
      snapButton.disabled = false;
    }
  };
}
