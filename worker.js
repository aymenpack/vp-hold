import { wizardBestHold } from "./strategy/wizard.js";

export default {
  async fetch(req, env){
    if(req.method!=="POST") return new Response("Method Not Allowed",{status:405});

    const { cards, multipliers, progressive=false } = await req.json();

    const used = multipliers.map(m=>Number(m)||1);
    const total = used.reduce((a,b)=>a+b,0);

    const result = wizardBestHold(cards, total, progressive);

    return new Response(JSON.stringify({
      cards,
      hold: result.hold,
      multipliers_used: used,
      multiplier_total: total,
      ev_single: result.ev_single,
      ev_total: result.ev_total,
      explanation: "Wizard of Odds Ultimate X strategy (adjusted-win method).",
      confidence: 1.0
    }),{
      headers:{ "Content-Type":"application/json" }
    });
  }
};
