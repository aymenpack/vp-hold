const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* =========================
   Vision prompt (UX only)
========================= */
function visionPrompt(mode) {
  return `
You are reading an IGT Ultimate X video poker machine screen.

TASK:
1) Identify EXACTLY 5 playing cards in the ACTIVE BOTTOM ROW, left to right.
2) Read the SINGLE multiplier shown on the LEFT side of the card row (e.g. 2X,4X,8X,10X,12X).
   - Return it as a number: 2,4,8,10,12.
   - If not clearly visible, return null.

Return STRICT JSON only:
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

/* =========================
   OpenAI helpers
========================= */
async function callOpenAI(apiKey, prompt, imageBase64, timeoutMs = 9000) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "Return STRICT JSON only." },
          { role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageBase64 } }
          ] }
        ]
      })
    });

    const text = await res.text();
    let j = null;
    try { j = JSON.parse(text); } catch {}

    if (!res.ok) {
      // pass back helpful info
      return { ok: false, status: res.status, raw: text, json: j };
    }
    return { ok: true, status: res.status, raw: text, json: j };
  } finally {
    clearTimeout(to);
  }
}

function extractJsonFromModel(openaiJson) {
  const content = openaiJson?.choices?.[0]?.message?.content || "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function validateCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) return "Expected exactly 5 cards";
  const validRanks = new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
  const validSuits = new Set(["S","H","D","C"]);
  const set = new Set();
  for (const c of cards) {
    if (!c || typeof c !== "object") return "Card is not object";
    if (!validRanks.has(c.rank)) return `Invalid rank: ${c.rank}`;
    if (!validSuits.has(c.suit)) return `Invalid suit: ${c.suit}`;
    const key = c.rank + c.suit;
    if (set.has(key)) return "Duplicate cards detected";
    set.add(key);
  }
  return null;
}

/* =========================
   Poker utilities
========================= */
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];
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

function countRanks(cards){
  const m=new Map();
  for(const c of cards) m.set(c.rank,(m.get(c.rank)||0)+1);
  return m;
}
function isFlush(cards){ return new Set(cards.map(c=>c.suit)).size===1; }
function isStraight(vals){
  const v=uniqSorted(vals);
  if(v.length!==5) return false;
  if(v.join(",")==="2,3,4,5,14") return true;
  return v[4]-v[0]===4;
}
function classifyNonWild(cards){
  const vals=cards.map(c=>rv(c.rank));
  const flush=isFlush(cards);
  const straight=isStraight(vals);
  const royal=(uniqSorted(vals).join(",")==="10,11,12,13,14");
  const counts=[...countRanks(cards).values()].sort((a,b)=>b-a);

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
function hasHighPair(cards){
  const m=countRanks(cards);
  for(const [r,c] of m.entries()){
    if(c===2 && rv(r)>=11) return true;
  }
  return false;
}

function buildDeck(exclude){
  const used=new Set(exclude.map(c=>c.rank+c.suit));
  const deck=[];
  for(const r of RANKS){
    for(const s of SUITS){
      const k=r+s;
      if(!used.has(k)) deck.push({rank:r,suit:s});
    }
  }
  return deck;
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
    const r = idx.filter(i=>ROYAL.has(cards[i].rank));
    if(r.length===4) return r;
  }
  return null;
}
function find3ToRoyal(cards){
  for(const idx of suitedMap(cards).values()){
    const r = idx.filter(i=>ROYAL.has(cards[i].rank));
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
function is4ToStraight(indices, cards){
  const vals = uniqSorted(indices.map(i=>rv(cards[i].rank)));
  if(vals.length!==4) return false;
  const ok = arr => (arr[3]-arr[0] <= 4);
  const alt = vals.includes(14) ? uniqSorted(vals.map(v=>v===14?1:v)) : null;
  return ok(vals) || (alt && ok(alt));
}
function find4ToStraight(cards){
  for(let drop=0; drop<5; drop++){
    const idx=[0,1,2,3,4].filter(i=>i!==drop);
    if(is4ToStraight(idx,cards)) return idx;
  }
  return null;
}

function holdMaskFromIdx(idxs){
  const hold=[false,false,false,false,false];
  idxs.forEach(i=>hold[i]=true);
  return hold;
}

/* =========================
   Base paytable (JOB)
   For UX we treat it as JOB payout × multiplier.
   Progressive: Royal payout is user-provided.
========================= */
function ptJOB(key){
  if(key==="8/5") return { RF:800,SF:50,K4:25,FH:8,FL:5,ST:4,K3:3,TP:2,JOB:1 };
  return { RF:800,SF:50,K4:25,FH:9,FL:6,ST:4,K3:3,TP:2,JOB:1 }; // 9/6 default
}

function payoutJOB(cards, paytableKey, royalOverride = null){
  const pt = ptJOB(paytableKey);
  const cls = classifyNonWild(cards);

  const rfPay = (typeof royalOverride === "number" && royalOverride > 0) ? royalOverride : pt.RF;

  if(cls==="RF") return rfPay;
  if(cls==="SF") return pt.SF;
  if(cls==="K4") return pt.K4;
  if(cls==="FH") return pt.FH;
  if(cls==="FL") return pt.FL;
  if(cls==="ST") return pt.ST;
  if(cls==="K3") return pt.K3;
  if(cls==="TP") return pt.TP;
  if(cls==="P2") return hasHighPair(cards) ? pt.JOB : 0;
  return 0;
}

/* =========================
   Deterministic Ultimate X hold rules (multiplier-aware)
   (Fast and stable; EV computed only for chosen hold + draw5 baseline)
========================= */
function decideHoldUltimateX(cards, mult){
  const made = classifyNonWild(cards);

  // Never break straight+
  if(["RF","SF","K4","FH","FL","ST"].includes(made)){
    return { hold:[true,true,true,true,true], why:`Made hand (${made}). Never break it.` };
  }

  // Premium draws
  const r4 = find4ToRoyal(cards);
  if(r4) return { hold: holdMaskFromIdx(r4), why:`4 to a Royal Flush.` };

  const sf4 = null; // optional later (4 to straight flush); omitted for speed
  if(sf4) return { hold: holdMaskFromIdx(sf4), why:`4 to a Straight Flush.` };

  const f4 = find4ToFlush(cards);
  if(f4) return { hold: holdMaskFromIdx(f4), why:`4 to a Flush.` };

  const r3 = find3ToRoyal(cards);
  if(r3) return { hold: holdMaskFromIdx(r3), why:`3 to a Royal Flush (suited).` };

  // Multipliers: if high, keep value
  const rankCounts = countRanks(cards);
  const pairs = [...rankCounts.entries()].filter(e=>e[1]===2).map(e=>e[0]);

  if(mult >= 4){
    if(pairs.length){
      const pr = pairs.sort((a,b)=>rv(b)-rv(a))[0];
      const hold = [false,false,false,false,false];
      cards.forEach((c,i)=>{ if(c.rank===pr) hold[i]=true; });
      return { hold, why:`Multiplier ${mult}×: keep pair (${pr}${pr}).` };
    }
    // keep two high cards at high multiplier
    const hi = [0,1,2,3,4].filter(i=>rv(cards[i].rank)>=11).sort((a,b)=>rv(cards[b].rank)-rv(cards[a].rank));
    if(hi.length>=2){
      return { hold: holdMaskFromIdx([hi[0],hi[1]]), why:`Multiplier ${mult}×: keep two high cards.` };
    }
  }

  // Low multiplier fallback: keep pairs if present
  if(pairs.length){
    const pr = pairs.sort((a,b)=>rv(b)-rv(a))[0];
    const hold=[false,false,false,false,false];
    cards.forEach((c,i)=>{ if(c.rank===pr) hold[i]=true; });
    return { hold, why:`Keep pair (${pr}${pr}).` };
  }

  // 4 to straight
  const st4 = find4ToStraight(cards);
  if(st4) return { hold: holdMaskFromIdx(st4), why:`4 to a Straight.` };

  // Otherwise draw five
  return { hold:[false,false,false,false,false], why:`No premium draw or pair — draw five.` };
}

/* =========================
   EV: compute for ONE hold + draw5 baseline (Cloudflare-safe)
========================= */
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

function evForHold(cards, holdMask, paytableKey, mult, royalOverride){
  const held = cards.filter((_,i)=>holdMask[i]);
  const need = 5 - held.length;
  const deck = buildDeck(cards);

  const payoutFn = (finalHand) => payoutJOB(finalHand, paytableKey, royalOverride) * mult;

  // exact if <=2 draws
  if(need<=2){
    let total=0,count=0;
    comboIter(deck, need, draw=>{
      total += payoutFn(held.concat(draw));
      count++;
    });
    return total/count;
  }

  // Monte Carlo bounded
  const SAMPLES = need===3 ? 6000 : need===4 ? 4500 : 3000;
  let total=0;
  const d=deck.slice();
  for(let t=0;t<SAMPLES;t++){
    for(let i=0;i<need;i++){
      const j=i+((Math.random()*(d.length-i))|0);
      [d[i],d[j]]=[d[j],d[i]];
    }
    total += payoutFn(held.concat(d.slice(0,need)));
  }
  return total/SAMPLES;
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
      const {
        imageBase64,
        mode = "ux",            // "ux" or "uxp"
        paytable = "9/6",       // "9/6" or "8/5"
        multiplier = 1,         // fallback if vision misses
        royalPayout = null      // for progressive: user can enter current RF payout per credit
      } = body || {};

      if(!imageBase64) return json({error:"Missing imageBase64"},200);

      const openai = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(mode), imageBase64, 9000);
      if(!openai.ok){
        // pass through useful info (like 429)
        return json({
          error: "Vision request failed",
          openai_status: openai.status,
          raw: (openai.raw || "").slice(0, 200)
        }, 200);
      }

      const vis = extractJsonFromModel(openai.json);
      if(!vis) return json({error:"Could not parse vision JSON"},200);

      const cards = vis.cards || [];
      const cardErr = validateCards(cards);
      if(cardErr) return json({error:"Invalid cards from vision", why: cardErr, cards},200);

      const usedMult = (() => {
        const v = Number(vis.multiplier);
        if(Number.isInteger(v) && v>=2 && v<=12) return v;
        const u = Number(multiplier);
        if(Number.isInteger(u) && u>=1 && u<=12) return u;
        return 1;
      })();

      const decision = decideHoldUltimateX(cards, usedMult);

      // Progressive: allow royal payout override for EV realism
      const royalOverride = (mode==="uxp" && typeof royalPayout === "number" && royalPayout>0) ? royalPayout : null;

      const ev_best = evForHold(cards, decision.hold, paytable, usedMult, royalOverride);
      const ev_draw5 = evForHold(cards, [false,false,false,false,false], paytable, usedMult, royalOverride);

      const explanation =
        `${decision.why} ` +
        `EV(best hold): ${ev_best.toFixed(4)} per 1 credit. ` +
        `EV(draw 5): ${ev_draw5.toFixed(4)}. ` +
        `Multiplier used: ${usedMult}×.` +
        (mode==="uxp" ? ` Progressive RF payout used: ${royalOverride ?? "default"}.` : "");

      return json({
        cards,
        hold: decision.hold,
        ev: ev_best,
        ev_best,
        ev_draw5,
        multiplier: usedMult,
        confidence: 1.0,
        explanation
      }, 200);

    }catch(e){
      return json({error:"Worker exception", message:String(e?.message||e)},200);
    }
  }
};

/* =========================
   Local helpers used above
========================= */
function validateCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) return "Expected exactly 5 cards";
  const validRanks = new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
  const validSuits = new Set(["S","H","D","C"]);
  const set = new Set();
  for (const c of cards) {
    if (!c || typeof c !== "object") return "Card is not an object";
    if (!validRanks.has(c.rank)) return `Invalid rank: ${c.rank}`;
    if (!validSuits.has(c.suit)) return `Invalid suit: ${c.suit}`;
    const key = c.rank + c.suit;
    if (set.has(key)) return "Duplicate cards detected";
    set.add(key);
  }
  return null;
}

function extractJsonFromModel(openaiJson) {
  const content = openaiJson?.choices?.[0]?.message?.content || "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
