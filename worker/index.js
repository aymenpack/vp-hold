import { runVision } from "./vision/vision.js";
import { bestHoldEV } from "../strategy/ev.js";
import { PAYTABLES } from "../strategy/paytables.js";

/* ===============================
   HELPERS
   =============================== */

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/* ===============================
   WORKER
   =============================== */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };

    try {
      /* ---------- CORS ---------- */
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
      }

      if (!env.OPENAI_API_KEY) {
        return jsonResponse(
          { error: "OPENAI_API_KEY not configured" },
          500,
          corsHeaders
        );
      }

      /* ===============================
         READ multipart/form-data
         =============================== */

      const form = await request.formData();

      const file = form.get("image");
      if (!(file instanceof Blob)) {
        return jsonResponse(
          { error: "Missing image file" },
          400,
          corsHeaders
        );
      }

      const paytableKey = form.get("paytable") || "DDB_9_6";
      const mode = form.get("mode") || "conservative";

      const pt = PAYTABLES[paytableKey];
      if (!pt) {
        return jsonResponse(
          { error: "Unknown paytable" },
          400,
          corsHeaders
        );
      }

      /* ===============================
         Convert Blob → base64 Data URL
         =============================== */

      const arrayBuffer = await file.arrayBuffer();
      const base64 =
        "data:image/jpeg;base64," +
        arrayBufferToBase64(arrayBuffer);

      /* ===============================
         VISION (LOCKED)
         =============================== */

      const vision = await runVision({
        imageBase64: base64,
        apiKey: env.OPENAI_API_KEY
      });

      if (!vision || vision.error) {
        return jsonResponse(
          {
            error: "Vision failed",
            details: vision?.message || "Unknown vision error"
          },
          502,
          corsHeaders
        );
      }

      // Normalize multipliers (null → 1)
      vision.multipliers = {
        top: vision.multipliers?.top ?? 1,
        middle: vision.multipliers?.middle ?? 1,
        bottom: vision.multipliers?.bottom ?? 1
      };

      if (!Array.isArray(vision.cards) || vision.cards.length !== 5) {
        return jsonResponse(
          {
            error: "Vision returned invalid cards",
            vision
          },
          502,
          corsHeaders
        );
      }

      /* ===============================
         STRATEGY (ULTIMATE X)
         =============================== */

      const strategy = bestHoldEV(
        vision.cards,
        pt,
        vision.multipliers.bottom,
        paytableKey,
        mode
      );

      /* ===============================
         RESPONSE
         =============================== */

      return jsonResponse(
        {
          paytable: pt.name,
          multipliers: vision.multipliers,
          cards: vision.cards,
          best_hold: strategy.best_hold,
          ev_with_multiplier: strategy.ev_with_multiplier,
          ev_without_multiplier: strategy.ev_without_multiplier,
          mode: strategy.mode
        },
        200,
        corsHeaders
      );

    } catch (err) {
      return jsonResponse(
        {
          error: "Worker exception",
          message: err?.message || String(err),
          stack: err?.stack || null
        },
        500,
        {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      );
    }
  }
};
