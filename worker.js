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
function sortUnique(vals){ return [...new Set(vals)].sort((a,b)=>a-b); }
function isFlush(cards){ return new Set(cards.map(c=>c.suit)).size === 1; }
function isStraight5(vals){
  const v = sortUnique(vals);
  if (v.length !== 5) return false;
  if (v.join(",") === "2,3,4,5,14") return true;
  return v[4] - v[0] === 4;
}
function isRoyal(vals){
  return sortUnique(vals).join(",") === "10,11,12,13,14";
}
function countBy(cards, fn){
  const m = new Map();
  for (const c of cards){
    const k = fn(c);
    m.set(k, (m.get(k)||0)+1);
  }
  return m;
}
function classify(cards){
  const vals = cards.map(c=>rVal(c.rank));
  const flush = isFlush(cards);
  const straight = isStraight5(vals);
  const counts = [...countBy(cards,c=>c.rank).values()].sort((a,b)=>b-a);

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
  const m = countBy(cards,c=>c.rank);
  const pairs=[];
  for (const [r,c] of m.entries()) if (c===2) pairs.push(r);
  pairs.sort((a,b)=>rVal(b)-rVal(a));
  return pairs;
}
function isHighPair(r){ return rVal(r) >= 11; }
function suitedMap(cards){
  const m=new Map();
  cards.forEach((c,i)=>{
    if(!m.has(c.suit)) m.set(c.suit,[]);
    m.get(c.suit).push(i);
  });
  return m;
}
function isFourToStraight(idxs,cards){
  const vals = idxs.map(i=>rVal(cards[i].rank));
  const u = sortUnique(vals);
  if (u.length !== 4) return false;
  const ok = arr => arr[3]-arr[0] <= 4;
  const alt = u.includes(14) ? sortUnique(u.map(v=>v===14?1:v)) : null;
  return ok(u) || (alt && ok(alt));
}

/* =========================
   Deterministic Strategy
========================= */

function solveJob(cards, paytable){
  return solveBase(cards, "Jacks or Better");
}

function solveBonus(cards){
  return solveBase(cards, "Bonus Poker");
}

function solveDoubleBonus(cards){
  const base = solveBase(cards, "Double Bonus Poker");
  // Explanation tweak for quad incentives
  if (classify(cards) === "FOUR_KIND") {
    const counts = countBy(cards,c=>c.rank);
    const quadRank = [...counts.entries()].find(([r,c])=>c===4)[0];
    base.explanation = `Holding four ${quadRank}s. Quad payouts are enhanced in Double Bonus Poker.`;
  }
  return base;
}

function solveBase(cards, gameName){
  const made = classify(cards);
  const hold = [false,false,false,false,false];

  // 1) Straight or better
  if (["ROYAL_FLUSH","STRAIGHT_FLUSH","FOUR_KIND","FULL_HOUSE","FLUSH","STRAIGHT"].includes(made)){
    return {
      hold:[true,true,true,true,true],
      explanation:`Made hand (${made.replaceAll("_"," ").toLowerCase()}). Never break it in ${gameName}.`
    };
  }

  // 2) 4 to Royal
  for (const [s,idx] of suitedMap(cards)){
    const r = idx.filter(i=>ROYAL_SET.has(cards[i].rank));
    if (r.length === 4){
      r.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Royal Flush in ${gameName}.` };
    }
  }

  // 3) Trips / Two Pair / High Pair
  if (made === "THREE_KIND"){
    const m = countBy(cards,c=>c.rank);
    const trip=[...m.entries()].find(([r,c])=>c===3)[0];
    cards.forEach((c,i)=>{ if(c.rank===trip) hold[i]=true; });
    return { hold, explanation:`Hold three of a kind (${trip}s).` };
  }

  if (made === "TWO_PAIR"){
    const p = pairRanks(cards);
    cards.forEach((c,i)=>{ if(p.includes(c.rank)) hold[i]=true; });
    return { hold, explanation:`Hold two pair.` };
  }

  let lowPair=null;
  if (made === "ONE_PAIR"){
    const pr = pairRanks(cards)[0];
    if (isHighPair(pr)){
      cards.forEach((c,i)=>{ if(c.rank===pr) hold[i]=true; });
      return { hold, explanation:`Hold high pair (${pr}${pr}).` };
    }
    lowPair=pr;
  }

  // 4) 4 to Straight Flush
  for (const [s,idx] of suitedMap(cards)){
    if (idx.length>=4){
      for (let d=-1; d<idx.length; d++){
        const pick = idx.filter((_,k)=>k!==d).slice(0,4);
        if (pick.length===4 && isFourToStraight(pick,cards)){
          pick.forEach(i=>hold[i]=true);
          return { hold, explanation:`Hold 4 to a Straight Flush.` };
        }
      }
    }
  }

  // 5) 4 to Flush
  for (const [s,idx] of suitedMap(cards)){
    if (idx.length===4){
      idx.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Flush.` };
    }
  }

  // 6) Low pair
  if (lowPair){
    cards.forEach((c,i)=>{ if(c.rank===lowPair) hold[i]=true; });
    return { hold, explanation:`Hold low pair (${lowPair}${lowPair}).` };
  }

  // 7) 3 to Royal (suited)
  for (const [s,idx] of suitedMap(cards)){
    const r = idx.filter(i=>ROYAL_SET.has(cards[i].rank));
    if (r.length===3){
      r.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 3 to a Royal Flush (suited).` };
    }
  }

  // 8) 4 to Straight
  for (let d=0; d<5; d++){
    const pick=[0,1,2,3,4].filter(i=>i!==d);
    if (isFourToStraight(pick,cards)){
      pick.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Straight.` };
    }
  }

  // 9) Two high cards
  const hi = cards.map((c,i)=>({i,v:rVal(c.rank)})).filter(o=>o.v>=11).sort((a,b)=>b.v-a.v);
  if (hi.length>=2){
    hold[hi[0].i]=true; hold[hi[1].i]=true;
    return { hold, explanation:`Hold two high cards.` };
  }

  return { hold:[false,false,false,false,false], explanation:`No strong made hand or premium draw — draw five.` };
}

/* =========================
   OpenAI helpers
========================= */
async function callOpenAI(apiKey, prompt, imageBase64){
  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${apiKey}`,
      "Content-Type":"application/json"
    },
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
  const c = res?.choices?.[0]?.message?.content || "";
  const m = c.match(/\{[\s\S]*\}/);
  if(!m) throw new Error("No JSON from model");
  return JSON.parse(m[0]);
}

/* =========================
   WORKER
========================= */
export default {
  async fetch(request, env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
    if(request.method==="GET") return new Response(JSON.stringify({status:"ok"}),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});
    if(request.method!=="POST") return new Response(JSON.stringify({error:"bad method"}),{status:405,headers:corsHeaders});

    try{
      const { imageBase64, game, paytable, multiplier=1 } = await request.json();
      if(!imageBase64 || !game || !paytable){
        return new Response(JSON.stringify({error:"missing fields"}),{status:400,headers:corsHeaders});
      }

      const vision = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis = extractJson(vision);
      const cards = vis.cards || [];
      const detectedMult = vis.multiplier ?? null;

      let result, confidence=1.0;
      if(game==="job") result = solveJob(cards,paytable);
      else if(game==="bonus") result = solveBonus(cards);
      else if(game==="double_bonus") result = solveDoubleBonus(cards);
      else {
        result = { hold:[false,false,false,false,false], explanation:`Strategy not implemented yet for ${game}.` };
        confidence = 0.6;
      }

      return new Response(JSON.stringify({
        cards,
        hold: result.hold,
        explanation: result.explanation,
        multiplier: detectedMult,
        confidence
      }),{
        status:200,
        headers:{...corsHeaders,"Content-Type":"application/json"}
      });

    }catch(e){
      return new Response(JSON.stringify({error:e.message}),{status:500,headers:corsHeaders});
    }
  }
};
