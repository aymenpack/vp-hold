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

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    const body = await request.json();
    const { imageBase64, paytable = "DDB_9_6", mode = "conservative" } = body;

    const pt = PAYTABLES[paytable];
    if (!pt) {
      return jsonResponse({ error: "Unknown paytable" }, 400, corsHeaders);
    }

    const vision = await runVision({
      imageBase64,
      apiKey: env.OPENAI_API_KEY
    });

    vision.multipliers = {
      top: vision.multipliers?.top ?? 1,
      middle: vision.multipliers?.middle ?? 1,
      bottom: vision.multipliers?.bottom ?? 1
    };

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
        mode
      },
      200,
      corsHeaders
    );
  }
};
