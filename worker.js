export default {
  async fetch(req, env) {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const { imageBase64, multipliers_fallback = [1,1,1] } = await req.json();

    /* -------------------------
       1. VISION (OpenAI)
    ------------------------- */
    const prompt = `
Read an IGT Ultimate X TRIPLE PLAY screen.

Return JSON ONLY:
{
  "cards":[
    {"rank":"K","suit":"S"},
    {"rank":"K","suit":"D"},
    {"rank":"5","suit":"C"},
    {"rank":"5","suit":"H"},
    {"rank":"6","suit":"D"}
  ],
  "multipliers":[2,1,1]
}

Rules:
- Exactly 5 cards (bottom row)
- 3 multipliers (one per hand)
- Missing multiplier = null
- Ranks: A,K,Q,J,T,9..2
- Suits: S,H,D,C
`;

    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "Return STRICT JSON only." },
          { role: "user", content: [
            { type:"text", text: prompt },
            { type:"image_url", image_url:{ url:imageBase64 } }
          ]}
        ]
      })
    });

    const raw = await ai.text();
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

    const cards = parsed.cards;
    const visionMults = parsed.multipliers || [];

    /* -------------------------
       2. MULTIPLIER LOGIC
    ------------------------- */
    const usedMults = [0,1,2].map(i=>{
      const v = Number(visionMults[i]);
      if (v>=1 && v<=12) return v;
      const f = Number(multipliers_fallback[i]);
      if (f>=1 && f<=12) return f;
      return 1;
    });

    const totalMult = usedMults.reduce((a,b)=>a+b,0);
    const modeBadge = totalMult >= 14 ? "CONVENTIONAL" : "WEIGHTED";

    /* -------------------------
       3. EV ENGINE (6/5 BONUS)
    ------------------------- */
    const R = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
    const S = ["S","H","D","C"];

    const rv = r => r==="A"?14:r==="K"?13:r==="Q"?12:r==="J"?11:r==="T"?10:parseInt(r);

    function classify(hand){
      const vals = hand.map(c=>rv(c.rank)).sort((a,b)=>a-b);
      const flush = new Set(hand.map(c=>c.suit)).size===1;
      const straight =
        vals.join()==="2,3,4,5,14" ||
        new Set(vals).size===5 && vals[4]-vals[0]===4;
      const counts = {};
      hand.forEach(c=>counts[c.rank]=(counts[c.rank]||0)+1);
      const f = Object.values(counts).sort((a,b)=>b-a);

      if(straight && flush && vals.join()==="10,11,12,13,14") return "RF";
      if(straight && flush) return "SF";
      if(f[0]===4) return "4K";
      if(f[0]===3 && f[1]===2) return "FH";
      if(flush) return "FL";
      if(straight) return "ST";
      if(f[0]===3) return "3K";
      if(f[0]===2 && f[1]===2) return "2P";
      if(f[0]===2 && rv(Object.keys(counts).find(k=>counts[k]===2))>=11) return "HP";
      return "N";
    }

    function payout(hand){
      const t = classify(hand);
      if(t==="RF") return 800;
      if(t==="SF") return 50;
      if(t==="4K"){
        return hand.some(c=>c.rank==="A") ? 80 : 40;
      }
      if(t==="FH") return 6;
      if(t==="FL") return 5;
      if(t==="ST") return 4;
      if(t==="3K") return 3;
      if(t==="2P") return 2;
      if(t==="HP") return 1;
      return 0;
    }

    function bestHold(cards){
      let bestEV=-1, bestMask=0;
      for(let mask=0;mask<32;mask++){
        const held = cards.filter((_,i)=>mask&(1<<i));
        const need = 5-held.length;
        const deck=[];
        for(const r of R) for(const s of S){
          if(!cards.some(c=>c.rank===r && c.suit===s)) deck.push({rank:r,suit:s});
        }
        let total=0,count=0;
        function dfs(start,draw){
          if(draw.length===need){
            total+=payout(held.concat(draw));
            count++;
            return;
          }
          for(let i=start;i<deck.length;i++){
            draw.push(deck[i]);
            dfs(i+1,draw);
            draw.pop();
          }
        }
        dfs(0,[]);
        const ev = total/count;
        if(ev>bestEV){ bestEV=ev; bestMask=mask; }
      }
      return {
        hold:[0,1,2,3,4].map(i=>!!(bestMask&(1<<i))),
        ev:bestEV
      };
    }

    const best = bestHold(cards);

    return new Response(JSON.stringify({
      cards,
      hold: best.hold,
      multipliers_used: usedMults,
      multiplier_total: totalMult,
      mode_badge: modeBadge,
      ev_single: best.ev,
      ev_total: best.ev * totalMult,
      explanation:
        `6/5 Bonus Poker · Triple Play total ${totalMult}× (${modeBadge}). Best EV hold selected.`
    }), {
      headers:{ "Content-Type":"application/json" }
    });
  }
};
