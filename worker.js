const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* =========================
   STRATEGY PROMPTS
========================= */

function gameRules(game, paytable) {
  switch (game) {

    case "job":
      return `
STRATEGY: JACKS OR BETTER (${paytable})

RULES:
- Always hold made hands (straight or better).
- Always hold high pairs (J, Q, K, A).
- Never break a made hand for a draw.
- Use standard 9/6 or 8/5 strategy hierarchy.
`;

    case "bonus":
      return `
STRATEGY: BONUS POKER (${paytable})

RULES:
- Strategy similar to Jacks or Better.
- Quads are more valuable, but kicker does NOT matter.
- Always hold all 5 cards on quads.
`;

    case "double_bonus":
      return `
STRATEGY: DOUBLE BONUS (${paytable})

RULES:
- Quad aces and low quads are enhanced.
- NEVER discard the kicker on any four of a kind.
- Always hold all 5 cards on quads.
`;

    case "ddb":
      return `
STRATEGY: DOUBLE DOUBLE BONUS (DDB)

CRITICAL RULE:
- In DDB, YOU NEVER DISCARD THE KICKER ON ANY FOUR OF A KIND.
- If the hand contains four cards of the same rank, HOLD ALL FIVE CARDS.
- This rule overrides ALL other considerations.

OTHER RULES:
- Always hold made hands (straight or better).
- Always hold high pairs.
`;

    case "deuces":
      return `
STRATEGY: DEUCES WILD (${paytable})

RULES:
- Deuces (2s) are wild.
- NEVER discard a deuce.
- 4, 3, or 2 deuces → hold all deuces.
- 4 or 3 deuces → hold all 5 cards.
- Made hands (straight flush or better) → hold all 5.
`;

    case "ux":
    case "uxp":
      return `
STRATEGY: ULTIMATE X (${paytable})

RULES:
- Use Jacks or Better as base strategy.
- ONE multiplier applies to the entire row.
- If multiplier >= 4x, prioritize keeping made hands and premium draws.
- Never break quads or full houses.
`;

    default:
      return `Use best possible video poker strategy.`;
  }
}

function buildPrompt(game, paytable) {
  return `
You are a VIDEO POKER PERFECT STRATEGY engine.

TASKS:
1. Identify EXACTLY 5 cards in the BOTTOM ROW (left to right).
2. If Ultimate X, read the SINGLE multiplier shown on the LEFT.
3. Decide which cards to HOLD using PERFECT STRATEGY.

${gameRules(game, paytable)}

OUTPUT STRICT JSON ONLY (NO TEXT):

{
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"9","suit":"D"},
    {"rank":"9","suit":"C"},
    {"rank":"K","suit":"S"},
    {"rank":"2","suit":"H"}
  ],
  "multiplier": 10,
  "hold": [false,true,true,false,false],
  "confidence": 0.9
}

Suit letters: S,H,D,C.
Ranks: A,K,Q,J,T,9..2.
`;
}

/* =========================
   HARD RULE GUARDRAILS
========================= */

function isFourOfKind(cards) {
  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  return Object.values(counts).some(v => v === 4);
}

function countDeuces(cards) {
  return cards.filter(c => c.rank === "2").length;
}

function normalizeHold(hold) {
  if (!Array.isArray(hold) || hold.length !== 5) {
    return [false,false,false,false,false];
  }
  return hold.map(Boolean);
}

/* =========================
   WORKER
========================= */

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

      parsed.hold = normalizeHold(parsed.hold);

      /* ===== HARD GUARDRAILS ===== */

      // Double Double Bonus: never discard kicker on quads
      if (game === "ddb" && parsed.cards && isFourOfKind(parsed.cards)) {
        parsed.hold = [true,true,true,true,true];
      }

      // Double Bonus: same rule for safety
      if (game === "double_bonus" && parsed.cards && isFourOfKind(parsed.cards)) {
        parsed.hold = [true,true,true,true,true];
      }

      // Bonus Poker: same
      if (game === "bonus" && parsed.cards && isFourOfKind(parsed.cards)) {
        parsed.hold = [true,true,true,true,true];
      }

      // Deuces Wild: never discard a deuce
      if (game === "deuces" && parsed.cards) {
        parsed.cards.forEach((c, i) => {
          if (c.rank === "2") parsed.hold[i] = true;
        });
      }

      // Ultimate X: never break quads
      if ((game === "ux" || game === "uxp") && parsed.cards && isFourOfKind(parsed.cards)) {
        parsed.hold = [true,true,true,true,true];
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
