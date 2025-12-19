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
Read the VIDEO POKER machine.

TASK:
- Extract EXACTLY 5 cards from the active/bottom row, left to right.
- If game is Ultimate X (ux/uxp), also read the SINGLE multiplier shown on the LEFT (e.g., 2x, 4x, 8x, 10x, 12x). If unclear, return null.

Return STRICT JSON only:
{
  "cards":[{"rank":"A","suit":"S"}, ... 5],
  "multiplier": 10
}

Ranks: A K Q J T 9..2
Suits: S H D C
Game: ${game}
`;
}

/* =========================
   COMMON HELPERS
========================= */
const ROYAL = new Set(["A","K","Q","J","T"]);
function rv(r){ return r==="A"?14:r==="K"?13:r==="Q"?12:r==="J"?11:r==="T"?10:+r; }
function uniq(a){ return [...new Set(a)].sort((x,y)=>x-y); }
function countBy(cards, f){
  const m=new Map(); for(const c of cards){ const k=f(c); m.set(k,(m.get(k)||0)+1); } return m;
}
function isFlush(cards){ return new Set(cards.map(c=>c.suit)).size===1; }
function isStraight(vals){
  const v=uniq(vals);
  if(v.length!==5) return false;
  if(v.join(",")==="2,3,4,5,14") return true;
  return v[4]-v[0]===4;
}
function classify(cards){
  const vals=cards.map(c=>rv(c.rank));
  const flush=isFlush(cards);
  const straight=isStraight(vals);
  const counts=[...countBy(cards,c=>c.rank).values()].sort((a,b)=>b-a);

  if(straight && flush && uniq(vals).join(",")==="10,11,12,13,14") return "ROYAL";
  if(straight && flush) return "STFL";
  if(counts[0]===4) return "QUADS";
  if(counts[0]===3 && counts[1]===2) return "FULL";
  if(flush) return "FLUSH";
  if(straight) return "STRAIGHT";
  if(counts[0]===3) return "TRIPS";
  if(counts[0]===2 && counts[1]===2) return "TWOPAIR";
  if(counts[0]===2) return "PAIR";
  return "HIGH";
}
function suitedMap(cards){
  const m=new Map();
  cards.forEach((c,i)=>{ if(!m.has(c.suit)) m.set(c.suit,[]); m.get(c.suit).push(i); });
  return m;
}
function pairRanks(cards){
  const m=countBy(cards,c=>c.rank);
  return [...m.entries()].filter(e=>e[1]===2).map(e=>e[0]).sort((a,b)=>rv(b)-rv(a));
}
function isHighPair(r){ return rv(r)>=11; } // J,Q,K,A

function isFourToStraight(indices, cards){
  if(indices.length!==4) return false;
  const vals = indices.map(i=>rv(cards[i].rank));
  const u=uniq(vals);
  if(u.length!==4) return false;
  const ok = arr => (arr[3]-arr[0] <= 4);
  const alt = u.includes(14) ? uniq(u.map(v=>v===14?1:v)) : null;
  return ok(u) || (alt && ok(alt));
}
function isFourToRoyal(indices, cards){
  if(indices.length!==4) return false;
  const suit = cards[indices[0]].suit;
  if(!indices.every(i=>cards[i].suit===suit)) return false;
  return indices.filter(i=>ROYAL.has(cards[i].rank)).length===4;
}
function isThreeToRoyalSuited(cards){
  const suitMap = suitedMap(cards);
  for(const [s, idx] of suitMap){
    const royalIdx = idx.filter(i=>ROYAL.has(cards[i].rank));
    if(royalIdx.length===3) return royalIdx;
  }
  return null;
}
function isFourToFlush(cards){
  const suitMap=suitedMap(cards);
  for(const [s, idx] of suitMap) if(idx.length===4) return idx;
  return null;
}
function findFourToStraightFlush(cards){
  // try any suit with >=4 cards; check 4-to-straight within that suit
  const suitMap = suitedMap(cards);
  for(const [s, idx] of suitMap){
    if(idx.length<4) continue;
    // check all 4-card subsets by dropping each one (cheap)
    for(let drop=-1; drop<idx.length; drop++){
      const pick = idx.filter((_,k)=>k!==drop).slice(0,4);
      if(pick.length!==4) continue;
      if(isFourToStraight(pick, cards)){
        return pick;
      }
    }
  }
  return null;
}
function findFourToStraight(cards){
  for(let drop=0; drop<5; drop++){
    const pick=[0,1,2,3,4].filter(i=>i!==drop);
    if(isFourToStraight(pick,cards)) return pick;
  }
  return null;
}
function twoSuitedHigh(cards){
  const suitMap = suitedMap(cards);
  for(const [s, idx] of suitMap){
    const hi = idx.filter(i=>rv(cards[i].rank)>=11).sort((a,b)=>rv(cards[b].rank)-rv(cards[a].rank));
    if(hi.length>=2) return [hi[0], hi[1]];
  }
  return null;
}
function twoHigh(cards){
  const hi=[0,1,2,3,4].filter(i=>rv(cards[i].rank)>=11).sort((a,b)=>rv(cards[b].rank)-rv(cards[a].rank));
  if(hi.length>=2) return [hi[0], hi[1]];
  return null;
}

/* =========================
   JOB-like deterministic strategy
   Applies to: JOB, Bonus, Double Bonus
   Key correction included:
   - 3-to-Royal suited is HIGH PRIORITY (before low pair and many weaker lines)
========================= */
function solveJobLike(cards, gameName){
  const hold=[false,false,false,false,false];
  const made = classify(cards);

  // Made hands: straight or better
  if(["ROYAL","STFL","QUADS","FULL","FLUSH","STRAIGHT"].includes(made)){
    return { hold:[true,true,true,true,true], explanation:`Made hand (${made}). Never break it in ${gameName}.` };
  }

  // 4 to Royal (suited)
  for(const [s, idx] of suitedMap(cards)){
    const royalIdx = idx.filter(i=>ROYAL.has(cards[i].rank));
    if(royalIdx.length===4){
      royalIdx.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Royal Flush (highest value draw) in ${gameName}.` };
    }
  }

  // ✅ CORRECTION: 3-to-Royal suited must be high priority
  {
    const r3 = isThreeToRoyalSuited(cards);
    if(r3){
      r3.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 3 to a Royal Flush (suited). This premium draw has higher EV than weak holds (e.g., random high cards).` };
    }
  }

  // Trips / Two pair / High pair
  if(made==="TRIPS"){
    const r=[...countBy(cards,c=>c.rank)].find(e=>e[1]===3)[0];
    cards.forEach((c,i)=>{ if(c.rank===r) hold[i]=true; });
    return { hold, explanation:`Hold three of a kind (${r}s).` };
  }

  if(made==="TWOPAIR"){
    const p=pairRanks(cards);
    cards.forEach((c,i)=>{ if(p.includes(c.rank)) hold[i]=true; });
    return { hold, explanation:`Hold two pair.` };
  }

  let lowPair=null;
  if(made==="PAIR"){
    const p=pairRanks(cards)[0];
    if(isHighPair(p)){
      cards.forEach((c,i)=>{ if(c.rank===p) hold[i]=true; });
      return { hold, explanation:`Hold high pair (${p}${p}).` };
    }
    lowPair=p;
  }

  // 4 to Straight Flush
  {
    const sf = findFourToStraightFlush(cards);
    if(sf){
      sf.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Straight Flush (premium draw).` };
    }
  }

  // 4 to Flush
  {
    const f = isFourToFlush(cards);
    if(f){
      f.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Flush (strong draw).` };
    }
  }

  // Low pair (after premium draws)
  if(lowPair){
    cards.forEach((c,i)=>{ if(c.rank===lowPair) hold[i]=true; });
    return { hold, explanation:`Hold low pair (${lowPair}${lowPair}).` };
  }

  // 4 to Straight
  {
    const st = findFourToStraight(cards);
    if(st){
      st.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Straight.` };
    }
  }

  // Two suited high cards
  {
    const t = twoSuitedHigh(cards);
    if(t){
      t.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold two suited high cards.` };
    }
  }

  // Two high cards
  {
    const t = twoHigh(cards);
    if(t){
      t.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold two high cards.` };
    }
  }

  return { hold:[false,false,false,false,false], explanation:`No strong hand or premium draw — draw five.` };
}

/* =========================
   DDB (Double Double Bonus)
   - Correct quads/kicker handling for payouts
   - Deterministic strategy fallback = job-like
========================= */
function solveDDB(cards){
  const made=classify(cards);
  if(made==="QUADS"){
    // Always hold all 5 on quads in DDB
    const counts=countBy(cards,c=>c.rank);
    const quad=[...counts].find(e=>e[1]===4)[0];
    const kicker=cards.find(c=>c.rank!==quad);
    const k = kicker ? kicker.rank : "?";

    // Qualifying kicker logic: only A/2/3/4 matter for bonus categories (explanation only)
    const kickerQual = ["A","2","3","4"].includes(k);
    return {
      hold:[true,true,true,true,true],
      explanation: kickerQual
        ? `Four ${quad}s with qualifying kicker (${k}). Enhanced DDB payout — hold all five.`
        : `Four ${quad}s. Always hold all five in Double Double Bonus.`
    };
  }
  return solveJobLike(cards, "Double Double Bonus");
}

/* =========================
   Deuces Wild
   Core-correct deterministic behavior:
   - never discard deuces
   - hold all 5 with 3+ deuces
   - otherwise use conservative draws
========================= */
function solveDeuces(cards){
  const hold=[false,false,false,false,false];
  const deuces = cards.filter(c=>c.rank==="2").length;

  if(deuces>0){
    cards.forEach((c,i)=>{ if(c.rank==="2") hold[i]=true; });

    if(deuces>=3){
      return { hold:[true,true,true,true,true], explanation:`${deuces} deuces (wild). Always hold all five.` };
    }
    return { hold, explanation:`Deuces are wild. Never discard a deuce; draw the rest.` };
  }

  // No deuces: treat like job-like but labeled
  return solveJobLike(cards, "Deuces Wild (no deuces)");
}

/* =========================
   Ultimate X / Ultimate X Progressive
   Deterministic & safe:
   - Start with base job-like strategy
   - Apply multiplier-aware overrides
========================= */
function solveUltimateX(cards, mult){
  const base = solveJobLike(cards, `Ultimate X (${mult}x)`);
  const made = classify(cards);

  // Never break straight or better at high multiplier
  if(mult>=8 && ["STRAIGHT","FLUSH","FULL","QUADS","STFL","ROYAL"].includes(made)){
    return { hold:[true,true,true,true,true], explanation:`High multiplier (${mult}x). Preserve made hand (straight or better).` };
  }

  // If multiplier is high and base says “draw five”, still keep 3-to-royal suited if present (already in base)
  base.explanation += ` Multiplier: ${mult}x.`;
  return base;
}

/* =========================
   OpenAI call + JSON extraction
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
      if(!imageBase64 || !game || !paytable) return new Response(JSON.stringify({error:"missing fields"}),{status:400,headers:corsHeaders});

      const vision=await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis=extractJson(vision);
      const cards=vis.cards||[];

      // multiplier: prefer visible from vision; else use provided
      const detMult = (vis.multiplier ?? null) ? vis.multiplier : multiplier;

      let out, conf=1.0;

      if(game==="job") out = solveJobLike(cards, `Jacks or Better (${paytable})`);
      else if(game==="bonus") out = solveJobLike(cards, `Bonus Poker (${paytable})`);
      else if(game==="double_bonus") out = solveJobLike(cards, `Double Bonus Poker (${paytable})`);
      else if(game==="ddb") out = solveDDB(cards);
      else if(game==="deuces") out = solveDeuces(cards);
      else if(game==="ux" || game==="uxp") out = solveUltimateX(cards, detMult);
      else { out={hold:[false,false,false,false,false], explanation:`Unknown game.`}; conf=0.6; }

      return new Response(JSON.stringify({
        cards,
        hold:out.hold,
        explanation:out.explanation,
        multiplier: detMult,
        confidence: conf
      }),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});

    }catch(e){
      return new Response(JSON.stringify({error:e.message}),{status:500,headers:corsHeaders});
    }
  }
};
