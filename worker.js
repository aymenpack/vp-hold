const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function buildPrompt(game, paytable) {
  return `
You are an expert VIDEO POKER STRATEGY engine.

You will be given:
- A screenshot of a video poker machine
- The GAME TYPE
- The PAYTABLE
- Possibly an Ultimate X multiplier

Your job:
1. Identify the EXACT 5 cards in the BOTTOM ROW (left to right).
2. If this is an Ultimate X game, read the SINGLE multiplier shown on the LEFT of the row.
3. Based on PERFECT STRATEGY for the specified game and paytable,
   decide which cards to HOLD.

GAME:
${game}

PAYTABLE:
${paytable}

IMPORTANT RULES:
- Use correct optimal strategy for THIS game & paytable.
- For Ultimate X, factor the multiplier heavily.
- If the multiplier is high, prioritize high-EV future hands.
- Return EXACTLY 5 hold decisions.
- Do NOT explain reasoning.
- Do NOT include extra text.

OUTPUT FORMAT (STRICT JSON ONLY):

{
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"9","suit":"D"},
    {"rank":"9","suit":"C"},
    {"rank":"K","suit":"S"},
    {"rank":"2","suit":"H"}
  ],
  "multiplier": 10,
  "hold": [false, true, true, false, false]
}

If no multiplier is visible, return:
"multiplier": null
`;
}

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({ status: "Worker alive" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Unsupported method" }),
        { status: 405, headers: corsHeaders }
      );
    }

    try {
      const { imageBase64, game, paytable } = await request.json();

      if (!imageBase64 || !game || !paytable) {
        return new Response(
          JSON.stringify({ error: "Missing image, game, or paytable" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0,
          messages: [
            { role: "system", content: "Return STRICT JSON only." },
            {
              role: "user",
              content: [
                { type: "text", text: buildPrompt(game, paytable) },
                {
                  type: "image_url",
                  image_url: { url: imageBase64 }
                }
              ]
            }
          ]
        })
      });

      const raw = await openaiRes.json();
      const content = raw.choices?.[0]?.message?.content || "";

      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON returned");

      const parsed = JSON.parse(match[0]);

      if (!parsed.cards || !parsed.hold || parsed.hold.length !== 5) {
        throw new Error("Invalid response format");
      }

      return new Response(
        JSON.stringify(parsed),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
