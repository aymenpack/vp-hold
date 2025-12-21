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
   Vision prompt: 5 cards + 3 multipliers
========================= */
function visionPrompt(mode) {
  return `
Read an IGT Ultimate X TRIPLE PLAY screen.

Return STRICT JSON only:
{
  "cards":[
    {"rank":"K","suit":"S"},
    {"rank":"K","suit":"D"},
    {"rank":"5","suit":"C"},
    {"rank":"5","suit":"H"},
    {"rank":"6","suit":"D"}
  ],
  "multipliers":[2,1,4]
}

Rules:
- Exactly 5 cards (active bottom row left->right).
- 3 multipliers (one per hand). If blank, use 1. If unreadable, return null.
- Ranks: A,K,Q,J,T,9..2
- Suits: S,H,D,C
Mode: ${mode}
`;
}

async function callOpenAI(apiKey, prompt, imageBase64, timeoutMs = 9000) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
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
    const text = await res.text();
    let j = null;
    try { j = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json: j, raw: text };
  } catch (e) {
    return { ok: false, status: 0, json: null, raw: String(e) };
  } finally {
    clearTimeout(to);
  }
}

function extractJson(openaiJson) {
  const content = openaiJson?.choices?.[0]?.message?.content || "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function validateCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) return "Need exactly 5 cards";
  const R = new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
  const S = new Set(["S","H","D","C"]);
  const seen = new Set();
  for (const c of cards) {
    if (!c || typeof c !== "object") return "Bad card object";
    if (!R.has(c.rank)) return `Bad rank ${c.rank}`;
    if (!S.has(c.suit)) return `Bad suit ${c.suit}`;
    const k = c.rank + c.suit;
    if (seen.has(k)) return "Duplicate cards";
    seen.add(k);
  }
  return null;
}

function sanitizeMult(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return null;
  const i = Math.round(v);
  if (i < 1 || i > 12) return null;
  return i;
}

function chooseMultipliers(visionArr, fallbackArr) {
  const detected = [null, null, null];
  const used = [1, 1, 1];
  for (let i = 0; i < 3; i++) {
    const v = Array.isArray(visionArr) ? sanitizeMult(visionArr[i]) : null;
    const f = Array.isArray(fallbackArr) ? sanitizeMult(fallbackArr[i]) : null;
    if (v != null) { detected[i] = v; used[i] = v; }
    else if (f != null) used[i] = f;
    else used[i] = 1;
  }
  return { detected, used, total: used[0] + used[1] + used[2] };
}

function strategyMode(total) {
  // From the chart: 3–13 weighted; 14+ conventional
  return total >= 14 ? "CONVENTIONAL" : "WEIGHTED";
}

/* =========================
   6/5 Bonus Poker base pays + Ultimate X award multipliers (3-play)
   Source: Wizard of Odds Ultimate X multi-line tables.  [oai_citation:3‡Wizard of Odds](https://wizardofodds.com/games/video-poker/tables/ultimate-x/)
========================= */

// Base pays (6/5 Bonus Poker variant used in the chart)
// RF 800, SF 50, 4A 80, 4(2-4) 40, 4(5-K) 25, FH 6, FL 5, ST 4, 3K 3, 2P 2, JOB 1
// Ultimate X award multipliers for 3-play Bonus Poker 6/5 (next-hand multipliers):
// RF 2, SF 2, 4A 2, 4(2-4) 2, 4(5-K) 2, FH 12, FL 11, ST 8, 3K 4, 2P 3, JOB 2, Nothing 1  [oai_citation:4‡Wizard of Odds](https://wizardofodds.com/games/video-poker/tables/ultimate-x/)

const BASE_PAY = {
  RF: 800,
  SF: 50,
  K4A: 80,
  K42_4: 40,
  K45K: 25,
  FH: 6,
  FL: 5,
  ST: 4,
  K3: 3,
  TP: 2,
  JOB: 1,
  N: 0
};

const AWARD_MULT_3PLAY = {
  RF: 2,
  SF: 2,
  K4A: 2,
  K42_4: 2,
  K45K: 2,
  FH: 12,
  FL: 11,
  ST: 8,
  K3: 4,
  TP: 3,
  JOB: 2,
  N: 1
};

// Wizard method for building near-optimal “single strategy” for Ultimate X:
// adjusted win = 2*(base win) + (award multiplier) - 1  [oai_citation:5‡Wizard of Odds](https://wizardofodds.com/games/video-poker/tables/ultimate-x/)
function adjustedWin(category) {
  return 2 * BASE_PAY[category] + AWARD_MULT_3PLAY[category] - 1;
}

/* =========================
   Hand classification for Bonus Poker (non-wild)
========================= */
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];

function rv(r){
  if (r==="A") return 14;
  if (r==="K") return 13;
  if (r==="Q") return 12;
  if (r==="J") return 11;
  if (r==="T") return 10;
  return parseInt(r,10);
}
function uniqSorted(vals){ return [...new Set(vals)].sort((a,b)=>a-b); }
function isFlush(hand){ return new Set(hand.map(c=>c.suit)).size===1; }
function isStraight(hand){
  const v = uniqSorted(hand.map(c=>rv(c.rank)));
  if (v.length!==5) return false;
  if (v.join(",")==="2,3,4,5,14") return true;
  return v[4]-v[0]===4;
}
function countRanks(hand){
  const m={};
  hand.forEach(c=>m[c.rank]=(m[c.rank]||0)+1);
  return m;
}
function hasJacksOrBetterPair(hand){
  const counts=countRanks(hand);
  for (const r in counts){
    if (counts[r]===2 && rv(r)>=11) return true;
  }
  return false;
}
function quadRank(hand){
  const counts=countRanks(hand);
  for (const r in counts) if (counts[r]===4) return r;
  return null;
}

function classifyBonus65(hand){
  const vals = uniqSorted(hand.map(c=>rv(c.rank)));
  const flush = isFlush(hand);
  const straight = isStraight(hand);
  const royal = vals.join(",")==="10,11,12,13,14";
  const freq = Object.values(countRanks(hand)).sort((a,b)=>b-a);

  if (straight && flush && royal) return "RF";
  if (straight && flush) return "SF";
  if (freq[0]===4){
    const q = quadRank(hand);
    const qv = rv(q);
    if (q === "A") return "K4A";
    if (qv>=2 && qv<=4) return "K42_4";
    return "K45K";
  }
  if (freq[0]===3 && freq[1]===2) return "FH";
  if (flush) return "FL";
  if (straight) return "ST";
  if (freq[0]===3) return "K3";
  if (freq[0]===2 && freq[1]===2) return "TP";
  if (freq[0]===2) return hasJacksOrBetterPair(hand) ? "JOB" : "N";
  return "N";
}

/* =========================
   EV engine
   - In WEIGHTED mode: use adjusted wins (Wizard Ultimate X single strategy)
   - In CONVENTIONAL mode: use base pays
   For Triple Play, EV_total = EV_single * totalMultiplier (linear scaling).
========================= */

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

function payoutForMode(hand, mode){
  const cat = classifyBonus65(hand);
  if (mode==="WEIGHTED") return adjustedWin(cat);
  return BASE_PAY[cat];
}

// exact for draws<=2; MC for larger draws to fit Cloudflare CPU
function evForHold(cards, holdMask, mode){
  const held = cards.filter((_,i)=>holdMask[i]);
  const need = 5 - held.length;
  const deck = buildDeck(cards);

  const pay = (finalHand)=>payoutForMode(finalHand, mode);

  if (need<=2){
    let total=0,count=0;
    comboIter(deck, need, draw=>{
      total += pay(held.concat(draw));
      count++;
    });
    return total/count;
  }

  // bounded MC
  const SAMPLES = need===3 ? 6000 : need===4 ? 4500 : 3000;
  let total=0;
  const d=deck.slice();
  for(let t=0;t<SAMPLES;t++){
    for(let i=0;i<need;i++){
      const j=i+((Math.random()*(d.length-i))|0);
      [d[i],d[j]]=[d[j],d[i]];
    }
    total += pay(held.concat(d.slice(0,need)));
  }
  return total/SAMPLES;
}

function bestHold(cards, mode){
  let bestEV=-1e9, bestMask=0;
  for(let mask=0; mask<32; mask++){
    const hold=[0,1,2,3,4].map(i=>!!(mask&(1<<i)));
    const ev = evForHold(cards, hold, mode);
    if(ev>bestEV){
      bestEV=ev;
      bestMask=mask;
    }
  }
  return {
    hold:[0,1,2,3,4].map(i=>!!(bestMask&(1<<i))),
    ev:bestEV
  };
}

/* =========================
   Step-1 Ultimate X Overrides (pattern-based)
   IMPORTANT: We implement only the most universal + non-ambiguous Wizard-level overrides here:
   - Aces Full over trips Aces (implied by classification, but forced)
   - 4 to Royal flush always
   More exceptions can be added iteratively without destabilizing.
========================= */
const ROYAL_SET = new Set(["A","K","Q","J","T"]);
function suitedMap(cards){
  const m=new Map();
  cards.forEach((c,i)=>{
    if(!m.has(c.suit)) m.set(c.suit,[]);
    m.get(c.suit).push(i);
  });
  return m;
}
function find4ToRoyal(cards){
  const sm=suitedMap(cards);
  for(const idx of sm.values()){
    const r=idx.filter(i=>ROYAL_SET.has(cards[i].rank));
    if(r.length===4) return r;
  }
  return null;
}
function isAcesFull(cards){
  const cat = classifyBonus65(cards);
  if(cat!=="FH") return false;
  const counts=countRanks(cards);
  return counts["A"]===3;
}
function overrideHold(cards){
  // Aces full: hold all
  if(isAcesFull(cards)){
    return { hold:[true,true,true,true,true], reason:"Ultimate X override: Aces Full (never downgrade)." };
  }
  // 4 to Royal: hold those 4
  const r4 = find4ToRoyal(cards);
  if(r4){
    const hold=[false,false,false,false,false];
    r4.forEach(i=>hold[i]=true);
    return { hold, reason:"Ultimate X override: 4 to a Royal Flush." };
  }
  return null;
}

/* =========================
   Worker main
========================= */
export default {
  async fetch(request, env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
    if(request.method==="GET") return json({status:"ok"});
    if(request.method!=="POST") return json({error:"bad method"},405);

    try{
      const body = await request.json();
      const { imageBase64, mode="ux", multipliers_fallback=[1,1,1] } = body || {};
      if(!imageBase64) return json({error:"Missing imageBase64"},200);

      const r = await callOpenAI(env.OPENAI_API_KEY, visionPrompt(mode), imageBase64, 9000);
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

      // Step-1 overrides
      const ov = overrideHold(cards);
      if(ov){
        const ev_single = evForHold(cards, ov.hold, badge==="CONVENTIONAL" ? "CONVENTIONAL" : "WEIGHTED");
        const ev_total = ev_single * multInfo.total;
        return json({
          cards,
          hold: ov.hold,
          multipliers_detected: multInfo.detected,
          multipliers_used: multInfo.used,
          multiplier_total: multInfo.total,
          mode_badge: badge,
          ev_single,
          ev_total,
          explanation: `${ov.reason} Total multiplier ${multInfo.total}× (${badge}).`,
          confidence: 1.0
        },200);
      }

      // Wizard strategy: use WEIGHTED (adjusted wins) when total 3–13, else conventional
      const modeForEV = (badge==="CONVENTIONAL") ? "CONVENTIONAL" : "WEIGHTED";
      const best = bestHold(cards, modeForEV);

      const ev_single = best.ev;
      const ev_total = ev_single * multInfo.total;

      const explanation =
        `Wizard Ultimate X method (${modeForEV}) · 6/5 Bonus · Total ${multInfo.total}× (${badge}). ` +
        `EV(single): ${ev_single.toFixed(4)} · EV(total): ${ev_total.toFixed(4)}.`;

      return json({
        cards,
        hold: best.hold,
        multipliers_detected: multInfo.detected,
        multipliers_used: multInfo.used,
        multiplier_total: multInfo.total,
        mode_badge: badge,
        ev_single,
        ev_total,
        explanation,
        confidence: 1.0
      },200);

    }catch(e){
      return json({error:"Worker exception", message:String(e?.message||e)},200);
    }
  }
};
