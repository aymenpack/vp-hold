const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* =========================
   STRATEGY PROMPTS
========================= */

function gameRules(game, paytable, multiplier) {
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
- Similar to Jacks or Better.
- Four of a kind pays more.
- Kicker does NOT matter.
- Always hold all 5 cards on quads.
`;

    case "double_bonus":
      return `
STRATEGY: DOUBLE BONUS (${paytable})

RULES:
- Quad aces and low quads pay more.
- NEVER discard the kicker on any four of a kind.
- Always hold all 5 cards on quads.
`;

    case "ddb":
      return `
STRATEGY: DOUBLE DOUBLE BONUS (DDB)

CRITICAL RULE:
- In DDB, YOU NEVER DISCARD THE KICKER on ANY four of a kind.
- If four cards share the same rank, HOLD ALL FIVE cards.
- This overrides all draw considerations.
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

IMPORTANT CONTEXT:
- The current multiplier for this row is ${multiplier}×.
- This multiplier applies to the ENTIRE hand.

RULES:
- Base strategy is Jacks or Better.
- NEVER break quads or full houses.
- As the multiplier increases, favor keeping made hands and premium draws.
- If multiplier ≥ 8×, strongly prefer keeping made hands over speculative draws.
`;

    default:
      return `Use best possible video poker strategy.`;
  }
}

function buildPrompt(game, paytable, multiplier) {
  return `
You are a VIDEO POKER PERFECT STRATEGY ENGINE.

TASKS:
1. Identify EXACTLY 5 cards in the BOTTOM ROW (left to right).
2. If this is Ultimate X, identify the SINGLE multiplier shown on the LEFT (if visible).
3. Decide which cards to HOLD using PERFECT STRATEGY.
4. Explain WHY those cards are held.

${gameRules(game, paytable, multiplier)}

OUTPUT STRICT JSON ONLY (NO EXTRA TEXT):

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
  "explanation": "Holding the pair of 9s because this is the highest-paying made hand available. No higher-value draws justify breaking the pair, and Ultimate X multiplier does not favor breaking it.",
  "confidence": 0.92
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
      const { imageBase64, game, paytable, multiplier = 1 } = await request.json();

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
                { type: "text", text: buildPrompt(game, paytable, multiplier) },
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

      // DDB: never discard kicker on quads
      if (game === "ddb" && parsed.cards && isFourOfKind(parsed.cards)) {
        parsed.hold = [true,true,true,true,true];
        parsed.explanation = "Four of a kind in Double Double Bonus. Kicker must never be discarded, so all five cards are held.";
      }

      // Bonus / Double Bonus / Ultimate X: never break quads
      if (
        (game === "bonus" || game === "double_bonus" || game === "ux" || game === "uxp") &&
        parsed.cards &&
        isFourOfKind(parsed.cards)
      ) {
        parsed.hold = [true,true,true,true,true];
        parsed.explanation = "Four of a kind detected. Quads are never broken in this game.";
      }

      // Deuces Wild: never discard a deuce
      if (game === "deuces" && parsed.cards) {
        parsed.cards.forEach((c, i) => {
          if (c.rank === "2") parsed.hold[i] = true;
        });
        parsed.explanation = "Deuces are wild in Deuces Wild and must never be discarded.";
      }

      // Ultimate X: multiplier awareness safety
      if ((game === "ux" || game === "uxp") && multiplier >= 8) {
        parsed.explanation += ` The ${multiplier}× Ultimate X multiplier significantly increases future value, so this strategy prioritizes preserving made hands and high-EV outcomes.`;
      }

      parsed.multiplier = parsed.multiplier || multiplier;

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
