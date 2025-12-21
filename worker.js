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
    const text = await res.text();
    let j=null; try{ j=JSON.parse(text);}catch{}
    return { ok: res.ok, status: res.status, json: j, raw: text };
  }catch(e){
    return { ok:false, status:0, json:null, raw:String(e) };
  }finally{
    clearTimeout(to);
  }
}

function extractJson(openaiJson){
  const content = openaiJson?.choices?.[0]?.message?.content || "";
  const m = content.match(/\{[\s\S]*\}/);
  if(!m) return null;
  try{ return JSON.parse(m[0]); } catch { return null; }
}

function validateCards(cards){
  if(!Array.isArray(cards) || cards.length!==5) return "Need exactly 5 cards";
  const R=new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
  const S=new Set(["S","H","D","C"]);
  const seen=new Set();
  for(const c of cards){
    if(!c || typeof c!=="object") return "Bad card object";
    if(!R.has(c.rank)) return `Bad rank ${c.rank}`;
    if(!S.has(c.suit)) return `Bad suit ${c.suit}`;
    const k=c.rank+c.suit;
    if(seen.has(k)) return "Duplicate cards";
    seen.add(k);
  }
  return null;
}

function sanitizeMult(x){
  const v = Number(x);
  if(!Number.isFinite(v)) return null;
  const i = Math.round(v);
  if(i<1 || i>12) return null;
  return i;
}

function chooseMultipliers(visionArr, fallbackArr){
  const detected=[null,null,null];
  const used=[1,1,1];
  for(let i=0;i<3;i++){
    const v = Array.isArray(visionArr) ? sanitizeMult(visionArr[i]) : null;
    const f = Array.isArray(fallbackArr) ? sanitizeMult(fallbackArr[i]) : null;
    if(v!=null){ detected[i]=v; used[i]=v; }
    else if(f!=null){ used[i]=f; }
    else used[i]=1;
  }
  return { detected, used, total: used[0]+used[1]+used[2] };
}

function strategyMode(total){
  return total>=14 ? "CONVENTIONAL" : "WEIGHTED";
}

/* ---------- 6/5 Bonus EV engine (same as before, but kept) ---------- */
const RANKS=["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS=["S","H","D","C"];
const rv=r=>r==="A"?14:r==="K"?13:r==="Q"?12:r==="J"?11:r==="T"?10:parseInt(r,10);
const uniqSorted=vals=>[...new Set(vals)].sort((a,b)=>a-b);
const isFlush=cards=>new Set(cards.map(c=>c.suit)).size===1;
function isStraight(cards){
  const v=uniqSorted(cards.map(c=>rv(c.rank)));
  if(v.length!==5) return false;
  if(v.join(",")==="2,3,4,5,14") return true;
  return v[4]-v[0]===4;
}
function countRanks(cards){
  const m={}; cards.forEach(c=>m[c.rank]=(m[c.rank]||0)+1); return m;
}
function classify(cards){
  const vals=uniqSorted(cards.map(c=>rv(c.rank)));
  const flush=isFlush(cards);
  const straight=isStraight(cards);
  const royal=vals.join(",")==="10,11,12,13,14";
  const freq=Object.values(countRanks(cards)).sort((a,b)=>b-a);

  if(straight && flush && royal) return "RF";
  if(straight && flush) return "SF";
  if(freq[0]===4) return "4K";
  if(freq[0]===3 && freq[1]===2) return "FH";
  if(flush) return "FL";
  if(straight) return "ST";
  if(freq[0]===3) return "3K";
  if(freq[0]===2 && freq[1]===2) return "2P";
  if(freq[0]===2){
    const counts=countRanks(cards);
    const pr=Object.keys(counts).find(r=>counts[r]===2);
    if(rv(pr)>=11) return "HP";
  }
  return "N";
}
function payout65(cards){
  const t=classify(cards);
  if(t==="RF") return 800;
  if(t==="SF") return 50;
  if(t==="4K"){
    const counts=countRanks(cards);
    const q=Object.keys(counts).find(r=>counts[r]===4);
    return q==="A" ? 80 : 40;
  }
  if(t==="FH") return 6;
  if(t==="FL") return 5;
  if(t==="ST") return 4;
  if(t==="3K") return 3;
  if(t==="2P") return 2;
  if(t==="HP") return 1;
  return 0;
}
function buildDeck(exclude){
  const used=new Set(exclude.map(c=>c.rank+c.suit));
  const deck=[];
  for(const r of RANKS) for(const s of SUITS){
    const k=r+s;
    if(!used.has(k)) deck.push({rank:r,suit:s});
  }
  return deck;
}
function comboIter(arr,k,fn){
  const n=arr.length;
  if(k===0){ fn([]); return; }
  const idx=Array.from({length:k},(_,i)=>i);
  while(true){
    fn(idx.map(i=>arr[i]));
    let i=k-1;
    while(i>=0 && idx[i]===i+n-k) i--;
    if(i<0) break;
    idx[i]++;
    for(let j=i+1;j<k;j++) idx[j]=idx[j-1]+1;
  }
}
function evForHold(cards, holdMask){
  const held=cards.filter((_,i)=>holdMask[i]);
  const need=5-held.length;
  const deck=buildDeck(cards);
  let total=0,count=0;
  comboIter(deck, need, draw=>{
    total += payout65(held.concat(draw));
    count++;
  });
  return total/count;
}
function bestHoldEV(cards){
  let bestEV=-1e9;
  let bestMask=0;
  for(let mask=0; mask<32; mask++){
    const hold=[0,1,2,3,4].map(i=>!!(mask&(1<<i)));
    const ev=evForHold(cards, hold);
    if(ev>bestEV){ bestEV=ev; bestMask=mask; }
  }
  return { hold:[0,1,2,3,4].map(i=>!!(bestMask&(1<<i))), ev:bestEV };
}

export default {
  async fetch(request, env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
    if(request.method==="GET") return json({status:"ok"});
    if(request.method!=="POST") return json({error:"bad method"},405);

    try{
      const body = await request.json();
      const { imageBase64, mode="ux", multipliers_fallback=[1,1,1] } = body || {};
      if(!imageBase64) return json({error:"Missing imageBase64"},200);

      // SHORT prompt (cheaper)
      const prompt =
        `Extract JSON with keys cards (5) and multipliers (3). ` +
        `Cards are bottom row left->right. ` +
        `Multipliers are for triple play hands (1..12), null if unread.`;

      const r = await callOpenAI(env.OPENAI_API_KEY, prompt, imageBase64, 9000);
      if(!r.ok){
        const detail = r.json?.error?.message || r.raw?.slice(0,200);
        return json({ error:"Vision request failed", openai_status:r.status, detail },200);
      }

      const parsed = extractJson(r.json);
      if(!parsed) return json({error:"Could not parse vision JSON"},200);

      const cards = parsed.cards || [];
      const err = validateCards(cards);
      if(err) return json({error:"Invalid cards", why:err, cards},200);

      const multInfo = chooseMultipliers(parsed.multipliers, multipliers_fallback);
      const badge = strategyMode(multInfo.total);

      const best = bestHoldEV(cards);
      const ev_single = best.ev;
      const ev_total = ev_single * multInfo.total;

      return json({
        cards,
        hold: best.hold,
        multipliers_detected: multInfo.detected,
        multipliers_used: multInfo.used,
        multiplier_total: multInfo.total,
        mode_badge: badge,
        ev_single,
        ev_total,
        explanation: `6/5 Bonus · Total ${multInfo.total}× (${badge}). EV(single) ${ev_single.toFixed(4)}, EV(total) ${ev_total.toFixed(4)}.`,
        confidence: 1.0
      },200);

    }catch(e){
      return json({error:"Worker exception", message:String(e?.message||e)},200);
    }
  }
};
