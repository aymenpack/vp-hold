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
Read the VIDEO POKER machine.

TASK:
- Extract EXACTLY 5 cards from the active/bottom row, left to right.
- If game is Ultimate X (ux/uxp), also read the SINGLE multiplier shown on the LEFT (e.g. 2x, 4x, 8x, 10x, 12x). If unclear, return null.

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
   Common helpers
========================= */
const ROYAL = new Set(["A","K","Q","J","T"]);
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];

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

function classify5(cards){
  const vals=cards.map(c=>rv(c.rank));
  const flush=isFlush(cards);
  const straight=isStraight(vals);
  const counts=[...countBy(cards,c=>c.rank).values()].sort((a,b)=>b-a);

  const royal = (uniq(vals).join(",")==="10,11,12,13,14");

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
  const m=countBy(cards,c=>c.rank);
  for(const [r,c] of m.entries()){
    if(c===2 && rv(r)>=11) return true;
  }
  return false;
}

function payoutJOB(cards, paytableKey){
  // per 1 credit bet
  const pt = (paytableKey==="9/6")
    ? { RF:800,SF:50,K4:25,FH:9,FL:6,ST:4,K3:3,TP:2,JOB:1 }
    : (paytableKey==="8/5")
      ? { RF:800,SF:50,K4:25,FH:8,FL:5,ST:4,K3:3,TP:2,JOB:1 }
      : { RF:800,SF:50,K4:25,FH:9,FL:6,ST:4,K3:3,TP:2,JOB:1 };

  const cls = classify5(cards);
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

function buildDeck(excludeCards){
  const used = new Set(excludeCards.map(c=>c.rank+c.suit));
  const deck=[];
  for(const r of RANKS){
    for(const s of SUITS){
      const key=r+s;
      if(!used.has(key)) deck.push({rank:r,suit:s});
    }
  }
  return deck;
}

function comboIter(arr, k, fn){
  // iterate combinations of k items, call fn(combArray)
  const n = arr.length;
  if(k===0){ fn([]); return; }
  const idx = Array.from({length:k},(_,i)=>i);
  while(true){
    fn(idx.map(i=>arr[i]));
    let i=k-1;
    while(i>=0 && idx[i]===i+n-k) i--;
    if(i<0) break;
    idx[i]++;
    for(let j=i+1;j<k;j++) idx[j]=idx[j-1]+1;
  }
}

function evForHold_JOB(cards, holdMask, paytableKey){
  const held = cards.filter((_,i)=>holdMask[i]);
  const need = 5 - held.length;
  const deck = buildDeck(cards);

  // Exact for need <= 2, sampled for larger to keep Worker fast
  if(need <= 2){
    let total=0;
    let count=0;
    comboIter(deck, need, draw=>{
      const finalHand = held.concat(draw);
      total += payoutJOB(finalHand, paytableKey);
      count++;
    });
    return total / count;
  }

  const SAMPLES = 8000; // worker-safe
  let total=0;
  const d = deck.slice();
  for(let t=0;t<SAMPLES;t++){
    // partial shuffle first need cards
    for(let i=0;i<need;i++){
      const j = i + ((Math.random()*(d.length-i))|0);
      [d[i], d[j]] = [d[j], d[i]];
    }
    const draw = d.slice(0, need);
    total += payoutJOB(held.concat(draw), paytableKey);
  }
  return total / SAMPLES;
}

/* =========================
   Deterministic strategy (same as your current rule engine)
   (kept conservative and safe; EV added for JOB only)
========================= */
function solveJobLike(cards, gameName){
  const hold=[false,false,false,false,false];
  const made=classify5(cards);

  const holdAll = new Set(["RF","SF","K4","FH","FL","ST"]);
  if(holdAll.has(made)){
    return { hold:[true,true,true,true,true], explanation:`Made hand. Never break it in ${gameName}.` };
  }

  // 4 to royal
  {
    const suitMap = new Map();
    cards.forEach((c,i)=>{ if(!suitMap.has(c.suit)) suitMap.set(c.suit,[]); suitMap.get(c.suit).push(i); });
    for(const [s,idx] of suitMap){
      const r = idx.filter(i=>ROYAL.has(cards[i].rank));
      if(r.length===4){
        r.forEach(i=>hold[i]=true);
        return { hold, explanation:`Hold 4 to a Royal Flush.` };
      }
    }
  }

  // 3 to royal suited (high priority)
  {
    const suitMap = new Map();
    cards.forEach((c,i)=>{ if(!suitMap.has(c.suit)) suitMap.set(c.suit,[]); suitMap.get(c.suit).push(i); });
    for(const [s,idx] of suitMap){
      const r = idx.filter(i=>ROYAL.has(cards[i].rank));
      if(r.length===3){
        r.forEach(i=>hold[i]=true);
        return { hold, explanation:`Hold 3 to a Royal Flush (suited).` };
      }
    }
  }

  // High pair / low pair
  if(made==="P2"){
    const m=countBy(cards,c=>c.rank);
    let pairRank=null;
    for(const [r,cnt] of m.entries()) if(cnt===2) pairRank=r;
    cards.forEach((c,i)=>{ if(c.rank===pairRank) hold[i]=true; });
    if(rv(pairRank)>=11) return { hold, explanation:`Hold high pair (${pairRank}${pairRank}).` };
    return { hold, explanation:`Hold low pair (${pairRank}${pairRank}).` };
  }

  // Default draw five
  return { hold:[false,false,false,false,false], explanation:`No strong hand or premium draw — draw five.` };
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
      if(!imageBase64 || !game || !paytable){
        return new Response(JSON.stringify({error:"missing fields"}),{status:400,headers:corsHeaders});
      }

      const vision=await callOpenAI(env.OPENAI_API_KEY, visionPrompt(game), imageBase64);
      const vis=extractJson(vision);
      const cards=vis.cards||[];

      let out, conf=1.0;
      let ev = null;
      let ev_note = null;

      if(game==="job"){
        out = solveJobLike(cards, `Jacks or Better (${paytable})`);
        ev = evForHold_JOB(cards, out.hold, paytable);
      } else {
        out = solveJobLike(cards, `${game} (${paytable})`);
        conf = 0.85;
        ev_note = "EV display currently implemented for Jacks or Better only.";
      }

      const usedMult = (Number.isInteger(vis.multiplier) && vis.multiplier>=2 && vis.multiplier<=12)
        ? vis.multiplier
        : (Number(multiplier)||1);

      return new Response(JSON.stringify({
        cards,
        hold: out.hold,
        explanation: out.explanation,
        multiplier: usedMult,
        confidence: conf,
        ev,
        ev_note
      }),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});

    }catch(e){
      return new Response(JSON.stringify({error:e.message}),{status:500,headers:corsHeaders});
    }
  }
};
