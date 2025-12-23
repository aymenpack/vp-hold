// ui/snapController.js
// 🔒 SNAP CONTROLLER — SINGLE SOURCE OF TRUTH
// Owns snap lifecycle + robust network call
// DO NOT add snap.onclick anywhere else

import { captureFromGreenFrame } from "../capture/capture.js";

/* ===============================
   SINGLETON GUARD
   =============================== */
if (window.__SNAP_CONTROLLER_LOADED__) {
  throw new Error("Snap controller loaded twice");
}
window.__SNAP_CONTROLLER_LOADED__ = true;

/* ===============================
   NETWORK HELPERS (LOCKED)
   =============================== */

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
      keepalive: false
    });
  } finally {
    clearTimeout(t);
  }
}

async function readJsonOrText(res) {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text), raw: text };
  } catch {
    return { ok: res.ok, status: res.status, data: null, raw: text };
  }
}

function isNetworkLoadFailed(err) {
  const msg = (err?.message || "").toLowerCase();
  // Safari/Firefox/Chrome variations
  return (
    err?.name === "TypeError" ||
    msg.includes("load failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror")
  );
}

function withReqId(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "req=" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

/* ===============================
   SNAP INITIALIZER
   =============================== */

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

    const REQUEST_TIMEOUT_MS = 45000;

    try {
      statusEl.textContent = "Capturing…";

      const img = await captureFromGreenFrame({
        video,
        band,
        scanner
      });

      const payload = {
        imageBase64: img,
        paytable: paytableSelect.value,
        mode: modeSelect.value
      };

      // 1) Attempt
      statusEl.textContent = "Sending to worker…";
      let res;
      try {
        res = await fetchWithTimeout(
          withReqId(workerUrl),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          },
          REQUEST_TIMEOUT_MS
        );
      } catch (err) {
        // 2) One retry only on network load-failed
        if (!isNetworkLoadFailed(err)) throw err;

        statusEl.textContent = "Retrying…";
        await new Promise(r => setTimeout(r, 250));

        res = await fetchWithTimeout(
          withReqId(workerUrl),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          },
          REQUEST_TIMEOUT_MS
        );
      }

      const parsed = await readJsonOrText(res);

      // Always show useful debug
      debugEl.textContent = parsed.data
        ? JSON.stringify(parsed.data, null, 2)
        : `HTTP ${parsed.status}\n\n${(parsed.raw || "").slice(0, 2000)}`;

      if (!parsed.ok || !parsed.data) {
        statusEl.textContent = `Worker error (HTTP ${parsed.status})`;
        return;
      }

      const data = parsed.data;

      renderMultipliers(data.multipliers);
      renderEVs(data.ev_without_multiplier, data.ev_with_multiplier);
      renderCards(data.cards, data.best_hold);
      explainHold(data.multipliers.bottom, data.mode);

      statusEl.textContent = "Done ✅";
    } catch (e) {
      const msg =
        e?.name === "AbortError"
          ? `Timeout after ${REQUEST_TIMEOUT_MS / 1000}s`
          : (e?.message || String(e));

      statusEl.textContent = "Client error";
      debugEl.textContent = msg + (e?.stack ? "\n\n" + e.stack : "");
    } finally {
      snapInProgress = false;
      snapButton.disabled = false;
    }
  };
}
