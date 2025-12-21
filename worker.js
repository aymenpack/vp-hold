// Cloudflare Worker — Vision + Wizard Strategy
import { wizardBestHold } from "./strategy/wizard.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    try {
      const { imageBase64, multipliers_fallback = [1,1,1], progressive = false } = await req.json();
      if (!imageBase64) {
        return json({ error: "Missing image" });
      }

      // ===== OpenAI Vision (SERVER SIDE ONLY) =====
      const prompt = `
Extract exactly 5 playing cards (left to right, bottom row)
and exactly 3 multipliers (one per hand).

Return JSON ONLY:
{
  "cards":[{"rank":"K","suit":"S"},...],
  "multipliers":[2,1,4]
}

Rules:
- If multiplier unreadable, return null
- Blank multiplier = 1
- Ranks: A,K,Q,J,T,9..2
- Suits: S,H,D,C
`;

      const ai = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0,
          messages: [
            { role: "system", content: "Return STRICT JSON only." },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageBase64 } }
              ]
            }
          ]
        })
      });

      const raw = await ai.text();
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

      const cards = parsed.cards;
      const visionMults = parsed.multipliers || [];

      // ===== Multiplier resolution =====
      const used = [0,1,2].map(i => {
        const v = Number(visionMults[i]);
        if (v >= 1 && v <= 12) return v;
        const f = Number(multipliers_fallback[i]);
        if (f >= 1 && f <= 12) return f;
        return 1;
      });

      const total = used.reduce((a,b)=>a+b,0);

      // ===== Wizard Strategy =====
      const result = wizardBestHold(cards, total, progressive);

      return new Response(JSON.stringify({
        cards,
        hold: result.hold,
        multipliers_used: used,
        multiplier_total: total,
        ev_single: result.ev_single,
        ev_total: result.ev_total,
        explanation: "Wizard of Odds Ultimate X strategy",
        confidence: 1.0
      }), { headers: { ...cors, "Content-Type": "application/json" } });

    } catch (e) {
      return new Response(JSON.stringify({
        error: "Vision or strategy error",
        detail: String(e.message || e)
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
  }
};

function json(obj) {
  return new Response(JSON.stringify(obj), { headers: { ...cors, "Content-Type": "application/json" } });
}
