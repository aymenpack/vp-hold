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

/* =========================
   Vision prompt (UX/UXP)
========================= */
function visionPrompt(mode){
  return `
You are reading an IGT Ultimate X / Ultimate X Progressive video poker machine screen.

TASK A (cards):
- Extract EXACTLY 5 playing cards from the ACTIVE BOTTOM ROW (left to right).
- Return rank and suit for each.

TASK B (multiplier):
- Read the SINGLE multiplier shown on the LEFT side of the card row.
- Valid multipliers: 2, 4, 8, 10, 12.
- Return it as a number.
- If you cannot read it confidently, return null.

OUTPUT STRICT JSON ONLY:
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
Return JSON only.
`;
}

/* =========================
   OpenAI helpers
========================= */
async function callOpenAI(apiKey, prompt, imageBase64, timeoutMs=9000){
  const controller = new AbortController();
  const to = setTimeout(()=>controller.abort(), timeoutMs);

  try{
    const res = await fetch("https://api.openai.com/v1/chat/completions",{
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
            { type:"image_url", image_url:{ url:imageBase64 } }
          ]}
        ]
      })
    });

    const text = await res.text();
    let j=null; try{ j=JSON.parse(text);}catch{}
    return { ok: res.ok, status: res.status, json: j, raw: text };
  } catch(e){
    return { ok:false, status:0, json:null, raw:String(e) };
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
    if(seen.has(k)) return "Duplicate cards detected";
    seen.add(k);
  }
  return null;
}

function chooseMultiplier(visionMult, fallback){
  const v = Number(visionMult);
  if(Number.isInteger(v) && [2,4,8,10,12].includes(v)) return { used:v, detected:true };
  const u = Number(fallback);
  if(Number.isInteger(u) && u>=1 && u<=12) return { used:u, detected:false };
  return { used:1, detected:false };
}

/* =========================
   Ultimate X deterministic hold logic (multiplier-aware)
   NOTE: This is a stable, practical strategy engine.
========================= */
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
function isStraight(cards){
  const vals = uniqSorted(cards.map(c=>rv(c.rank)));
  if(vals.length!==5) return false;
  if(vals.join(",")==="2,3,4,5,14") return true;
  return vals[4]-vals[0]===4;
}
function countRanks(cards){
  const m={};
  cards.forEach(c=>m[c.rank]=(m[c.rank]||0)+1);
  return m;
}
function classify(cards){
  const flush=isFlush(cards);
  const straight=isStraight(cards);
  const vals = uniqSorted(cards.map(c=>rv(c.rank)));
  const royal = vals.join(",")==="10,11,12,13,14";
  const counts=Object.values(countRanks(cards)).sort((a,b)=>b-a);

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

function suitedMap(cards){
  const m=new Map();
  cards.forEach((c,i)=>{
    if(!m.has(c.suit)) m.set(c.suit,[]);
    m.get(c.suit).push(i);
  });
  return m;
}
function find4ToRoyal(cards){
  for(const idx of suitedMap(cards).values()){
    const r=idx.filter(i=>ROYAL.has(cards[i].rank));
    if(r.length===4) return r;
  }
  return null;
}
function find3ToRoyal(cards){
  for(const idx of suitedMap(cards).values()){
    const r=idx.filter(i=>ROYAL.has(cards[i].rank));
    if(r.length===3) return r;
  }
  return null;
}
function find4ToFlush(cards){
  for(const idx of suitedMap(cards).values()){
    if(idx.length===4) return idx;
  }
  return null;
}

function holdMaskFromIdx(idxs){
  const hold=[false,false,false,false,false];
  idxs.forEach(i=>hold[i]=true);
  return hold;
}

function decideHoldUltimateX(cards, mult, mode){
  const made = classify(cards);

  // Never break made straight+
  if(["RF","SF","K4","FH","FL","ST"].includes(made)){
    return { hold:[true,true,true,true,true], why:`Made hand (${made}). Always hold all 5.` };
  }

  // Premium draws
  const r4 = find4ToRoyal(cards);
  if(r4) return { hold: holdMaskFromIdx(r4), why:`Hold 4 to a Royal Flush.` };

  const f4 = find4ToFlush(cards);
  if(f4) return { hold: holdMaskFromIdx(f4), why:`Hold 4 to a Flush.` };

  const r3 = find3ToRoyal(cards);
  if(r3) return { hold: holdMaskFromIdx(r3), why:`Hold 3 to a Royal Flush (suited).` };

  // Pairs are valuable, especially under multiplier pressure
  const counts = countRanks(cards);
  const pairRanks = Object.keys(counts).filter(r=>counts[r]===2);

  if(pairRanks.length){
    const pr = pairRanks.sort((a,b)=>rv(b)-rv(a))[0];
    const hold=[false,false,false,false,false];
    cards.forEach((c,i)=>{ if(c.rank===pr) hold[i]=true; });

    if(mult>=4){
      return { hold, why:`Multiplier ${mult}×: keep the pair (${pr}${pr}) instead of drawing five.` };
    }
    return { hold, why:`Keep the pair (${pr}${pr}).` };
  }

  // High multiplier: keep two high cards rather than full redraw
  if(mult>=8){
    const hi = [0,1,2,3,4].filter(i=>rv(cards[i].rank)>=11).sort((a,b)=>rv(cards[b].rank)-rv(cards[a].rank));
    if(hi.length>=2){
      return { hold: holdMaskFromIdx([hi[0],hi[1]]), why:`Multiplier ${mult}×: keep two high cards rather than drawing five.` };
    }
  }

  const suffix = (mode==="uxp") ? " (Progressive)" : "";
  return { hold:[false,false,false,false,false], why:`No premium draw or pair${suffix} — draw five.` };
}

/* =========================
   Worker
========================= */
export default {
  async fetch(request, env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
    if(request.method==="GET") return json({status:"ok"});
    if(request.method!=="POST") return json({error:"bad method"},405);

    try{
      const body = await request.json();
      const { imageBase64, mode="ux", multiplier=1 } = body || {};
      if(!imageBase64) return json({error:"Missing imageBase64"});

      const r = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(mode), imageBase64, 9000);

      if(!r.ok){
        // expose rate limit message when available
        const detail = r.json?.error?.message || r.raw?.slice(0,200);
        return json({ error:"Vision request failed", openai_status:r.status, detail }, 200);
      }

      const parsed = extractJsonFromModel(r.json);
      if(!parsed) return json({error:"Could not parse vision JSON"},200);

      const cards = parsed.cards || [];
      const err = validateCards(cards);
      if(err) return json({error:"Invalid cards", why:err, cards},200);

      const multInfo = chooseMultiplier(parsed.multiplier, multiplier);
      const decision = decideHoldUltimateX(cards, multInfo.used, mode);

      const explanation =
        `${decision.why} ` +
        (multInfo.detected
          ? `Multiplier detected: ${multInfo.used}×.`
          : `Multiplier used (manual fallback): ${multInfo.used}×.`);

      return json({
        cards,
        hold: decision.hold,
        multiplier_detected: multInfo.detected ? multInfo.used : null,
        multiplier_used: multInfo.used,
        explanation,
        confidence: 1.0
      }, 200);

    }catch(e){
      return json({error:"Worker exception", message:String(e?.message||e)},200);
    }
  }
};
