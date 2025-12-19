const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* =========================
   Vision prompt
========================= */
function visionPrompt(game) {
  return `
Read the VIDEO POKER machine screen.

TASK:
1) Identify EXACTLY 5 playing cards in the ACTIVE BOTTOM ROW, left to right.
2) If game is Ultimate X or Ultimate X Progressive:
   - Read the SINGLE multiplier shown on the LEFT (2X,4X,8X,10X,12X).
   - Return it as a number (2,4,8,10,12).
   - If unclear, return null.

Return STRICT JSON only:
{
  "cards":[{"rank":"A","suit":"H"},{"rank":"J","suit":"H"},{"rank":"T","suit":"H"},{"rank":"4","suit":"D"},{"rank":"5","suit":"C"}],
  "multiplier": 10
}

Ranks: A,K,Q,J,T,9..2
Suits: S,H,D,C
Game: ${game}
`;
}

/* =========================
   OpenAI helpers (with timeout)
========================= */
async function callOpenAI(apiKey, prompt, imageBase64, timeoutMs = 9000) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageBase64 } },
            ],
          },
        ],
      }),
    });

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep raw */ }

    return {
      ok: res.ok,
      status: res.status,
      rawText: text,
      json,
    };
  } finally {
    clearTimeout(to);
  }
}

function extractJsonFromModel(openaiJson) {
  const content = openaiJson?.choices?.[0]?.message?.content || "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function validateCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) return "Expected exactly 5 cards";
  const validRanks = new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
  const validSuits = new Set(["S","H","D","C"]);
  for (const c of cards) {
    if (!c || typeof c !== "object") return "Card is not an object";
    if (!validRanks.has(c.rank)) return `Invalid rank: ${c.rank}`;
    if (!validSuits.has(c.suit)) return `Invalid suit: ${c.suit}`;
  }
  // also reject duplicates
  const set = new Set(cards.map(c => c.rank + c.suit));
  if (set.size !== 5) return "Duplicate cards detected";
  return null;
}

/* =========================
   Minimal deterministic hold (for debugging)
   NOTE: This is NOT changing your strategy engine permanently.
   We only need stability diagnostics first.
========================= */
function defaultHold(cards) {
  // simple safe fallback: hold pairs if any, else hold none
  const counts = {};
  cards.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);
  const hold = [false,false,false,false,false];
  const pairRanks = Object.keys(counts).filter(r => counts[r] >= 2);
  if (pairRanks.length) {
    cards.forEach((c,i)=>{ if (pairRanks.includes(c.rank)) hold[i]=true; });
  }
  return hold;
}

function chooseMultiplier(visionMult, uiMult){
  const v = Number(visionMult);
  if(Number.isInteger(v) && v>=2 && v<=12) return v;
  const u = Number(uiMult);
  if(Number.isInteger(u) && u>=1 && u<=12) return u;
  return 1;
}

/* =========================
   WORKER
========================= */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method === "GET") return jsonResponse({ status: "ok" });

    if (request.method !== "POST") {
      return jsonResponse({ error: "Unsupported method" }, 405);
    }

    const t0 = Date.now();
    let stage = "start";

    try {
      stage = "parse_request";
      const body = await request.json();
      const { imageBase64, game = "job", paytable = "9/6", multiplier = 1 } = body || {};

      if (!imageBase64) {
        return jsonResponse({ error: "Missing imageBase64", stage }, 200);
      }

      stage = "vision_call";
      const v0 = Date.now();
      const openaiRes = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64, 9000);
      const visionMs = Date.now() - v0;

      if (!openaiRes.ok) {
        return jsonResponse({
          error: "OpenAI vision request failed",
          stage,
          openai_status: openaiRes.status,
          vision_ms: visionMs,
          raw: openaiRes.rawText?.slice(0, 300),
        }, 200);
      }

      stage = "vision_parse";
      const modelJson = openaiRes.json;
      const extracted = extractJsonFromModel(modelJson);
      if (!extracted) {
        return jsonResponse({
          error: "Could not parse JSON from model content",
          stage,
          vision_ms: visionMs,
          model_content_preview: (modelJson?.choices?.[0]?.message?.content || "").slice(0, 300),
        }, 200);
      }

      const cards = extracted.cards;
      const err = validateCards(cards);
      if (err) {
        return jsonResponse({
          error: "Invalid cards returned by vision",
          stage,
          why: err,
          cards: cards ?? null
        }, 200);
      }

      stage = "strategy";
      const usedMult = chooseMultiplier(extracted.multiplier, multiplier);

      // For diagnostics we return a safe hold + include your selected params
      const hold = defaultHold(cards);

      const totalMs = Date.now() - t0;

      return jsonResponse({
        cards,
        hold,
        multiplier: usedMult,
        confidence: 1.0,
        explanation: "Debug mode: vision parsed successfully; returning safe hold (pairs if present).",
        debug: {
          stage_ok: stage,
          vision_ms: visionMs,
          total_ms: totalMs,
          game,
          paytable
        }
      }, 200);

    } catch (e) {
      return jsonResponse({
        error: "Worker exception",
        stage,
        message: String(e?.message || e),
      }, 200);
    }
  }
};
