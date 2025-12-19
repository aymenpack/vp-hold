const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* =========================
   Vision prompt (Ultimate X only)
========================= */
function visionPrompt(mode) {
  return `
You are reading an IGT Ultimate X video poker machine screen.

TASK:
1) Identify EXACTLY 5 playing cards in the ACTIVE BOTTOM ROW, left to right.
2) Read the SINGLE multiplier shown on the LEFT (2X,4X,8X,10X,12X).
   - Return it as a number.
   - If unclear, return null.

Return STRICT JSON only:
{
  "cards":[
    {"rank":"A","suit":"H"},
    {"rank":"J","suit":"H"},
    {"rank":"T","suit":"H"},
    {"rank":"4","suit":"D"},
    {"rank":"5","suit":"C"}
  ],
  "multiplier": 8
}

Ranks: A,K,Q,J,T,9..2
Suits: S,H,D,C
Mode: ${mode}
`;
}

/* =========================
   OpenAI helpers (ONE COPY)
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

    const text = await res.text();
    let j = null;
    try { j = JSON.parse(text); } catch {}

    if (!res.ok) {
      return { ok: false, status: res.status, raw: text, json: j };
    }
    return { ok: true, status: res.status, raw: text, json: j };
  } finally {
    clearTimeout(to);
  }
}

function extractJsonFromModel(openaiJson) {
  const content = openaiJson?.choices?.[0]?.message?.content || "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function validateCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) return "Expected exactly 5 cards";
  const validRanks = new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
  const validSuits = new Set(["S","H","D","C"]);
  const seen = new Set();
  for (const c of cards) {
    if (!c || typeof c !== "object") return "Invalid card object";
    if (!validRanks.has(c.rank)) return `Invalid rank ${c.rank}`;
    if (!validSuits.has(c.suit)) return `Invalid suit ${c.suit}`;
    const key = c.rank + c.suit;
    if (seen.has(key)) return "Duplicate cards detected";
    seen.add(key);
  }
  return null;
}

/* =========================
   Poker utilities
========================= */
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];
const ROYAL = new Set(["A","K","Q","J","T"]);

function rv(r){
  if(r==="A") return 14;
  if(r==="K") return 13;
  if(r==="Q") return 12;
  if(r==="J") return 11;
  if(r==="T") return 10;
  return parseInt(r,10);
}
function uniqSorted(vals){ return [...new Set(vals)].sort((a,b)=>a-b); }
function isFlush(cards){ return new Set(cards.map(c=>c.suit)).size===1; }
function isStraight(vals){
  const v=uniqSorted(vals);
  if(v.length!==5) return false;
  if(v.join(",")==="2,3,4,5,14") return true;
  return v[4]-v[0]===4;
}
function countRanks(cards){
  const m=new Map();
  for(const c of cards) m.set(c.rank,(m.get(c.rank)||0)+1);
  return m;
}
function classify(cards){
  const vals=cards.map(c=>rv(c.rank));
  const flush=isFlush(cards);
  const straight=isStraight(vals);
  const royal=(uniqSorted(vals).join(",")==="10,11,12,13,14");
  const counts=[...countRanks(cards).values()].sort((a,b)=>b-a);

  if(straight && flush && royal) return "RF";
  if(straight && flush) return "SF";
  if(counts[0]===4) return "K4";
  if(counts[0]===3 && counts[1]===2) return "FH";
  if(flush) return "FL";
  if(straight) return "ST";
  if(counts[0]===3) return "K3";
  if(counts[0]===2 && counts[1]===2) return "TP";
  if(counts[0]===2) return "P2";
  return "HC";
}

/* =========================
   Ultimate X deterministic hold rules
========================= */
function decideHoldUltimateX(cards, mult) {
  const made = classify(cards);

  if (["RF","SF","K4","FH","FL","ST"].includes(made)) {
    return { hold:[true,true,true,true,true], why:`Made hand (${made}). Hold all.` };
  }

  const rankCounts = countRanks(cards);
  const pairs = [...rankCounts.entries()].filter(e=>e[1]===2).map(e=>e[0]);

  if (mult >= 4 && pairs.length) {
    const pr = pairs.sort((a,b)=>rv(b)-rv(a))[0];
    const hold=[false,false,false,false,false];
    cards.forEach((c,i)=>{ if(c.rank===pr) hold[i]=true; });
    return { hold, why:`Multiplier ${mult}×: keep pair (${pr}${pr}).` };
  }

  return { hold:[false,false,false,false,false], why:`Draw five.` };
}

/* =========================
   Worker
========================= */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method === "GET") return json({ status: "ok" });
    if (request.method !== "POST") return json({ error: "bad method" }, 405);

    try {
      const body = await request.json();
      const { imageBase64, mode="ux", multiplier=1 } = body || {};
      if (!imageBase64) return json({ error: "Missing imageBase64" });

      const openai = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(mode), imageBase64);
      if (!openai.ok) {
        return json({ error: "Vision request failed", status: openai.status });
      }

      const vis = extractJsonFromModel(openai.json);
      if (!vis) return json({ error: "Could not parse vision JSON" });

      const cards = vis.cards || [];
      const err = validateCards(cards);
      if (err) return json({ error: err, cards });

      const usedMult = Number.isInteger(vis.multiplier) ? vis.multiplier : Number(multiplier) || 1;

      const decision = decideHoldUltimateX(cards, usedMult);

      return json({
        cards,
        hold: decision.hold,
        multiplier: usedMult,
        explanation: decision.why,
        confidence: 1.0
      });

    } catch (e) {
      return json({ error: "Worker exception", message: String(e) });
    }
  }
};
