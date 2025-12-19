const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* =========================
   Vision prompt
========================= */
function visionPrompt(game) {
  return `
Read the VIDEO POKER machine screen.

TASK:
1) Identify EXACTLY 5 playing cards in the ACTIVE BOTTOM ROW, left to right.
2) If game is Ultimate X or Ultimate X Progressive:
   - Read the SINGLE multiplier shown on the LEFT of the card row (e.g. 2X,4X,8X,10X,12X).
   - Return it as a number (2,4,8,10,12).
   - If not clearly visible, return null.

Return STRICT JSON only:
{
  "cards":[{"rank":"A","suit":"H"},{"rank":"J","suit":"H"},{"rank":"T","suit":"H"},{"rank":"4","suit":"D"},{"rank":"5","suit":"C"}],
  "multiplier": 8
}

Ranks: A,K,Q,J,T,9..2
Suits: S,H,D,C
Game: ${game}
`;
}

/* =========================
   OpenAI helpers (ONCE)
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

function extractJson(res) {
  const content = res?.choices?.[0]?.message?.content || "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON returned by model");
  return JSON.parse(match[0]);
}

/* =========================
   Card helpers + analysis
========================= */
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
  return [...new Set(vals)].sort((a,b)=>a-b);
}

function countBy(cards, keyFn) {
  const m = new Map();
  for (const c of cards) {
    const k = keyFn(c);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function buildIndexMap(cards, keyFn) {
  const m = new Map();
  cards.forEach((c,i)=>{
    const k = keyFn(c);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(i);
  });
  return m;
}

function isFlush(cards) {
  return new Set(cards.map(c=>c.suit)).size === 1;
}

function isStraight(vals) {
  const v = uniqSorted(vals);
  if (v.length !== 5) return false;
  if (v.join(",") === "2,3,4,5,14") return true;
  return v[4] - v[0] === 4;
}

function classify5(cards) {
  const vals = cards.map(c=>rVal(c.rank));
  const flush = isFlush(cards);
  const straight = isStraight(vals);
  const counts = [...countBy(cards,c=>c.rank).values()].sort((a,b)=>b-a);

  if (straight && flush && uniqSorted(vals).join(",")==="10,11,12,13,14") return "ROYAL_FLUSH";
  if (straight && flush) return "STRAIGHT_FLUSH";
  if (counts[0]===4) return "FOUR_KIND";
  if (counts[0]===3 && counts[1]===2) return "FULL_HOUSE";
  if (flush) return "FLUSH";
  if (straight) return "STRAIGHT";
  if (counts[0]===3) return "THREE_KIND";
  if (counts[0]===2 && counts[1]===2) return "TWO_PAIR";
  if (counts[0]===2) return "ONE_PAIR";
  return "HIGH_CARD";
}

/* =========================
   Analyze + decision logic
   (unchanged, hardened)
========================= */

function analyzeHand(cards) {
  const rankToIdx = buildIndexMap(cards, c=>c.rank);
  const suitToIdx = buildIndexMap(cards, c=>c.suit);

  const rankCounts = [...rankToIdx.entries()]
    .map(([rank, idx]) => ({ rank, count: idx.length, idx }))
    .sort((a,b)=> b.count-a.count || rVal(b.rank)-rVal(a.rank));

  const suitCounts = [...suitToIdx.entries()]
    .map(([suit, idx]) => ({ suit, count: idx.length, idx }))
    .sort((a,b)=> b.count-a.count);

  const vals = cards.map(c=>rVal(c.rank));

  return {
    rankCounts,
    suitCounts,
    made: classify5(cards),
    quads: rankCounts.find(x=>x.count===4) || null,
    trips: rankCounts.find(x=>x.count===3) || null,
    pairs: rankCounts.filter(x=>x.count===2),
    fourFlush: suitCounts.find(x=>x.count===4) || null,
    straight: isStraight(vals),
    flush: isFlush(cards),
  };
}

/* =========================
   Pattern finders
========================= */
function find4ToRoyal(cards) {
  const suitMap = buildIndexMap(cards, c=>c.suit);
  for (const idx of suitMap.values()) {
    const r = idx.filter(i=>ROYAL.has(cards[i].rank));
    if (r.length===4) return r;
  }
  return null;
}

function find3ToRoyalSuited(cards) {
  const suitMap = buildIndexMap(cards, c=>c.suit);
  for (const idx of suitMap.values()) {
    const r = idx.filter(i=>ROYAL.has(cards[i].rank));
    if (r.length===3) return r;
  }
  return null;
}

/* =========================
   Decision engines
========================= */
function holdMaskFromIdx(idxs) {
  const hold = [false,false,false,false,false];
  idxs.forEach(i=>hold[i]=true);
  return hold;
}

function solveJobLike(cards, label) {
  const a = analyzeHand(cards);

  if (["ROYAL_FLUSH","STRAIGHT_FLUSH","FOUR_KIND","FULL_HOUSE","FLUSH","STRAIGHT"].includes(a.made)) {
    return { hold:[true,true,true,true,true], explanation:`Made hand (${a.made.replaceAll("_"," ").toLowerCase()}). Never break it in ${label}.` };
  }

  const r4 = find4ToRoyal(cards);
  if (r4) return { hold: holdMaskFromIdx(r4), explanation:`Hold 4 to a Royal Flush.` };

  const r3 = find3ToRoyalSuited(cards);
  if (r3) return { hold: holdMaskFromIdx(r3), explanation:`Hold 3 to a Royal Flush (suited).` };

  if (a.quads) return { hold:[true,true,true,true,true], explanation:`Four of a kind. Hold all five.` };

  if (a.trips) return { hold: holdMaskFromIdx(a.trips.idx), explanation:`Hold three of a kind.` };

  if (a.pairs.length===2) {
    const idx=[...a.pairs[0].idx,...a.pairs[1].idx];
    return { hold: holdMaskFromIdx(idx), explanation:`Hold two pair.` };
  }

  if (a.pairs.length===1) {
    const pr=a.pairs[0].rank;
    return {
      hold: holdMaskFromIdx(a.pairs[0].idx),
      explanation: rVal(pr)>=11 ? `Hold high pair (${pr}${pr}).` : `Hold low pair (${pr}${pr}).`
    };
  }

  if (a.fourFlush) return { hold: holdMaskFromIdx(a.fourFlush.idx), explanation:`Hold 4 to a Flush.` };

  return { hold:[false,false,false,false,false], explanation:`No strong hand or premium draw — draw five.` };
}

function solveDDB(cards) {
  const a = analyzeHand(cards);
  if (a.quads) {
    const quadRank = a.quads.rank;
    const kicker = cards.find(c=>c.rank!==quadRank)?.rank;
    const qual = ["A","2","3","4"].includes(kicker);
    return {
      hold:[true,true,true,true,true],
      explanation: qual
        ? `Four ${quadRank}s with qualifying kicker (${kicker}). Enhanced DDB payout — hold all five.`
        : `Four ${quadRank}s. Always hold all five in Double Double Bonus.`
    };
  }
  return solveJobLike(cards, "Double Double Bonus");
}

function solveDeucesWild(cards) {
  const deucesIdx = cards.map((c,i)=>c.rank==="2"?i:-1).filter(i=>i>=0);
  if (deucesIdx.length>0) {
    if (deucesIdx.length>=3) return { hold:[true,true,true,true,true], explanation:`${deucesIdx.length} deuces (wild). Always hold all five.` };
    const hold=[false,false,false,false,false];
    deucesIdx.forEach(i=>hold[i]=true);
    return { hold, explanation:`Deuces are wild. Never discard a deuce.` };
  }
  return solveJobLike(cards, "Deuces Wild (no deuces)");
}

function solveUltimateX(cards, mult, progressive=false) {
  const a = analyzeHand(cards);
  if (mult>=8 && ["ROYAL_FLUSH","STRAIGHT_FLUSH","FOUR_KIND","FULL_HOUSE","FLUSH","STRAIGHT"].includes(a.made)) {
    return { hold:[true,true,true,true,true], explanation:`Ultimate X ${mult}× — preserve made hand for multiplied value.` };
  }
  const base = solveJobLike(cards, progressive ? "Ultimate X Progressive" : "Ultimate X");
  base.explanation += ` Multiplier: ${mult}×.`;
  return base;
}

function chooseMultiplier(visionMult, uiMult) {
  const v = Number(visionMult);
  if (Number.isInteger(v) && v>=2 && v<=12) return v;
  const u = Number(uiMult);
  if (Number.isInteger(u) && u>=1 && u<=12) return u;
  return 1;
}

/* =========================
   WORKER
========================= */
export default {
  async fetch(request, env) {
    if (request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
    if (request.method==="GET") return new Response(JSON.stringify({status:"ok"}),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});
    if (request.method!=="POST") return new Response(JSON.stringify({error:"bad method"}),{status:405,headers:corsHeaders});

    try {
      const { imageBase64, game, paytable, multiplier=1 } = await request.json();
      if (!imageBase64 || !game) {
        return new Response(JSON.stringify({error:"missing fields"}),{status:400,headers:corsHeaders});
      }

      const vision = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis = extractJson(vision);
      const cards = vis.cards || [];

      const multUsed = chooseMultiplier(vis.multiplier, multiplier);

      let result;
      if (game==="job") result = solveJobLike(cards, "Jacks or Better");
      else if (game==="bonus") result = solveJobLike(cards, "Bonus Poker");
      else if (game==="double_bonus") result = solveJobLike(cards, "Double Bonus Poker");
      else if (game==="ddb") result = solveDDB(cards);
      else if (game==="deuces") result = solveDeucesWild(cards);
      else if (game==="ux") result = solveUltimateX(cards, multUsed, false);
      else if (game==="uxp") result = solveUltimateX(cards, multUsed, true);
      else result = { hold:[false,false,false,false,false], explanation:`Unknown game.` };

      return new Response(JSON.stringify({
        cards,
        hold: result.hold,
        explanation: result.explanation,
        multiplier: multUsed,
        confidence: 1.0
      }),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});

    } catch (err) {
      return new Response(JSON.stringify({error:err.message}),{status:500,headers:corsHeaders});
    }
  }
};
