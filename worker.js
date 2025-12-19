const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* =========================
   VISION PROMPT (cards only)
========================= */
function visionPrompt(game) {
  return `
You are reading a VIDEO POKER machine screen.

TASK:
- Identify EXACTLY 5 playing cards in the BOTTOM ROW (active hand), left to right.
- Return STRICT JSON ONLY.

If the game is Ultimate X (ux/uxp), also read the SINGLE multiplier shown on the LEFT of the card row (e.g., 2x, 4x, 10x, 12x).
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
Return JSON only. Game: ${game}
`;
}

/* =========================
   Helpers
========================= */
const ROYAL_SET = new Set(["T","J","Q","K","A"]);

function rVal(r){
  if (r === "A") return 14;
  if (r === "K") return 13;
  if (r === "Q") return 12;
  if (r === "J") return 11;
  if (r === "T") return 10;
  return parseInt(r, 10);
}
function sortUniqueVals(vals){ return [...new Set(vals)].sort((a,b)=>a-b); }
function isFlush(cards){ return new Set(cards.map(c=>c.suit)).size === 1; }
function isStraight5(vals){
  const v = sortUniqueVals(vals);
  if (v.length !== 5) return false;
  if (v.join(",") === "2,3,4,5,14") return true; // wheel
  return v[4]-v[0] === 4;
}
function isRoyal(vals){
  const s = sortUniqueVals(vals).join(",");
  return s === "10,11,12,13,14";
}
function countBy(cards, fn){
  const m = new Map();
  for (const c of cards){
    const k = fn(c);
    m.set(k, (m.get(k)||0)+1);
  }
  return m;
}
function classifyMadeHand(cards){
  const vals = cards.map(c=>rVal(c.rank));
  const flush = isFlush(cards);
  const straight = isStraight5(vals);

  const rankCounts = countBy(cards, c=>c.rank);
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
function pairRanks(cards){
  const rankCounts = countBy(cards, c=>c.rank);
  const pairs=[];
  for (const [r,c] of rankCounts.entries()) if (c===2) pairs.push(r);
  pairs.sort((a,b)=>rVal(b)-rVal(a));
  return pairs;
}
function isHighPairRank(r){ return rVal(r) >= 11; } // J,Q,K,A
function suitedMap(cards){
  const m = new Map();
  for (let i=0;i<cards.length;i++){
    const s = cards[i].suit;
    if(!m.has(s)) m.set(s, []);
    m.get(s).push(i);
  }
  return m;
}
function isFourToStraight(indices, cards){
  if (indices.length !== 4) return false;
  const vals = indices.map(i=>rVal(cards[i].rank));
  const u = sortUniqueVals(vals);
  if (u.length !== 4) return false;
  const ok = (arr)=>arr[3]-arr[0] <= 4;
  const wheelAlt = u.includes(14) ? sortUniqueVals(u.map(v=>v===14?1:v)) : null;
  return ok(u) || (wheelAlt && ok(wheelAlt));
}
function isThreeToRoyalSuited(indices, cards){
  if (indices.length !== 3) return false;
  const s = cards[indices[0]].suit;
  if (!indices.every(i=>cards[i].suit===s)) return false;
  const roy = indices.filter(i=>ROYAL_SET.has(cards[i].rank)).length;
  return roy === 3;
}

/* =========================
   Deterministic strategy: JOB + BONUS
   (Rule hierarchy consistent, derived from known optimal charts)
========================= */

function solveJacksOrBetter(cards, paytableKey){
  return solveJobLike(cards, paytableKey, "job");
}

function solveBonusPoker(cards){
  // Bonus Poker plays very similarly to JOB, but we label explanation as Bonus.
  // Major difference is payouts/EV for some edge cases, but this hierarchy is a strong deterministic baseline.
  return solveJobLike(cards, "standard", "bonus");
}

function solveJobLike(cards, paytableKey, mode){
  const made = classifyMadeHand(cards);
  const hold = [false,false,false,false,false];
  const gameName = mode === "bonus" ? "Bonus Poker" : `Jacks or Better ${paytableKey}`;

  // 1) Hold any made straight or better
  const alwaysHoldAll = new Set(["ROYAL_FLUSH","STRAIGHT_FLUSH","FOUR_KIND","FULL_HOUSE","FLUSH","STRAIGHT"]);
  if (alwaysHoldAll.has(made)) {
    return {
      hold: [true,true,true,true,true],
      explanation: `Made hand (${made.replaceAll("_"," ").toLowerCase()}). Never break it in ${gameName}.`
    };
  }

  // 2) 4 to a Royal Flush
  {
    const suitMap = suitedMap(cards);
    for (const [s, idx] of suitMap.entries()){
      const royalIdx = idx.filter(i => ROYAL_SET.has(cards[i].rank));
      if (royalIdx.length === 4) {
        royalIdx.forEach(i=>hold[i]=true);
        return {
          hold,
          explanation: `Hold 4 to a Royal Flush (highest-value draw) in ${gameName}.`
        };
      }
    }
  }

  // 3) Three of a kind / Two pair / High pair
  if (made === "THREE_KIND") {
    const counts = countBy(cards, c=>c.rank);
    let trip = null;
    for (const [r,c] of counts.entries()) if (c===3) trip = r;
    cards.forEach((c,i)=>{ if(c.rank===trip) hold[i]=true; });
    return { hold, explanation: `Hold three of a kind (${trip}s).` };
  }

  if (made === "TWO_PAIR") {
    const pairs = pairRanks(cards);
    cards.forEach((c,i)=>{ if(pairs.includes(c.rank)) hold[i]=true; });
    return { hold, explanation: `Hold two pair (made hand).` };
  }

  // One pair: hold the pair, but low pair can be beaten by premium draws. We'll delay low pair return.
  let lowPairRank = null;
  if (made === "ONE_PAIR") {
    const pr = pairRanks(cards)[0];
    if (isHighPairRank(pr)) {
      cards.forEach((c,i)=>{ if(c.rank===pr) hold[i]=true; });
      return { hold, explanation: `Hold high pair (${pr}${pr}).` };
    } else {
      lowPairRank = pr;
    }
  }

  // 4) 4 to a Straight Flush
  {
    const suitMap = suitedMap(cards);
    for (const [s, idx] of suitMap.entries()){
      if (idx.length < 4) continue;
      // check “drop one” subsets
      for (let drop=-1; drop<idx.length; drop++){
        const pick = idx.filter((_,k)=>k!==drop).slice(0,4);
        if (pick.length !== 4) continue;
        if (!pick.every(i=>cards[i].suit===s)) continue;
        if (isFourToStraight(pick, cards)) {
          pick.forEach(i=>hold[i]=true);
          return { hold, explanation: `Hold 4 to a Straight Flush (premium draw) in ${gameName}.` };
        }
      }
    }
  }

  // 5) 4 to a Flush
  {
    const suitMap = suitedMap(cards);
    for (const [s, idx] of suitMap.entries()){
      if (idx.length === 4){
        idx.forEach(i=>hold[i]=true);
        return { hold, explanation: `Hold 4 to a Flush (strong draw).` };
      }
    }
  }

  // 6) Low pair (if present)
  if (lowPairRank) {
    cards.forEach((c,i)=>{ if(c.rank===lowPairRank) hold[i]=true; });
    return { hold, explanation: `Hold low pair (${lowPairRank}${lowPairRank}).` };
  }

  // 7) 3 to a Royal Flush (suited)
  {
    const suitMap = suitedMap(cards);
    for (const [s, idx] of suitMap.entries()){
      const royalIdx = idx.filter(i => ROYAL_SET.has(cards[i].rank));
      if (royalIdx.length === 3){
        royalIdx.forEach(i=>hold[i]=true);
        return { hold, explanation: `Hold 3 to a Royal Flush (suited).` };
      }
    }
  }

  // 8) 4 to a Straight
  {
    for (let drop=0; drop<5; drop++){
      const pick = [0,1,2,3,4].filter(i=>i!==drop);
      if (isFourToStraight(pick, cards)){
        pick.forEach(i=>hold[i]=true);
        return { hold, explanation: `Hold 4 to a Straight.` };
      }
    }
  }

  // 9) 2 suited high cards (J+), else 2 high cards
  {
    const suitMap = suitedMap(cards);
    for (const [s, idx] of suitMap.entries()){
      const hi = idx.filter(i=>rVal(cards[i].rank) >= 11).sort((a,b)=>rVal(cards[b].rank)-rVal(cards[a].rank));
      if (hi.length >= 2){
        hold[hi[0]]=true; hold[hi[1]]=true;
        return { hold, explanation: `Hold two suited high cards.` };
      }
    }
    const hi2 = [0,1,2,3,4].filter(i=>rVal(cards[i].rank) >= 11).sort((a,b)=>rVal(cards[b].rank)-rVal(cards[a].rank));
    if (hi2.length >= 2){
      hold[hi2[0]]=true; hold[hi2[1]]=true;
      return { hold, explanation: `Hold two high cards.` };
    }
  }

  // Default: draw five
  return { hold:[false,false,false,false,false], explanation:`No strong made hand or premium draw — draw five.` };
}

/* =========================
   OpenAI call + JSON extraction
========================= */
async function callOpenAI(apiKey, prompt, imageBase64){
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      model:"gpt-4.1-mini",
      temperature:0,
      messages:[
        { role:"system", content:"Return STRICT JSON only." },
        { role:"user", content:[
            { type:"text", text: prompt },
            { type:"image_url", image_url:{ url:imageBase64 } }
        ]}
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
      return new Response(JSON.stringify({ status:"Worker alive" }), {
        status:200,
        headers:{ ...corsHeaders, "Content-Type":"application/json" }
      });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error:"Unsupported method" }), {
        status:405,
        headers:corsHeaders
      });
    }

    try {
      const { imageBase64, game, paytable, multiplier = 1 } = await request.json();
      if (!imageBase64 || !game || !paytable) {
        return new Response(JSON.stringify({ error:"Missing image, game, or paytable" }), {
          status:400, headers:corsHeaders
        });
      }

      // 1) Vision only
      const vision = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis = extractJson(vision);
      const cards = vis.cards || [];
      const detectedMult = vis.multiplier ?? null;

      // 2) Deterministic strategy
      let result;
      let confidence = 1.0;

      if (game === "job") {
        result = solveJacksOrBetter(cards, paytable);
      } else if (game === "bonus") {
        result = solveBonusPoker(cards);
      } else {
        result = {
          hold:[false,false,false,false,false],
          explanation:`Strategy engine not implemented yet for "${game}". Currently implemented: Jacks or Better + Bonus Poker.`
        };
        confidence = 0.6;
      }

      return new Response(JSON.stringify({
        cards,
        hold: result.hold,
        explanation: result.explanation,
        multiplier: detectedMult,
        confidence
      }), {
        status:200,
        headers:{ ...corsHeaders, "Content-Type":"application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status:500,
        headers:corsHeaders
      });
    }
  }
};
