import { wizardBestHold } from "./strategy/wizard.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function j(obj){ return new Response(JSON.stringify(obj), { headers: cors }); }

export default {
  async fetch(req, env){
    if(req.method==="OPTIONS") return new Response(null,{headers:cors});
    if(req.method!=="POST") return j({ error:"Method Not Allowed", stage:"method" });

    try{
      const body = await req.json();
      const { imageBase64, multipliers_fallback=[1,1,1], progressive=false } = body || {};
      if(!imageBase64) return j({ error:"Missing imageBase64", stage:"input" });

      // Vision
      const prompt = `Return JSON only: {"cards":[{"rank":"A","suit":"S"}...5], "multipliers":[m1,m2,m3]}. 
Cards are the bottom row left->right. Multipliers are 3 values (null if unreadable). Ranks A K Q J T 9..2. Suits S H D C.`;

      const ai = await fetch("https://api.openai.com/v1/chat/completions",{
        method:"POST",
        headers:{
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
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

      const raw = await ai.text();
      if(!ai.ok){
        return j({ error:"OpenAI vision failed", stage:"openai", detail: raw.slice(0,800), http: ai.status });
      }

      let parsed;
      try{
        parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
      }catch(e){
        return j({ error:"Could not parse model JSON", stage:"parse", detail: raw.slice(0,800) });
      }

      const cards = parsed.cards;
      const visionMults = parsed.multipliers || [];

      if(!Array.isArray(cards) || cards.length!==5){
        return j({ error:"Vision did not return 5 cards", stage:"vision_cards", detail: JSON.stringify(parsed).slice(0,800) });
      }

      // Multipliers: fill from vision else fallback else 1
      const used = [0,1,2].map(i=>{
        const v = Number(visionMults[i]);
        if(v>=1 && v<=12) return v;
        const f = Number(multipliers_fallback[i]);
        if(f>=1 && f<=12) return f;
        return 1;
      });

      const total = used.reduce((a,b)=>a+b,0);

      // Strategy (Wizard)
      const result = wizardBestHold(cards, total, progressive);

      return j({
        cards,
        hold: result.hold,
        multipliers_used: used,
        multiplier_total: total,
        ev_single: result.ev_single,
        ev_total: result.ev_total,
        explanation: "Wizard of Odds Ultimate X strategy (locked strategy module).",
        confidence: 1.0
      });

    }catch(e){
      return j({ error:"Worker exception", stage:"exception", detail: String(e?.message||e) });
    }
  }
};
