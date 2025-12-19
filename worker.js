const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* =========================
   VISION PROMPT
   (cards + multiplier)
========================= */
function visionPrompt(game) {
  return `
You are reading a VIDEO POKER machine screen.

TASK:
1. Identify EXACTLY 5 playing cards in the ACTIVE (BOTTOM) ROW, left to right.
2. IF the game is Ultimate X or Ultimate X Progressive:
   - Read the SINGLE multiplier shown on the LEFT SIDE of the card row (e.g. "2X", "4X", "8X", "10X", "12X").
   - Return it as a number (2,4,8,10,12).
   - If the multiplier is NOT clearly visible, return null.

OUTPUT STRICT JSON ONLY:
{
  "cards": [
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
Game: ${game}
`;
}

/* =========================
   HELPERS
========================= */
const ROYAL = new Set(["A","K","Q","J","T"]);
function rv(r){ return r==="A"?14:r==="K"?13:r==="Q"?12:r==="J"?11:r==="T"?10:+r; }
function uniq(a){ return [...new Set(a)].sort((x,y)=>x-y); }
function countBy(cards, f){
  const m=new Map();
  for(const c of cards){
    const k=f(c);
    m.set(k,(m.get(k)||0)+1);
  }
  return m;
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
  cards.forEach((c,i)=>{
    if(!m.has(c.suit)) m.set(c.suit,[]);
    m.get(c.suit).push(i);
  });
  return m;
}
function pairRanks(cards){
  const m=countBy(cards,c=>c.rank);
  return [...m.entries()].filter(e=>e[1]===2).map(e=>e[0]).sort((a,b)=>rv(b)-rv(a));
}
function isHighPair(r){ return rv(r)>=11; }

/* =========================
   BASE STRATEGY (JOB-LIKE)
========================= */
function solveJobLike(cards, gameName){
  const hold=[false,false,false,false,false];
  const made=classify(cards);

  if(["ROYAL","STFL","QUADS","FULL","FLUSH","STRAIGHT"].includes(made)){
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

  // 3 to Royal (HIGH PRIORITY)
  for(const [s,idx] of suitedMap(cards)){
    const r=idx.filter(i=>ROYAL.has(cards[i].rank));
    if(r.length===3){
      r.forEach(i=>hold[i]=true);
      return { hold, explanation:`Hold 3 to a Royal Flush (suited).` };
    }
  }

  if(made==="TRIPS"){
    const r=[...countBy(cards,c=>c.rank)].find(e=>e[1]===3)[0];
    cards.forEach((c,i)=>{ if(c.rank===r) hold[i]=true; });
    return { hold, explanation:`Hold three of a kind.` };
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

  if(lowPair){
    cards.forEach((c,i)=>{ if(c.rank===lowPair) hold[i]=true; });
    return { hold, explanation:`Hold low pair.` };
  }

  return { hold:[false,false,false,false,false], explanation:`No strong hand or premium draw — draw five.` };
}

/* =========================
   ULTIMATE X STRATEGY
========================= */
function solveUltimateX(cards, multiplier){
  const made=classify(cards);

  // High multiplier: preserve made hands
  if(multiplier>=8 && ["STRAIGHT","FLUSH","FULL","QUADS","STFL","ROYAL"].includes(made)){
    return {
      hold:[true,true,true,true,true],
      explanation:`High Ultimate X multiplier (${multiplier}×). Preserve made hand for future value.`
    };
  }

  const base=solveJobLike(cards, `Ultimate X (${multiplier}×)`);
  base.explanation += ` Multiplier applied: ${multiplier}×.`;
  return base;
}

/* =========================
   OPENAI HELPERS
========================= */
async function callOpenAI(apiKey, prompt, imageBase64){
  const res=await fetch("https://api.openai.com/v1/chat/completions",{
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
      if(!imageBase64 || !game){
        return new Response(JSON.stringify({error:"missing fields"}),{status:400,headers:corsHeaders});
      }

      const vision=await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis=extractJson(vision);
      const cards=vis.cards||[];

      // Trust vision multiplier if valid
      let usedMult = Number.isInteger(vis.multiplier) && vis.multiplier>=2 && vis.multiplier<=12
        ? vis.multiplier
        : Number(multiplier)||1;

      let out, conf=1.0;

      if(game==="job") out=solveJobLike(cards, "Jacks or Better");
      else if(game==="bonus") out=solveJobLike(cards, "Bonus Poker");
      else if(game==="double_bonus") out=solveJobLike(cards, "Double Bonus Poker");
      else if(game==="ddb") out=solveDDB(cards);
      else if(game==="deuces") out=solveDeuces(cards);
      else if(game==="ux"||game==="uxp") out=solveUltimateX(cards, usedMult);
      else { out={hold:[false,false,false,false,false], explanation:`Unknown game.`}; conf=0.6; }

      return new Response(JSON.stringify({
        cards,
        hold: out.hold,
        explanation: out.explanation,
        multiplier: usedMult,
        confidence: conf
      }),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});

    }catch(e){
      return new Response(JSON.stringify({error:e.message}),{status:500,headers:corsHeaders});
    }
  }
};
