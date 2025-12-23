// ui/snapWorker.js
// 🔒 Worker owns: JPEG encoding + base64 + fetch
// FINAL version — stable for repeated snaps

const DEFAULT_TIMEOUT_MS = 45000;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function withReqId(url) {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "req=" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await self.fetch(url, {
      ...options,
      mode: "cors",
      cache: "no-store",
      keepalive: false,
      signal: controller.signal
    });
  } finally {
    clearTimeout(t);
  }
}

self.onmessage = async (evt) => {
  const { id, bitmap, workerUrl, paytable, mode, jpegQuality = 0.85 } = evt.data;

  try {
    // 1) Encode ImageBitmap -> JPEG
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    if (bitmap.close) bitmap.close();

    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: jpegQuality
    });

    const ab = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(ab);
    const imageBase64 = `data:image/jpeg;base64,${base64}`;

    // 2) POST JSON to Cloudflare Worker
    const res = await fetchWithTimeout(
      withReqId(workerUrl), // 👈 CRITICAL
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          paytable,
          mode
        })
      },
      DEFAULT_TIMEOUT_MS
    );

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    self.postMessage({
      id,
      ok: res.ok && !!data,
      status: res.status,
      data,
      raw: data ? null : text.slice(0, 2000)
    });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      status: 0,
      data: null,
      raw: `Worker fetch error: ${err?.message || String(err)}`
    });
  }
};
