// 🔒 LOCKED — SAFE SNAP CONTROLLER
// Prevents camera race conditions & second-snap failures

import { captureFromGreenFrame } from "./capture.js";

function waitForVideoReady(video, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const start = performance.now();

    function check() {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        resolve();
        return;
      }
      if (performance.now() - start > timeoutMs) {
        reject(new Error("Video not ready"));
        return;
      }
      requestAnimationFrame(check);
    }

    check();
  });
}

export async function safeSnap({ video, band, scanner }) {
  // 1️⃣ Ensure video frame is valid
  await waitForVideoReady(video);

  try {
    // 2️⃣ Attempt capture
    return await captureFromGreenFrame({ video, band, scanner });
  } catch (err) {
    // 3️⃣ One retry (very important)
    await new Promise(r => setTimeout(r, 120));
    await waitForVideoReady(video);
    return await captureFromGreenFrame({ video, band, scanner });
  }
}
