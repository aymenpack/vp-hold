import { runVision } from "./vision/vision.js";
import { bestHoldEV } from "../strategy/ev.js";
import { PAYTABLES } from "../strategy/paytables.js";

export default {
  async fetch(request, env) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: corsHeaders }
      );
    }

    const { imageBase64, paytable = "DDB_9_6" } = await request.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: corsHeaders }
      );
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
      top: vision.multipliers.top ?? 1,
      middle: vision.multipliers.middle ?? 1,
      bottom: vision.multipliers.bottom ?? 1
    };

    const pt = PAYTABLES[paytable];
    if (!pt) {
      return new Response(
        JSON.stringify({ error: "Unknown paytable" }),
        { status: 400, headers: corsHeaders }
      );
    }

    /* ===============================
       STRATEGY (ULTIMATE X)
       =============================== */
    const strategy = bestHoldEV(
      vision.cards,
      pt,
      vision.multipliers.bottom, // Ultimate X multiplier
      paytable
    );

    return new Response(
      JSON.stringify({
        paytable: pt.name,
        multipliers: vision.multipliers,
        cards: vision.cards,
        best_hold: strategy.best_hold,
        ev_best: strategy.ev_best
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
};
