export default {
  async fetch(request, env) {
    /* ===============================
       CORS
       =============================== */
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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

    /* ===============================
       INPUT
       =============================== */
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { imageBase64 } = body;

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
       PROMPT
       =============================== */
    const prompt = `
You are reading a casino Ultimate X video poker machine.

The image contains THREE horizontal rows:
- Top row: multiplier on the LEFT
- Middle row: multiplier on the LEFT
- Bottom row: multiplier on the LEFT + FIVE playing cards

TASKS:
1. Read the multiplier shown on the LEFT of each row.
2. Read the FIVE cards on the BOTTOM row, left to right.

OUTPUT STRICT JSON ONLY.

JSON FORMAT:
{
  "multipliers": {
    "top": number | null,
    "middle": number | null,
    "bottom": number | null
  },
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"K","suit":"H"},
    {"rank":"Q","suit":"D"},
    {"rank":"J","suit":"C"},
    {"rank":"9","suit":"S"}
  ]
}

Rules:
- Ranks: A K Q J T 9 8 7 6 5 4 3 2
- Suits: S H D C
- If a multiplier is not visible, return null
- If a card is unreadable, return {"rank":null,"suit":null}
`;

    /* ===============================
       CALL OPENAI
       =============================== */
    let openaiJson;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1",
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

      openaiJson = await res.json();
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to call OpenAI", detail: err.message }),
        { status: 502, headers: corsHeaders }
      );
    }

    /* ===============================
       EXTRACT VISION JSON (THE FIX)
       =============================== */
    let vision;
    try {
      const content = openaiJson.choices?.[0]?.message?.content;
      if (!content) throw new Error("Missing message content");

      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON found in vision response");

      vision = JSON.parse(match[0]);
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Vision returned invalid JSON",
          raw: openaiJson
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    /* ===============================
       NORMALIZE MULTIPLIERS
       =============================== */
    vision.multipliers = {
      top: vision.multipliers?.top ?? 1,
      middle: vision.multipliers?.middle ?? 1,
      bottom: vision.multipliers?.bottom ?? 1
    };

    /* ===============================
       FINAL RESPONSE (ONLY VISION DATA)
       =============================== */
    return new Response(
      JSON.stringify(vision),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
};
