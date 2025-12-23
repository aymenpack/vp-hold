// net/workerClient.js
// 🔒 LOCKED — WORKER CLIENT (NETWORK HARDENED)
// Do not fetch directly from UI. Always call callWorkerJSON().

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_RETRIES = 2; // total attempts = 1 + retries

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // keepalive:false prevents some browsers from trying to keep connections around
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
      keepalive: false
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function readTextSafely(res) {
  // Always drain body so the browser can reuse the connection cleanly
  try {
    return await res.text();
  } catch (e) {
    // If body read fails, still return something useful
    return `<<failed to read body: ${e?.message || String(e)}>>`;
  }
}

function shouldRetry({ attempt, maxAttempts, err, status }) {
  if (attempt >= maxAttempts) return false;

  // Network errors in fetch usually surface as TypeError
  if (err) return true;

  // Retry a few server/transient statuses
  if ([429, 500, 502, 503, 504].includes(status)) return true;

  return false;
}

/**
 * callWorkerJSON(url, payload, { timeoutMs, retries })
 * Returns: { ok, status, data, raw }
 */
export async function callWorkerJSON(url, payload, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const maxAttempts = 1 + retries;

  let last = { ok: false, status: 0, data: null, raw: "" };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res, raw;

    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        },
        timeoutMs
      );

      raw = await readTextSafely(res);

      // Try JSON parse
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }

      last = { ok: res.ok && !!data, status: res.status, data, raw };

      if (last.ok) return last;

      // Decide retry on non-ok or non-json responses
      if (!shouldRetry({ attempt, maxAttempts, status: res.status })) {
        return last;
      }
    } catch (err) {
      // Network failure / aborted / load failed
      last = {
        ok: false,
        status: 0,
        data: null,
        raw: `Network error: ${err?.name || "Error"} - ${err?.message || String(err)}`
      };

      if (!shouldRetry({ attempt, maxAttempts, err })) {
        return last;
      }
    }

    // Exponential-ish backoff with tiny jitter
    const backoff = 250 * attempt + Math.floor(Math.random() * 150);
    await sleep(backoff);
  }

  return last;
}
