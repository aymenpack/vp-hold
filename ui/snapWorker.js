// ui/snapWorker.js
// 🔒 One-shot worker: encode + fetch once, then die

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

self.onmessage = async (evt) => {
  const { bitmap, workerUrl, paytable, mode, jpegQuality = 0.85 } = evt.data;

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: jpegQuality
    });

    const ab = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(ab);

    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: `data:image/jpeg;base64,${base64}`,
        paytable,
        mode
      })
    });

    const text = await res.text();
    const data = JSON.parse(text);

    self.postMessage({ ok: true, data });
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err?.message || String(err)
    });
  }
};
