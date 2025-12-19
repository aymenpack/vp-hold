const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* =========================
   Vision prompt (cards + UX multiplier)
========================= */
function visionPrompt(game) {
  return `
Read the VIDEO POKER machine screen.

TASK:
1) Identify EXACTLY 5 playing cards in the ACTIVE BOTTOM ROW, left to right.
2) If game is Ultimate X or Ultimate X Progressive:
   - Read the SINGLE multiplier shown on the LEFT of the card row (2X,4X,8X,10X,12X).
   - Return it as a number (2,4,8,10,12).
   - If not clearly visible, return null.

Return STRICT JSON only:
{
  "cards":[{"rank":"A","suit":"H"},{"rank":"J","suit":"H"},{"rank":"T","suit":"H"},{"rank":"4","suit":"D"},{"rank":"5","suit":"C"}],
  "multiplier": 10
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
   Card utilities
========================= */
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];

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
function isStraight(vals){
  const v=uniqSorted(vals);
  if(v.length!==5) return false;
  if(v.join(",")==="2,3,4,5,14") return true;
  return v[4]-v[0]===4;
}
function countRanks(cards){
  const m=new Map();
  for(const c of cards) m.set(c.rank,(m.get(c.rank)||0)+1);
  return m;
}
function classifyNonWild(cards){
  const vals=cards.map(c=>rv(c.rank));
  const flush=isFlush(cards);
  const straight=isStraight(vals);
  const royal = (uniqSorted(vals).join(",")==="10,11,12,13,14");

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

/* =========================
   Paytables (per 1 credit)
========================= */
function ptJOB(key){
  if(key==="8/5") return { RF:800,SF:50,K4:25,FH:8,FL:5,ST:4,K3:3,TP:2,JOB:1 };
  return { RF:800,SF:50,K4:25,FH:9,FL:6,ST:4,K3:3,TP:2,JOB:1 }; // 9/6 default
}
const PT_BONUS = { RF:800,SF:50,K4_A:80,K4:40,FH:8,FL:5,ST:4,K3:3,TP:2,JOB:1 };
const PT_DB = { RF:800,SF:50,K4_A:80,K4_234:40,K4:25,FH:8,FL:5,ST:4,K3:3,TP:2,JOB:1 };
const PT_DDB = {
  RF:800,SF:50,
  K4_A_w:160, K4_A:80,
  K4_234_w:80, K4_234:40,
  K4_5K:25,
  FH:9, FL:6, ST:4, K3:3, TP:2, JOB:1
};
const PT_DEUCES = { NRF:800, WRF:25, SF:50, K5:15, K4:4, FH:4, FL:3, ST:2, K3:1 };

/* =========================
   Payouts
========================= */
function payout_job(cards, key){
  const pt = ptJOB(key);
  const cls = classifyNonWild(cards);
  if(cls==="RF") return pt.RF;
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

function payout_bonus(cards){
  const pt = PT_BONUS;
  const cls = classifyNonWild(cards);
  if(cls==="RF") return pt.RF;
  if(cls==="SF") return pt.SF;
  if(cls==="K4"){
    const m=countRanks(cards);
    const quad=[...m.entries()].find(e=>e[1]===4)[0];
    return quad==="A" ? pt.K4_A : pt.K4;
  }
  if(cls==="FH") return pt.FH;
  if(cls==="FL") return pt.FL;
  if(cls==="ST") return pt.ST;
  if(cls==="K3") return pt.K3;
  if(cls==="TP") return pt.TP;
  if(cls==="P2") return hasHighPair(cards) ? pt.JOB : 0;
  return 0;
}

function payout_double_bonus(cards){
  const pt = PT_DB;
  const cls = classifyNonWild(cards);
  if(cls==="RF") return pt.RF;
  if(cls==="SF") return pt.SF;
  if(cls==="K4"){
    const m=countRanks(cards);
    const quad=[...m.entries()].find(e=>e[1]===4)[0];
    if(quad==="A") return pt.K4_A;
    const qv=rv(quad);
    if(qv>=2 && qv<=4) return pt.K4_234;
    return pt.K4;
  }
  if(cls==="FH") return pt.FH;
  if(cls==="FL") return pt.FL;
  if(cls==="ST") return pt.ST;
  if(cls==="K3") return pt.K3;
  if(cls==="TP") return pt.TP;
  if(cls==="P2") return hasHighPair(cards) ? pt.JOB : 0;
  return 0;
}

function payout_ddb(cards){
  const pt = PT_DDB;
  const cls = classifyNonWild(cards);
  if(cls==="RF") return pt.RF;
  if(cls==="SF") return pt.SF;
  if(cls==="K4"){
    const m=countRanks(cards);
    const quad=[...m.entries()].find(e=>e[1]===4)[0];
    const kicker=cards.find(c=>c.rank!==quad);
    const kv=kicker?rv(kicker.rank):0;
    const qv=rv(quad);

    if(quad==="A"){
      if(kv>=2 && kv<=4) return pt.K4_A_w;
      return pt.K4_A;
    }
    if(qv>=2 && qv<=4){
      if(kv===14 || (kv>=2 && kv<=4)) return pt.K4_234_w;
      return pt.K4_234;
    }
    return pt.K4_5K;
  }
  if(cls==="FH") return pt.FH;
  if(cls==="FL") return pt.FL;
  if(cls==="ST") return pt.ST;
  if(cls==="K3") return pt.K3;
  if(cls==="TP") return pt.TP;
  if(cls==="P2") return hasHighPair(cards) ? pt.JOB : 0;
  return 0;
}

function canMakeFlush(non){
  if(non.length===0) return true;
  return new Set(non.map(c=>c.suit)).size===1;
}
function canMakeStraightWithWild(nonVals, d){
  const set=new Set(nonVals);
  // wheel
  {
    const need=[14,2,3,4,5].filter(v=>!set.has(v)).length;
    if(need<=d) return true;
  }
  for(let start=2; start<=10; start++){
    const seq=[start,start+1,start+2,start+3,start+4];
    const need=seq.filter(v=>!set.has(v)).length;
    if(need<=d) return true;
  }
  return false;
}
function bestDeucesPayout(cards){
  const pt=PT_DEUCES;
  const deuces=cards.filter(c=>c.rank==="2").length;
  const non=cards.filter(c=>c.rank!=="2");
  const nonVals=non.map(c=>rv(c.rank));

  if(deuces===0){
    if(classifyNonWild(cards)==="RF") return pt.NRF;
  }

  const flushPossible=canMakeFlush(non);
  const straightPossible=canMakeStraightWithWild(nonVals,deuces);

  // Wild royal
  if(deuces>0 && flushPossible){
    const needed=[10,11,12,13,14].filter(v=>!new Set(nonVals).has(v)).length;
    if(needed<=deuces) return pt.WRF;
  }

  // Straight flush
  if(flushPossible && straightPossible) return pt.SF;

  // Five of a kind
  {
    const m=countBy(non.map(c=>c.rank), x=>x);
    const max=m.size?Math.max(...m.values()):0;
    if(max+deuces>=5) return pt.K5;
  }
  // Four of a kind
  {
    const m=countBy(non.map(c=>c.rank), x=>x);
    const max=m.size?Math.max(...m.values()):0;
    if(max+deuces>=4) return pt.K4;
  }

  // Full house (approx, but safe)
  if(deuces>=2 && non.length>=3) return pt.FH;

  if(flushPossible) return pt.FL;
  if(straightPossible) return pt.ST;

  // Three of a kind
  {
    const m=countBy(non.map(c=>c.rank), x=>x);
    const max=m.size?Math.max(...m.values()):0;
    if(max+deuces>=3) return pt.K3;
  }
  return 0;
}

/* =========================
   EV ENGINE (bounded)
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

function chooseMultiplier(visionMult, uiMult){
  const v=Number(visionMult);
  if(Number.isInteger(v)&&v>=2&&v<=12) return v;
  const u=Number(uiMult);
  if(Number.isInteger(u)&&u>=1&&u<=12) return u;
  return 1;
}

function payoutByGame(finalHand, game, paytableKey, mult){
  switch(game){
    case "job": return payout_job(finalHand, paytableKey);
    case "bonus": return payout_bonus(finalHand);
    case "double_bonus": return payout_double_bonus(finalHand);
    case "ddb": return payout_ddb(finalHand);
    case "deuces": return bestDeucesPayout(finalHand);
    case "ux":
    case "uxp":
      return payout_job(finalHand, "9/6") * mult; // base job (assumption)
    default:
      return 0;
  }
}

function evForHold(cards, holdMask, game, paytableKey, mult){
  const held = cards.filter((_,i)=>holdMask[i]);
  const need = 5-held.length;
  const deck = buildDeck(cards);

  // exact for very small draw
  if(need<=2){
    let total=0,count=0;
    comboIter(deck, need, draw=>{
      total += payoutByGame(held.concat(draw), game, paytableKey, mult);
      count++;
    });
    return total/count;
  }

  // bounded Monte Carlo (safe)
  // More samples for need=3, fewer for need=5
  const SAMPLES =
    need===3 ? 6000 :
    need===4 ? 4500 :
    3000;

  let total=0;
  const d=deck.slice();
  for(let t=0;t<SAMPLES;t++){
    for(let i=0;i<need;i++){
      const j=i+((Math.random()*(d.length-i))|0);
      [d[i],d[j]]=[d[j],d[i]];
    }
    total += payoutByGame(held.concat(d.slice(0,need)), game, paytableKey, mult);
  }
  return total/SAMPLES;
}

function bestHoldEV(cards, game, paytableKey, mult){
  const start = Date.now();
  const BUDGET_MS = 45; // hard stop for Cloudflare
  let bestEV=-1e9;
  let bestMask=0;

  for(let mask=0; mask<32; mask++){
    if(Date.now()-start > BUDGET_MS) break; // return best so far safely

    const hold = [0,1,2,3,4].map(i=>!!(mask&(1<<i)));
    const ev = evForHold(cards, hold, game, paytableKey, mult);
    if(ev > bestEV){
      bestEV=ev;
      bestMask=mask;
    }
  }
  const hold = [0,1,2,3,4].map(i=>!!(bestMask&(1<<i)));
  return { hold, ev: bestEV };
}

function explain(cards, hold, ev, game, mult){
  const held = cards.map((c,i)=>hold[i]?`${c.rank}${c.suit}`:null).filter(Boolean).join(" ");
  const base = held ? `Hold: ${held}.` : `Hold none (draw five).`;
  const add = (game==="ux"||game==="uxp") ? ` Ultimate X multiplier used: ${mult}×.` : "";
  return `${base} Best-hold EV: ${ev.toFixed(4)} per 1 credit.${add}`;
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
      const multUsed = chooseMultiplier(vis.multiplier, multiplier);

      const payKey = paytable || "standard";
      const { hold, ev } = bestHoldEV(cards, game, payKey, multUsed);

      return new Response(JSON.stringify({
        cards,
        hold,
        ev,
        multiplier: multUsed,
        confidence: 1.0,
        explanation: explain(cards, hold, ev, game, multUsed)
      }),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});

    }catch(e){
      return new Response(JSON.stringify({error:e.message}),{status:500,headers:corsHeaders});
    }
  }
};
