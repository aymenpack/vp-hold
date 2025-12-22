import { runVision } from "./vision/vision.js";
import { bestHoldEV } from "./strategy/ev.js";
import { PAYTABLES } from "./strategy/paytables.js";

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

    const { imageBase64, paytable = "DDB_9_6" } = await request.json();

    const vision = await runVision({
      imageBase64,
      apiKey: env.OPENAI_API_KEY
    });

    // normalize multipliers (null → 1)
    vision.multipliers = {
      top: vision.multipliers.top ?? 1,
      middle: vision.multipliers.middle ?? 1,
      bottom: vision.multipliers.bottom ?? 1
    };

    const pt = PAYTABLES[paytable];
    const strategy = bestHoldEV(vision.cards, pt);

    return new Response(JSON.stringify({
      paytable: pt.name,
      ...vision,
      ...strategy
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
};
