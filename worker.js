const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* =========================
   Vision prompt (cards + UX multiplier)
========================= */
function visionPrompt(game) {
  return `
You are reading a VIDEO POKER machine screen.

TASK:
1) Identify EXACTLY 5 playing cards in the ACTIVE BOTTOM ROW, left to right.
2) If game is Ultimate X or Ultimate X Progressive:
   - Read the SINGLE multiplier shown on the LEFT of the card row (e.g. 2X,4X,8X,10X,12X)
   - Return it as a number (2,4,8,10,12)
   - If not clearly visible, return null

Return STRICT JSON ONLY:
{
  "cards": [
    {"rank":"A","suit":"H"},
    {"rank":"J","suit":"H"},
    {"rank":"T","suit":"H"},
    {"rank":"4","suit":"D"},
    {"rank":"5","suit":"C"}
  ],
  "multiplier": 10
}

Ranks: A,K,Q,J,T,9..2
Suits: S,H,D,C
Game: ${game}
`;
}

/* =========================
   OpenAI helpers
========================= */
async function callOpenAI(apiKey, prompt, imageBase64) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
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
  return await res.json();
}

function extractJson(openaiResponse) {
  const content = openaiResponse?.choices?.[0]?.message?.content || "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON returned by model");
  return JSON.parse(match[0]);
}

/* =========================
   Card utilities + analysis
========================= */
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];
const ROYAL = new Set(["A","K","Q","J","T"]);

function rVal(r) {
  if (r === "A") return 14;
  if (r === "K") return 13;
  if (r === "Q") return 12;
  if (r === "J") return 11;
  if (r === "T") return 10;
  return parseInt(r, 10);
}

function uniqSorted(vals) {
  return [...new Set(vals)].sort((a, b) => a - b);
}

function countBy(cards, keyFn) {
  const m = new Map();
  for (let i = 0; i < cards.length; i++) {
    const k = keyFn(cards[i], i);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function buildIndexMap(cards, keyFn) {
  const m = new Map();
  for (let i = 0; i < cards.length; i++) {
    const k = keyFn(cards[i], i);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(i);
  }
  return m;
}

function isFlush(cards) {
  return new Set(cards.map(c => c.suit)).size === 1;
}

function isStraight(vals) {
  const v = uniqSorted(vals);
  if (v.length !== 5) return false;
  if (v.join(",") === "2,3,4,5,14") return true; // wheel
  return v[4] - v[0] === 4;
}

function isRoyal(vals) {
  return uniqSorted(vals).join(",") === "10,11,12,13,14";
}

function classify5(cards) {
  const vals = cards.map(c => rVal(c.rank));
  const flush = isFlush(cards);
  const straight = isStraight(vals);

  const rankCounts = countBy(cards, c => c.rank);
  const counts = [...rankCounts.values()].sort((a,b)=>b-a);

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

function analyzeHand(cards) {
  const rankToIdx = buildIndexMap(cards, c => c.rank);
  const suitToIdx = buildIndexMap(cards, c => c.suit);

  const rankCounts = [...rankToIdx.entries()]
    .map(([r, idx]) => ({ rank: r, count: idx.length, idx }))
    .sort((a,b)=> b.count-a.count || rVal(b.rank)-rVal(a.rank));

  const suitCounts = [...suitToIdx.entries()]
    .map(([s, idx]) => ({ suit: s, count: idx.length, idx }))
    .sort((a,b)=> b.count-a.count);

  const vals = cards.map(c => rVal(c.rank));
  const made = classify5(cards);

  const quads = rankCounts.find(x=>x.count===4) || null;
  const trips = rankCounts.find(x=>x.count===3) || null;
  const pairs = rankCounts.filter(x=>x.count===2);

  const fourFlush = suitCounts.find(x=>x.count===4) || null;

  return {
    rankToIdx,
    suitToIdx,
    rankCounts,
    suitCounts,
    made,
    quads,
    trips,
    pairs,
    fourFlush,
    flush: isFlush(cards),
    straight: isStraight(vals),
    royal: isRoyal(vals),
  };
}

/* =========================
   Pattern finders (hardened)
========================= */
function find4ToRoyal(cards) {
  const suitMap = buildIndexMap(cards, c=>c.suit);
  for (const [s, idx] of suitMap.entries()) {
    const roy = idx.filter(i => ROYAL.has(cards[i].rank));
    if (roy.length === 4) return roy;
  }
  return null;
}

function find3ToRoyalSuited(cards) {
  const suitMap = buildIndexMap(cards, c=>c.suit);
  for (const [s, idx] of suitMap.entries()) {
    const roy = idx.filter(i => ROYAL.has(cards[i].rank));
    if (roy.length === 3) return roy;
  }
  return null;
}

function is4ToStraight(indices, cards) {
  const vals = uniqSorted(indices.map(i => rVal(cards[i].rank)));
  if (vals.length !== 4) return false;
  const ok = (arr)=> arr[3]-arr[0] <= 4;
  const alt = vals.includes(14) ? uniqSorted(vals.map(v=>v===14?1:v)) : null;
  return ok(vals) || (alt && ok(alt));
}

function find4ToStraight(cards) {
  for (let drop=0; drop<5; drop++) {
    const idx = [0,1,2,3,4].filter(i=>i!==drop);
    if (is4ToStraight(idx, cards)) return idx;
  }
  return null;
}

function find4ToStraightFlush(cards) {
  const suitMap = buildIndexMap(cards, c=>c.suit);
  for (const [s, idx] of suitMap.entries()) {
    if (idx.length < 4) continue;
    // try 4-card subsets by dropping one from idx (small and safe)
    for (let drop=-1; drop<idx.length; drop++) {
      const pick = idx.filter((_,k)=>k!==drop).slice(0,4);
      if (pick.length !== 4) continue;
      if (is4ToStraight(pick, cards)) return pick;
    }
  }
  return null;
}

function find2SuitedHigh(cards) {
  const suitMap = buildIndexMap(cards, c=>c.suit);
  for (const [s, idx] of suitMap.entries()) {
    const hi = idx.filter(i=>rVal(cards[i].rank) >= 11)
      .sort((a,b)=>rVal(cards[b].rank)-rVal(cards[a].rank));
    if (hi.length >= 2) return [hi[0], hi[1]];
  }
  return null;
}

function find2High(cards) {
  const hi = [0,1,2,3,4].filter(i=>rVal(cards[i].rank) >= 11)
    .sort((a,b)=>rVal(cards[b].rank)-rVal(cards[a].rank));
  if (hi.length >= 2) return [hi[0], hi[1]];
  return null;
}

/* =========================
   Deterministic decision engines (hardened)
========================= */
function holdMaskFromIdx(idxs) {
  const hold=[false,false,false,false,false];
  idxs.forEach(i=>hold[i]=true);
  return hold;
}

function solveJobLike(cards, gameLabel) {
  const a = analyzeHand(cards);

  // 1) Straight or better → hold all
  if (["ROYAL_FLUSH","STRAIGHT_FLUSH","FOUR_KIND","FULL_HOUSE","FLUSH","STRAIGHT"].includes(a.made)) {
    return { hold:[true,true,true,true,true], explanation:`Made hand (${a.made.replaceAll("_"," ").toLowerCase()}). Never break it in ${gameLabel}.` };
  }

  // 2) 4 to Royal
  const r4 = find4ToRoyal(cards);
  if (r4) return { hold: holdMaskFromIdx(r4), explanation:`Hold 4 to a Royal Flush (highest-value draw).` };

  // ✅ 3) 3 to Royal suited (HIGH PRIORITY — fixes your A♥J♥T♥ hand)
  const r3 = find3ToRoyalSuited(cards);
  if (r3) return { hold: holdMaskFromIdx(r3), explanation:`Hold 3 to a Royal Flush (suited). This premium draw has strong expected value.` };

  // 4) Quads / full house would have been caught above, but keep hardening:
  if (a.quads) return { hold:[true,true,true,true,true], explanation:`Four of a kind detected. Hold all five.` };

  // 5) Trips
  if (a.trips) return { hold: holdMaskFromIdx(a.trips.idx), explanation:`Hold three of a kind (${a.trips.rank}s).` };

  // 6) Two pair
  if (a.pairs.length === 2) {
    const idx = [...a.pairs[0].idx, ...a.pairs[1].idx];
    return { hold: holdMaskFromIdx(idx), explanation:`Hold two pair.` };
  }

  // 7) One pair (high first, then low)
  if (a.pairs.length === 1) {
    const pr = a.pairs[0].rank;
    const hold = holdMaskFromIdx(a.pairs[0].idx);
    if (rVal(pr) >= 11) return { hold, explanation:`Hold high pair (${pr}${pr}).` };
    // for JOB-like we still usually hold low pair, but allow stronger draws above (already checked r3)
    return { hold, explanation:`Hold low pair (${pr}${pr}).` };
  }

  // 8) 4 to straight flush
  const sf4 = find4ToStraightFlush(cards);
  if (sf4) return { hold: holdMaskFromIdx(sf4), explanation:`Hold 4 to a Straight Flush (premium draw).` };

  // 9) 4 to flush
  if (a.fourFlush) return { hold: holdMaskFromIdx(a.fourFlush.idx), explanation:`Hold 4 to a Flush (strong draw).` };

  // 10) 4 to straight
  const st4 = find4ToStraight(cards);
  if (st4) return { hold: holdMaskFromIdx(st4), explanation:`Hold 4 to a Straight.` };

  // 11) 2 suited high cards
  const hi2s = find2SuitedHigh(cards);
  if (hi2s) return { hold: holdMaskFromIdx(hi2s), explanation:`Hold two suited high cards (improves high-pair / premium draw potential).` };

  // 12) 2 high cards
  const hi2 = find2High(cards);
  if (hi2) return { hold: holdMaskFromIdx(hi2), explanation:`Hold two high cards.` };

  // Default: draw five
  return { hold:[false,false,false,false,false], explanation:`No strong made hand or premium draw — draw five.` };
}

function solveDDB(cards) {
  const a = analyzeHand(cards);

  // Quads: always hold all 5; explain kicker only if it qualifies
  if (a.quads) {
    const quadRank = a.quads.rank;
    const kicker = cards.find(c=>c.rank!==quadRank);
    const k = kicker ? kicker.rank : "?";
    const qualifying = ["A","2","3","4"].includes(k);

    const expl = qualifying
      ? `Four ${quadRank}s with qualifying kicker (${k}). Enhanced Double Double Bonus payout — hold all five.`
      : `Four ${quadRank}s. Always hold all five in Double Double Bonus.`;
    return { hold:[true,true,true,true,true], explanation: expl };
  }

  // Otherwise use hardened job-like skeleton with DDB label
  return solveJobLike(cards, "Double Double Bonus");
}

function solveDeucesWild(cards) {
  const deucesIdx = cards.map((c,i)=>c.rank==="2"?i:-1).filter(i=>i>=0);
  const d = deucesIdx.length;

  if (d > 0) {
    // Always hold deuces; if 3+ deuces hold all 5 (very strong)
    if (d >= 3) {
      return { hold:[true,true,true,true,true], explanation:`${d} deuces (wild). Always hold all five.` };
    }
    const hold = [false,false,false,false,false];
    deucesIdx.forEach(i=>hold[i]=true);
    return { hold, explanation:`Deuces are wild. Never discard a deuce; draw the rest.` };
  }

  // No deuces: fallback to job-like
  return solveJobLike(cards, "Deuces Wild (no deuces)");
}

function solveUltimateX(cards, multiplier, progressive=false) {
  const a = analyzeHand(cards);
  const m = Number(multiplier)||1;

  // Hard safety: at high multiplier never break straight+
  if (m >= 8 && ["ROYAL_FLUSH","STRAIGHT_FLUSH","FOUR_KIND","FULL_HOUSE","FLUSH","STRAIGHT"].includes(a.made)) {
    return {
      hold:[true,true,true,true,true],
      explanation:`Ultimate X ${m}×: preserve made hand (straight or better) to maximize multiplied value.`
    };
  }

  // Use job-like base, annotate
  const base = solveJobLike(cards, progressive ? `Ultimate X Progressive (${m}×)` : `Ultimate X (${m}×)`);
  base.explanation += progressive ? ` Progressive royal value increases premium draws.` : ` Multiplier considered: ${m}×.`;
  return base;
}

/* =========================
   Multiplier trust logic
========================= */
function chooseMultiplier(visionMult, uiMult) {
  const v = Number(visionMult);
  if (Number.isInteger(v) && v >= 2 && v <= 12) return v;
  const u = Number(uiMult);
  if (Number.isInteger(u) && u >= 1 && u <= 12) return u;
  return 1;
}

/* =========================
   WORKER MAIN
========================= */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Unsupported method" }), { status: 405, headers: corsHeaders });
    }

    try {
      const { imageBase64, game, paytable, multiplier = 1 } = await request.json();
      if (!imageBase64 || !game) {
        return new Response(JSON.stringify({ error: "Missing imageBase64 or game" }), { status: 400, headers: corsHeaders });
      }

      // Vision only
      const vision = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis = extractJson(vision);
      const cards = vis.cards || [];

      // Multiplier: trust vision if valid, else UI
      const multUsed = chooseMultiplier(vis.multiplier, multiplier);

      // Strategy
      let result;
      let confidence = 1.0;

      if (game === "job") result = solveJobLike(cards, `Jacks or Better (${paytable})`);
      else if (game === "bonus") result = solveJobLike(cards, `Bonus Poker (${paytable})`);
      else if (game === "double_bonus") result = solveJobLike(cards, `Double Bonus Poker (${paytable})`);
      else if (game === "ddb") result = solveDDB(cards);
      else if (game === "deuces") result = solveDeucesWild(cards);
      else if (game === "ux") result = solveUltimateX(cards, multUsed, false);
      else if (game === "uxp") result = solveUltimateX(cards, multUsed, true);
      else {
        result = { hold:[false,false,false,false,false], explanation:`Unknown game selection.` };
        confidence = 0.6;
      }

      return new Response(JSON.stringify({
        cards,
        hold: result.hold,
        explanation: result.explanation,
        multiplier: multUsed,
        confidence
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};

/* =========================
   OpenAI helpers (bottom)
========================= */
async function callOpenAI(apiKey, prompt, imageBase64){
  const res=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
    body:JSON.stringify({
      model:"gpt-4.1-mini",
      temperature:0,
      messages:[
        { role:"system", content:"Return STRICT JSON only." },
        { role:"user", content:[
          { type:"text", text:prompt },
          { type:"image_url", image_url:{ url:imageBase64 } }
        ]}
      ]
    })
  });
  return await res.json();
}
function extractJson(res){
  const c=res?.choices?.[0]?.message?.content||"";
  const m=c.match(/\{[\s\S]*\}/);
  if(!m) throw new Error("No JSON");
  return JSON.parse(m[0]);
}
