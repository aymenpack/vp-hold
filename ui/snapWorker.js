// ui/snapWorker.js
// One-shot worker: encode ImageBitmap → POST to backend → return JSON

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

self.onmessage = async (e) => {
  const {
    bitmap,
    workerUrl,     // MUST be absolute: https://xxx.up.railway.app/analyze
    paytable,
    mode
  } = e.data;

  try {
    // --- Encode bitmap to JPEG ---
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    // Free bitmap ASAP
    if (bitmap.close) bitmap.close();

    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.7   // slightly lower to reduce payload size
    });

    const ab = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(ab);

    // --- POST to backend ---
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        imageBase64: `data:image/jpeg;base64,${base64}`,
        paytable,
        mode
      })
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Backend returned non-JSON:\n${text.slice(0, 300)}`
      );
    }

    if (!res.ok) {
      throw new Error(
        `Backend error ${res.status}: ${JSON.stringify(data)}`
      );
    }

    self.postMessage({
      ok: true,
      data
    });

  } catch (err) {
    self.postMessage({
      ok: false,
      error: err?.message || String(err)
    });
  }
};
