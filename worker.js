const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function gameRules(game, paytable) {
  // These are instruction “profiles” (not paytables themselves).
  // They tell the model which strategy chart family to follow.
  switch (game) {
    case "job":
      return `
STRATEGY PROFILE: Jacks or Better.
Paytable: ${paytable}.
Use optimal Jacks-or-Better strategy for the specified paytable (9/6 vs 8/5).
Priority examples: made hands > 4 to a royal > 4 to a straight flush > high pairs > 3 to a royal, etc.
`;
    case "bonus":
      return `
STRATEGY PROFILE: Bonus Poker.
Paytable: ${paytable}.
Use optimal Bonus Poker strategy (quads and bonus structure differ from Jacks or Better).
Do NOT use generic Jacks-or-Better charts when choices differ.
`;
    case "double_bonus":
      return `
STRATEGY PROFILE: Double Bonus Poker.
Paytable: ${paytable}.
Use optimal Double Bonus strategy; treat quad categories and kicker incentives appropriately.
`;
    case "ddb":
      return `
STRATEGY PROFILE: Double Double Bonus Poker.
Paytable: ${paytable}.
Use optimal DDB strategy (kicker-dependent quad bonuses change correct holds).
`;
    case "deuces":
      return `
STRATEGY PROFILE: Deuces Wild.
Paytable: ${paytable}.
Deuces are wild (2s). Use optimal Deuces Wild strategy.
Always consider number of deuces first; prioritize made hands with deuces and strong draws.
`;
    case "ux":
    case "uxp":
      return `
STRATEGY PROFILE: Ultimate X.
Paytable base: ${paytable}.
Use strategy appropriate for Ultimate X. Factor the SINGLE multiplier for the whole row strongly.
If multiplier is high, prioritize lines that maximize expected value under multiplier.
(You are deciding what to hold NOW for this hand with the given multiplier.)
`;
    default:
      return `STRATEGY PROFILE: Unknown. Use best effort.`;
  }
}

function buildPrompt(game, paytable) {
  return `
You are a video poker PERFECT STRATEGY engine.

You MUST follow these rules:
- Output STRICT JSON only.
- No explanations, no markdown, no extra text.
- Identify exactly 5 cards in the BOTTOM ROW, left-to-right.
- Determine which cards to HOLD for the selected game and paytable.
- Return hold as a boolean array of length 5.
- Also return a confidence number 0-1. Use <0.7 if uncertain.

${gameRules(game, paytable)}

ULTIMATE X MULTIPLIER:
- If this is Ultimate X, read the SINGLE multiplier shown on the LEFT of the bottom row (e.g., 2x, 4x, 10x).
- Return it as an integer in field "multiplier".
- If not present or not Ultimate X, return null.

OUTPUT FORMAT (STRICT JSON):
{
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"9","suit":"D"},
    {"rank":"9","suit":"C"},
    {"rank":"K","suit":"S"},
    {"rank":"2","suit":"H"}
  ],
  "multiplier": 10,
  "hold": [false, true, true, false, false],
  "confidence": 0.85
}

Suit letters: S=spades, H=hearts, D=diamonds, C=clubs.
Ranks: A,K,Q,J,T,9..2.
`;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "Worker alive" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Unsupported method" }), { status: 405, headers: corsHeaders });
    }

    try {
      const { imageBase64, game, paytable } = await request.json();
      if (!imageBase64 || !game || !paytable) {
        return new Response(JSON.stringify({ error: "Missing image/game/paytable" }), { status: 400, headers: corsHeaders });
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
                { type: "image_url", image_url: { url: imageBase64 } }
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

      // Hard validation
      if (!parsed.cards || parsed.cards.length !== 5) throw new Error("cards must be length 5");
      if (!parsed.hold || parsed.hold.length !== 5) throw new Error("hold must be length 5");

      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};
