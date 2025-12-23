import { runVision } from "./vision/vision.js";
import { bestHoldEV } from "../strategy/ev.js";
import { PAYTABLES } from "../strategy/paytables.js";

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
      }

      const {
        imageBase64,
        paytable = "DDB_9_6",
        mode = "conservative"
      } = body || {};

      if (!imageBase64) {
        return jsonResponse({ error: "Missing imageBase64" }, 400, corsHeaders);
      }

      if (!env.OPENAI_API_KEY) {
        return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500, corsHeaders);
      }

      const pt = PAYTABLES[paytable];
      if (!pt) {
        return jsonResponse({ error: "Unknown paytable" }, 400, corsHeaders);
      }

      /* ===============================
         VISION (LOCKED)
         =============================== */
      const vision = await runVision({
        imageBase64,
        apiKey: env.OPENAI_API_KEY
      });

      // Normalize multipliers (null → 1)
      vision.multipliers = {
        top: vision?.multipliers?.top ?? 1,
        middle: vision?.multipliers?.middle ?? 1,
        bottom: vision?.multipliers?.bottom ?? 1
      };

      if (!Array.isArray(vision.cards) || vision.cards.length !== 5) {
        return jsonResponse(
          { error: "Vision returned invalid cards", vision },
          502,
          corsHeaders
        );
      }

      /* ===============================
         STRATEGY
         =============================== */
      const strategy = bestHoldEV(
        vision.cards,
        pt,
        vision.multipliers.bottom,
        paytable,
        mode
      );

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
      // IMPORTANT: always return JSON so the client can show real errors
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
