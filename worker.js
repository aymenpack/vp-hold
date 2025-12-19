const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* =========================
   VISION (cards only)
========================= */
function visionPrompt(game) {
  return `
Read the VIDEO POKER screen.

TASK:
- Extract EXACTLY 5 cards from the active (bottom) row, left to right.
- If game is Ultimate X (ux / uxp), also read the SINGLE multiplier shown on the LEFT (e.g. 2x, 4x, 8x, 10x, 12x).
- If multiplier is unclear, return null.

Return STRICT JSON only:
{
  "cards":[{"rank":"A","suit":"S"}, ...],
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
function isHighPair(r){ return rv(r)>=11; }

/* =========================
   BASE STRATEGY (JOB / BONUS / DB)
========================= */
function baseStrategy(cards, gameName){
  const hold=[false,false,false,false,false];
  const made=classify(cards);

  const holdAll=new Set(["ROYAL","STFL","QUADS","FULL","FLUSH","STRAIGHT"]);
  if(holdAll.has(made)){
    return { hold:[true,true,true,true,true], explanation:`Made hand (${made}). Never break it in ${gameName}.` };
  }

  // 4 to Royal
  for(const [s,idx] of suitedMap(cards)){
    const r=idx.filter(i=>ROYAL.has(cards[i].rank));
    if(r.length===4){
      r.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Royal Flush.` };
    }
  }

  // Trips / Two Pair / High Pair
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

  // 4 to Flush
  for(const [s,idx] of suitedMap(cards)){
    if(idx.length===4){
      idx.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 4 to a Flush.` };
    }
  }

  // Low pair
  if(lowPair){
    cards.forEach((c,i)=>{ if(c.rank===lowPair) hold[i]=true; });
    return { hold, explanation:`Hold low pair (${lowPair}${lowPair}).` };
  }

  return { hold:[false,false,false,false,false], explanation:`No strong hand or premium draw — draw five.` };
}

/* =========================
   DOUBLE DOUBLE BONUS
========================= */
function solveDDB(cards){
  const made=classify(cards);
  if(made==="QUADS"){
    const counts=countBy(cards,c=>c.rank);
    const quad=[...counts].find(e=>e[1]===4)[0];
    const kicker=cards.find(c=>c.rank!==quad);
    const kval=kicker?rv(kicker.rank):0;

    if(quad==="A" && kval<=4){
      return { hold:[true,true,true,true,true], explanation:`Quad Aces with qualifying kicker (${kicker.rank}). Highest DDB payout — hold all five.` };
    }
    if(rv(quad)<=4 && kval===14){
      return { hold:[true,true,true,true,true], explanation:`Low quads with Ace kicker. Enhanced DDB payout — hold all five.` };
    }
    return { hold:[true,true,true,true,true], explanation:`Four of a kind. Always hold all five in Double Double Bonus.` };
  }
  return baseStrategy(cards,"Double Double Bonus");
}

/* =========================
   DEUCES WILD
========================= */
function solveDeuces(cards){
  const deuces=cards.filter(c=>c.rank==="2").length;
  const hold=[false,false,false,false,false];

  if(deuces>0){
    cards.forEach((c,i)=>{ if(c.rank==="2") hold[i]=true; });
    if(deuces>=3){
      return { hold:[true,true,true,true,true], explanation:`${deuces} deuces (wild). Always hold all five.` };
    }
    return { hold, explanation:`Deuces are wild. Never discard a deuce.` };
  }

  // No deuces → evaluate as JOB but explanation adjusted
  const res=baseStrategy(cards,"Deuces Wild");
  return { hold:res.hold, explanation:res.explanation };
}

/* =========================
   ULTIMATE X
========================= */
function solveUltimateX(cards, baseGame, mult){
  const base = baseStrategy(cards, baseGame);
  if(mult>=8){
    const made=classify(cards);
    if(["STRAIGHT","FLUSH","FULL","QUADS","STFL","ROYAL"].includes(made)){
      return { hold:[true,true,true,true,true], explanation:`High multiplier (${mult}×). Preserve made hand for future value.` };
    }
  }
  base.explanation += ` (Ultimate X ${mult}× multiplier applied)`;
  return base;
}

/* =========================
   OPENAI HELPERS
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
      if(!imageBase64 || !game) return new Response(JSON.stringify({error:"missing fields"}),{status:400,headers:corsHeaders});

      const vision=await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis=extractJson(vision);
      const cards=vis.cards||[];
      const detMult=vis.multiplier ?? multiplier;

      let res, conf=1.0;

      if(game==="job") res=baseStrategy(cards,"Jacks or Better");
      else if(game==="bonus") res=baseStrategy(cards,"Bonus Poker");
      else if(game==="double_bonus") res=baseStrategy(cards,"Double Bonus Poker");
      else if(game==="ddb") res=solveDDB(cards);
      else if(game==="deuces") res=solveDeuces(cards);
      else if(game==="ux"||game==="uxp") res=solveUltimateX(cards,"Jacks or Better",detMult);
      else {
        res={ hold:[false,false,false,false,false], explanation:`Strategy not implemented.` };
        conf=0.6;
      }

      return new Response(JSON.stringify({
        cards,
        hold:res.hold,
        explanation:res.explanation,
        multiplier:detMult,
        confidence:conf
      }),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});

    }catch(e){
      return new Response(JSON.stringify({error:e.message}),{status:500,headers:corsHeaders});
    }
  }
};
