const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function visionPrompt(mode){
  return `
You are reading an IGT Ultimate X video poker machine screen.

TASK:
1) Extract EXACTLY 5 playing cards from the ACTIVE BOTTOM ROW, left to right.
2) Read the SINGLE multiplier on the LEFT side of the row (2X,4X,8X,10X,12X).
   - Return it as a number (2,4,8,10,12).
   - If unclear, return null.

Return STRICT JSON ONLY:
{
  "cards":[
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
Mode: ${mode}
`;
}

async function callOpenAI(apiKey, prompt, imageBase64, timeoutMs=9000){
  const controller = new AbortController();
  const to = setTimeout(()=>controller.abort(), timeoutMs);

  try{
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      signal: controller.signal,
      headers:{
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
          { role:"system", content:"Return STRICT JSON only." },
          { role:"user", content:[
            { type:"text", text: prompt },
            { type:"image_url", image_url:{ url: imageBase64 } }
          ]}
        ]
      })
    });

    const text = await res.text();
    let j=null; try{ j=JSON.parse(text);}catch{}
    return { ok: res.ok, status: res.status, text, json: j };
  } catch(e){
    return { ok:false, status: 0, text:String(e), json:null };
  } finally {
    clearTimeout(to);
  }
}

function extractJsonFromModel(openaiJson){
  const content = openaiJson?.choices?.[0]?.message?.content || "";
  const m = content.match(/\{[\s\S]*\}/);
  if(!m) return null;
  try{ return JSON.parse(m[0]); } catch { return null; }
}

function validateCards(cards){
  if(!Array.isArray(cards) || cards.length!==5) return "Expected exactly 5 cards";
  const R = new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
  const S = new Set(["S","H","D","C"]);
  const seen = new Set();
  for(const c of cards){
    if(!c || typeof c!=="object") return "Invalid card object";
    if(!R.has(c.rank)) return `Invalid rank ${c.rank}`;
    if(!S.has(c.suit)) return `Invalid suit ${c.suit}`;
    const k=c.rank+c.suit;
    if(seen.has(k)) return "Duplicate cards";
    seen.add(k);
  }
  return null;
}

function rv(r){
  if(r==="A") return 14;
  if(r==="K") return 13;
  if(r==="Q") return 12;
  if(r==="J") return 11;
  if(r==="T") return 10;
  return parseInt(r,10);
}

function classifyNonWild(cards){
  const vals = cards.map(c=>rv(c.rank)).sort((a,b)=>a-b);
  const flush = new Set(cards.map(c=>c.suit)).size===1;
  const straight = (new Set(vals).size===5) && (
    (vals[4]-vals[0]===4) || (vals.join(",")==="2,3,4,5,14")
  );
  const counts={}; cards.forEach(c=>counts[c.rank]=(counts[c.rank]||0)+1);
  const freq=Object.values(counts).sort((a,b)=>b-a);
  const royal = vals.join(",")==="10,11,12,13,14";

  if(straight && flush && royal) return "RF";
  if(straight && flush) return "SF";
  if(freq[0]===4) return "K4";
  if(freq[0]===3 && freq[1]===2) return "FH";
  if(flush) return "FL";
  if(straight) return "ST";
  return "OTHER";
}

function decideHoldUltimateX(cards, mult){
  const made = classifyNonWild(cards);

  if(["RF","SF","K4","FH","FL","ST"].includes(made)){
    return { hold:[true,true,true,true,true], why:`Made hand (${made}). Hold all.` };
  }

  // If multiplier is high, keep any pair
  const counts={}; cards.forEach(c=>counts[c.rank]=(counts[c.rank]||0)+1);
  const pairRank = Object.keys(counts).find(r=>counts[r]===2);

  if(mult>=4 && pairRank){
    const hold=[false,false,false,false,false];
    cards.forEach((c,i)=>{ if(c.rank===pairRank) hold[i]=true; });
    return { hold, why:`Multiplier ${mult}×: keep the pair.` };
  }

  return { hold:[false,false,false,false,false], why:`No made hand. Draw five.` };
}

function chooseMultiplier(visionMult, fallback){
  const v = Number(visionMult);
  if(Number.isInteger(v) && v>=2 && v<=12) return v;
  const u = Number(fallback);
  if(Number.isInteger(u) && u>=1 && u<=12) return u;
  return 1;
}

export default {
  async fetch(request, env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
    if(request.method==="GET") return json({status:"ok"});
    if(request.method!=="POST") return json({error:"bad method"},405);

    try{
      const body = await request.json();
      const { imageBase64, mode="ux", multiplier=1 } = body || {};
      if(!imageBase64) return json({error:"Missing imageBase64"},200);

      const prompt = visionPrompt(mode);
      const r = await callOpenAI(env.OPENAI_API_KEY, prompt, imageBase64, 9000);

      if(!r.ok){
        return json({
          error: "Vision request failed",
          openai_status: r.status,
          detail: (r.json?.error?.message) || r.text?.slice(0,200)
        }, 200);
      }

      const parsed = extractJsonFromModel(r.json);
      if(!parsed) return json({error:"Could not parse model JSON"},200);

      const cards = parsed.cards || [];
      const err = validateCards(cards);
      if(err) return json({error: "Invalid cards", why: err, cards},200);

      const usedMult = chooseMultiplier(parsed.multiplier, multiplier);
      const decision = decideHoldUltimateX(cards, usedMult);

      return json({
        cards,
        multiplier: usedMult,
        hold: decision.hold,
        explanation: decision.why,
        confidence: 1.0
      }, 200);

    }catch(e){
      return json({error:"Worker exception", message:String(e?.message||e)},200);
    }
  }
};
