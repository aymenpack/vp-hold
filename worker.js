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
       CONSTANTS
       =============================== */
    const VALID_RANKS = new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
    const VALID_SUITS = new Set(["S","H","D","C"]);

    /* ===============================
       PROMPTS
       =============================== */
    const basePrompt = `
You are reading a casino Ultimate X video poker machine.

The image contains THREE horizontal rows:
- Top row: multiplier on the LEFT
- Middle row: multiplier on the LEFT
- Bottom row: multiplier on the LEFT + FIVE playing cards

TASKS:
1. Read the multiplier shown on the LEFT of each row.
2. Read the FIVE cards on the BOTTOM row, left to right.

OUTPUT STRICT JSON ONLY:

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

    const clarificationPrompt = `
Some cards were unclear.

Look ONLY at the BOTTOM row and try again.
Focus on card rank and suit symbols.

Return the SAME JSON format.
Do not explain anything.
`;

    /* ===============================
       HELPERS
       =============================== */
    async function callVision(prompt) {
      const res = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
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
                  { type: "image_url", image_url: { url: imageBase64 } },
                ],
              },
            ],
          }),
        }
      );

      const text = await res.text();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON returned");
      return JSON.parse(match[0]);
    }

    function validate(parsed) {
      const warnings = [];

      if (!parsed.multipliers) {
        warnings.push("Missing multipliers");
      }

      if (!Array.isArray(parsed.cards) || parsed.cards.length !== 5) {
        warnings.push("Expected 5 cards");
      }

      parsed.cards?.forEach((c, i) => {
        if (!VALID_RANKS.has(c?.rank)) {
          warnings.push(`Invalid rank at position ${i}`);
        }
        if (!VALID_SUITS.has(c?.suit)) {
          warnings.push(`Invalid suit at position ${i}`);
        }
      });

      return warnings;
    }

    function normalizeMultipliers(multipliers) {
      return {
        top:    multipliers?.top    ?? 1,
        middle: multipliers?.middle ?? 1,
        bottom: multipliers?.bottom ?? 1,
      };
    }

    /* ===============================
       MAIN FLOW
       =============================== */
    let result;
    let warnings = [];

    try {
      result = await callVision(basePrompt);
      warnings = validate(result);

      // Retry ONCE if there are card issues
      if (warnings.length > 0) {
        const retry = await callVision(clarificationPrompt);
        const retryWarnings = validate(retry);

        if (retryWarnings.length < warnings.length) {
          result = retry;
          warnings = retryWarnings;
        }
      }

      // 🔒 Normalize multipliers: null → 1
      result.multipliers = normalizeMultipliers(result.multipliers);

    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Vision failed", detail: err.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    /* ===============================
       FINAL RESPONSE
       =============================== */
    return new Response(
      JSON.stringify({
        ...result,
        warnings: warnings.length ? warnings : undefined
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  },
};
