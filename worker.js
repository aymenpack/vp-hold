const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ---------- Vision prompt: cards only ----------
function visionPrompt(game) {
  return `
You are reading a VIDEO POKER machine screen.

TASK:
- Identify EXACTLY 5 playing cards in the BOTTOM ROW (active hand), left to right.
- Return STRICT JSON ONLY.

If the game is Ultimate X (ux / uxp), also read the SINGLE multiplier shown on the LEFT of the card row (e.g., 2x, 4x, 10x, 12x).
If you cannot read it confidently, return null.

FORMAT:
{
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"9","suit":"D"},
    {"rank":"9","suit":"C"},
    {"rank":"K","suit":"S"},
    {"rank":"2","suit":"H"}
  ],
  "multiplier": 10
}

Ranks: A,K,Q,J,T,9..2
Suits: S,H,D,C
Return JSON only, no extra text.
Game: ${game}
`;
}

// ---------- Helpers ----------
const RANK_ORDER = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const ROYAL_SET = new Set(["T","J","Q","K","A"]);
function rVal(r){
  if (r === "A") return 14;
  if (r === "K") return 13;
  if (r === "Q") return 12;
  if (r === "J") return 11;
  if (r === "T") return 10;
  return parseInt(r, 10);
}
function isRedSuit(s){ return s==="H" || s==="D"; }

function countBy(cards, keyFn){
  const m = new Map();
  for (const c of cards) {
    const k = keyFn(c);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function sortUniqueVals(vals){
  return [...new Set(vals)].sort((a,b)=>a-b);
}

function isStraight5(vals){
  const v = sortUniqueVals(vals);
  if (v.length !== 5) return false;
  // wheel
  if (v.join(",") === "2,3,4,5,14") return true;
  return v[4]-v[0] === 4;
}

function isFlush(cards){
  return new Set(cards.map(c=>c.suit)).size === 1;
}

function isRoyal(vals){
  const s = sortUniqueVals(vals).join(",");
  return s === "10,11,12,13,14";
}

function classifyMadeHand(cards){
  const vals = cards.map(c=>rVal(c.rank));
  const flush = isFlush(cards);
  const straight = isStraight5(vals);

  const rankCounts = countBy(cards, c=>c.rank);
  const counts = [...rankCounts.values()].sort((a,b)=>b-a); // e.g. [4,1]

  if (straight && flush && isRoyal(vals)) return "ROYAL_FLUSH";
  if (straight && flush) return "STRAIGHT_FLUSH";
  if (counts[0] === 4) return "FOUR_KIND";
  if (counts[0] === 3 && counts[1] === 2) return "FULL_HOUSE";
  if (flush) return "FLUSH";
  if (straight) return "STRAIGHT";
  if (counts[0] === 3) return "THREE_KIND";
  if (counts[0] === 2 && counts[1] === 2) return "TWO_PAIR";
  if (counts[0] === 2) return "ONE_PAIR";
  return "HIGH_CARD";
}

function pairInfo(cards){
  const rankCounts = countBy(cards, c=>c.rank);
  const pairs = [];
  for (const [r, c] of rankCounts.entries()) if (c === 2) pairs.push(r);
  pairs.sort((a,b)=>rVal(b)-rVal(a));
  return pairs; // ranks of pairs
}

function isHighPairRank(r){
  const v = rVal(r);
  return v >= 11; // J,Q,K,A
}

function suitedCards(cards){
  const m = new Map();
  for (let i=0;i<cards.length;i++){
    const s = cards[i].suit;
    if (!m.has(s)) m.set(s, []);
    m.get(s).push(i);
  }
  return m; // suit -> indices
}

function ranksOf(indices, cards){
  return indices.map(i=>cards[i].rank);
}

function allSameSuit(indices, cards){
  if (indices.length === 0) return false;
  const s = cards[indices[0]].suit;
  return indices.every(i => cards[i].suit === s);
}

// ---------- Deterministic strategy: Jacks or Better (approx chart hierarchy, good baseline) ----------
function solveJacksOrBetter(cards, paytableKey){
  // paytableKey is "9/6" or "8/5". We keep same hierarchy; differences are small in edge cases.
  // This is a deterministic rule hierarchy (no randomness).

  const made = classifyMadeHand(cards);
  const hold = [false,false,false,false,false];

  // 1) Hold any made straight or better
  const alwaysHoldAll = new Set(["ROYAL_FLUSH","STRAIGHT_FLUSH","FOUR_KIND","FULL_HOUSE","FLUSH","STRAIGHT"]);
  if (alwaysHoldAll.has(made)) {
    return {
      hold: [true,true,true,true,true],
      explanation: `Made hand (${made.replaceAll("_"," ").toLowerCase()}). Never break it in Jacks or Better.`
    };
  }

  // 2) 4 to a Royal Flush
  {
    const suitMap = suitedCards(cards);
    for (const [s, idx] of suitMap.entries()){
      const rks = ranksOf(idx, cards);
      const royalIdx = idx.filter(i => ROYAL_SET.has(cards[i].rank));
      if (royalIdx.length === 4 && allSameSuit(royalIdx, cards)) {
        royalIdx.forEach(i=>hold[i]=true);
        return {
          hold,
          explanation: `Holding 4 to a Royal Flush (highest-value draw) in Jacks or Better ${paytableKey}.`
        };
      }
    }
  }

  // 3) Three of a kind / Two pair / High pair
  if (made === "THREE_KIND") {
    const counts = countBy(cards, c=>c.rank);
    let tripRank = null;
    for (const [r,c] of counts.entries()) if (c===3) tripRank = r;
    cards.forEach((c,i)=>{ if (c.rank===tripRank) hold[i]=true; });
    return { hold, explanation: `Holding three of a kind (${tripRank}s).` };
  }
  if (made === "TWO_PAIR") {
    const pairs = pairInfo(cards);
    cards.forEach((c,i)=>{ if (pairs.includes(c.rank)) hold[i]=true; });
    return { hold, explanation: `Holding two pair (made hand).` };
  }
  if (made === "ONE_PAIR") {
    const pairs = pairInfo(cards);
    const pr = pairs[0];
    cards.forEach((c,i)=>{ if (c.rank===pr) hold[i]=true; });
    if (isHighPairRank(pr)) {
      return { hold, explanation: `Holding high pair (${pr}${pr}) in Jacks or Better.` };
    } else {
      // Low pair is often held, but can be beaten by some premium draws. We'll keep going only if we find premium draw; else keep pair.
      // We'll not return yet.
    }
  }

  // 4) 4 to a Straight Flush (suited + within straight window)
  {
    const suitMap = suitedCards(cards);
    for (const [s, idx] of suitMap.entries()){
      if (idx.length < 4) continue;
      // check any 4-card subset among idx (simple: try drop each one)
      for (let drop=-1; drop<idx.length; drop++){
        const pick = idx.filter((_,k)=>k!==drop).slice(0,4);
        if (pick.length !== 4) continue;
        const vals = pick.map(i=>rVal(cards[i].rank));
        const u = sortUniqueVals(vals);
        if (u.length===4){
          const max = u[3], min = u[0];
          const wheelAlt = u.includes(14) ? sortUniqueVals(u.map(v=>v===14?1:v)) : null;
          const ok = (arr)=>arr[3]-arr[0] <= 4;
          if (ok(u) || (wheelAlt && ok(wheelAlt))){
            pick.forEach(i=>hold[i]=true);
            return { hold, explanation: `Holding 4 to a Straight Flush (premium suited straight draw).` };
          }
        }
      }
    }
  }

  // 5) High pair (if we reached here and had one, we already returned)
  // 6) Low pair (if we had one) beats most weak draws, but 4-flush can beat it. We'll check 4-flush first, then keep low pair.

  // 6) 4 to a Flush
  {
    const suitMap = suitedCards(cards);
    for (const [s, idx] of suitMap.entries()){
      if (idx.length === 4){
        idx.forEach(i=>hold[i]=true);
        return { hold, explanation: `Holding 4 to a Flush (strong draw).` };
      }
    }
  }

  // 7) If we had a low pair, keep it now
  if (made === "ONE_PAIR") {
    const pr = pairInfo(cards)[0];
    if (!isHighPairRank(pr)){
      cards.forEach((c,i)=>{ if (c.rank===pr) hold[i]=true; });
      return { hold, explanation: `Holding low pair (${pr}${pr}).` };
    }
  }

  // 8) 3 to a Royal Flush (suited, 3 royal ranks)
  {
    const suitMap = suitedCards(cards);
    for (const [s, idx] of suitMap.entries()){
      const royalIdx = idx.filter(i => ROYAL_SET.has(cards[i].rank));
      if (royalIdx.length === 3){
        royalIdx.forEach(i=>hold[i]=true);
        return { hold, explanation: `Holding 3 to a Royal Flush (suited).` };
      }
    }
  }

  // 9) 4 to a Straight (any suits, within 5-card window)
  {
    // try all 4-card subsets by dropping each card
    for (let drop=0; drop<5; drop++){
      const pick = [0,1,2,3,4].filter(i=>i!==drop);
      const vals = pick.map(i=>rVal(cards[i].rank));
      const u = sortUniqueVals(vals);
      if (u.length !== 4) continue;
      const ok = (arr)=>arr[3]-arr[0] <= 4;
      const wheelAlt = u.includes(14) ? sortUniqueVals(u.map(v=>v===14?1:v)) : null;
      if (ok(u) || (wheelAlt && ok(wheelAlt))){
        pick.forEach(i=>hold[i]=true);
        return { hold, explanation: `Holding 4 to a Straight.` };
      }
    }
  }

  // 10) Two suited high cards (J/Q/K/A)
  {
    const suitMap = suitedCards(cards);
    for (const [s, idx] of suitMap.entries()){
      const high = idx.filter(i=>rVal(cards[i].rank) >= 11);
      if (high.length >= 2){
        // take best two
        high.sort((a,b)=>rVal(cards[b].rank)-rVal(cards[a].rank));
        hold[high[0]] = true;
        hold[high[1]] = true;
        return { hold, explanation: `Holding two suited high cards (potential high pair / royal draw).` };
      }
    }
  }

  // 11) Two high cards (J/Q/K/A)
  {
    const highIdx = [0,1,2,3,4].filter(i=>rVal(cards[i].rank) >= 11);
    if (highIdx.length >= 2){
      highIdx.sort((a,b)=>rVal(cards[b].rank)-rVal(cards[a].rank));
      hold[highIdx[0]] = true;
      hold[highIdx[1]] = true;
      return { hold, explanation: `Holding two high cards.` };
    }
  }

  // Default: hold none
  return { hold: [false,false,false,false,false], explanation: `No strong made hand or premium draw. Drawing five.` };
}

// ---------- OpenAI call + JSON extraction ----------
async function callOpenAI(apiKey, prompt, imageBase64){
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
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
  return await res.json();
}

function extractJson(openaiResponse){
  const content = openaiResponse?.choices?.[0]?.message?.content || "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON returned by model");
  return JSON.parse(match[0]);
}

/* =========================
   WORKER
========================= */
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
      const { imageBase64, game, paytable, multiplier = 1 } = await request.json();
      if (!imageBase64 || !game || !paytable) {
        return new Response(JSON.stringify({ error: "Missing image, game, or paytable" }), { status: 400, headers: corsHeaders });
      }

      // 1) Vision: cards (+ optional multiplier reading)
      const vision = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis = extractJson(vision);

      const cards = vis.cards || [];
      const detectedMult = vis.multiplier ?? null;

      // 2) Strategy: deterministic for JOB only (today)
      let hold = [false,false,false,false,false];
      let explanation = "";
      let confidence = 1.0;

      if (game === "job") {
        const solved = solveJacksOrBetter(cards, paytable);
        hold = solved.hold;
        explanation = solved.explanation;
      } else {
        hold = [false,false,false,false,false];
        explanation = `Strategy engine not yet implemented for "${game}". Currently supported: Jacks or Better.`;
        confidence = 0.6;
      }

      // 3) Return
      return new Response(JSON.stringify({
        cards,
        hold,
        explanation,
        multiplier: detectedMult,
        confidence
      }), {
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
