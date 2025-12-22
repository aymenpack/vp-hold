export default {
  async fetch(request, env) {
    /* ===============================
       CORS
       =============================== */
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: corsHeaders }
      );
    }

    /* ===============================
       INPUT
       =============================== */
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { imageBase64, paytable = "DDB_9_6" } = body;

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    /* ===============================
       PAYTABLES (DDB)
       - You can add more paytables here later.
       =============================== */
    const PAYTABLES = {
      // Common "9/6 DDB" paytable (per coin)
      // NOTE: many DDB paytables exist; we start with 9/6.
      DDB_9_6: {
        name: "Double Double Bonus 9/6",
        // Base pays
        RF: 800,
        SF: 50,
        FH: 9,
        FL: 6,
        ST: 4,
        K3: 3,
        TP: 1,
        JOB: 1,
        // Four-of-kind buckets
        K4_A_234: 400,   // Aces + 2/3/4 kicker
        K4_A: 160,       // Aces + other kicker
        K4_234_A234: 160,// 2/3/4 + A/2/3/4 kicker
        K4_234: 80,      // 2/3/4 + other kicker
        K4_5K: 50        // 5-K any kicker
      }
    };

    const PT = PAYTABLES[paytable];
    if (!PT) {
      return new Response(
        JSON.stringify({ error: "Unknown paytable", paytable }),
        { status: 400, headers: corsHeaders }
      );
    }

    /* ===============================
       VISION PROMPT (read-only)
       =============================== */
    const prompt = `
You are reading a casino Ultimate X video poker machine.
The image contains THREE horizontal rows. The BOTTOM row contains FIVE playing cards.

TASKS:
1) Read the multiplier on the LEFT of each row. If not visible, return null.
2) Read the FIVE cards on the BOTTOM row, left to right.

OUTPUT STRICT JSON ONLY:

{
  "multipliers": { "top": number|null, "middle": number|null, "bottom": number|null },
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"K","suit":"H"},
    {"rank":"Q","suit":"D"},
    {"rank":"J","suit":"C"},
    {"rank":"9","suit":"S"}
  ]
}

Ranks: A,K,Q,J,T,9..2
Suits: S,H,D,C
If card unreadable -> {"rank":null,"suit":null}
`;

    /* ===============================
       CALL OPENAI
       =============================== */
    let openaiJson;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1",
          temperature: 0,
          messages: [
            { role: "system", content: "Return STRICT JSON only." },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageBase64 } }
              ]
            }
          ]
        })
      });

      openaiJson = await res.json();
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to call OpenAI", detail: err.message }),
        { status: 502, headers: corsHeaders }
      );
    }

    /* ===============================
       EXTRACT VISION JSON
       =============================== */
    let vision;
    try {
      const content = openaiJson.choices?.[0]?.message?.content;
      const match = content?.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON found in vision response");
      vision = JSON.parse(match[0]);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Vision returned invalid JSON", raw: openaiJson }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Normalize multipliers: null -> 1
    vision.multipliers = {
      top: vision.multipliers?.top ?? 1,
      middle: vision.multipliers?.middle ?? 1,
      bottom: vision.multipliers?.bottom ?? 1,
    };

    /* ===============================
       VALIDATE CARDS
       =============================== */
    const cards = Array.isArray(vision.cards) ? vision.cards : [];
    const validRanks = new Set(["A","K","Q","J","T","9","8","7","6","5","4","3","2"]);
    const validSuits = new Set(["S","H","D","C"]);

    if (cards.length !== 5 || cards.some(c => !validRanks.has(c?.rank) || !validSuits.has(c?.suit))) {
      // Return vision output only; EV not possible with missing cards
      return new Response(
        JSON.stringify({
          multipliers: vision.multipliers,
          cards: vision.cards,
          warnings: ["Cards not fully readable; EV not computed"]
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       DDB HAND EVALUATION (5 cards -> payout)
       =============================== */
    const RANK_ORDER = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
    const rv = r => RANK_ORDER.indexOf(r);

    function countBy(arr) {
      return arr.reduce((m, v) => { m[v] = (m[v] || 0) + 1; return m; }, {});
    }

    function isFlush(hand) {
      return new Set(hand.map(c => c.suit)).size === 1;
    }

    function isStraight(hand) {
      const vals = [...new Set(hand.map(c => rv(c.rank)))].sort((a,b)=>a-b);
      if (vals.length !== 5) return false;
      // wheel A2345
      if (JSON.stringify(vals) === JSON.stringify([0,1,2,3,12])) return true;
      return vals[4] - vals[0] === 4;
    }

    function evalDDB(hand) {
      const ranks = hand.map(c=>c.rank);
      const suits = hand.map(c=>c.suit);
      const rc = countBy(ranks);
      const counts = Object.values(rc).sort((a,b)=>b-a);
      const unique = Object.keys(rc);

      const flush = isFlush(hand);
      const straight = isStraight(hand);

      const vals = [...new Set(ranks.map(rv))].sort((a,b)=>a-b);
      const isRoyal = flush && straight && JSON.stringify(vals) === JSON.stringify([8,9,10,11,12]); // T J Q K A

      if (isRoyal) return PT.RF;
      if (flush && straight) return PT.SF;

      // Four of a kind buckets (DDB)
      if (counts[0] === 4) {
        const quad = unique.find(r => rc[r] === 4);
        const kicker = unique.find(r => rc[r] === 1);

        if (quad === "A") {
          if (["2","3","4"].includes(kicker)) return PT.K4_A_234;
          return PT.K4_A;
        }
        if (["2","3","4"].includes(quad)) {
          if (["A","2","3","4"].includes(kicker)) return PT.K4_234_A234;
          return PT.K4_234;
        }
        // 5-K
        return PT.K4_5K;
      }

      if (counts[0] === 3 && counts[1] === 2) return PT.FH;
      if (flush) return PT.FL;
      if (straight) return PT.ST;
      if (counts[0] === 3) return PT.K3;
      if (counts[0] === 2 && counts[1] === 2) return PT.TP;

      if (counts[0] === 2) {
        const pairRank = unique.find(r => rc[r] === 2);
        if (["J","Q","K","A"].includes(pairRank)) return PT.JOB;
      }

      return 0;
    }

    /* ===============================
       EV CALCULATION (32 holds)
       - Exact enumerate for draws <= 2
       - Monte Carlo for larger draws (fast & stable)
       =============================== */
    const SUITS = ["S","H","D","C"];
    const DECK = [];
    for (const r of RANK_ORDER) for (const s of SUITS) DECK.push({ rank: r, suit: s });

    function cardKey(c){ return c.rank + c.suit; }

    function buildDeck(excludeHand) {
      const used = new Set(excludeHand.map(cardKey));
      return DECK.filter(c => !used.has(cardKey(c)));
    }

    function comboIter(arr, k, fn) {
      if (k === 0) { fn([]); return; }
      const n = arr.length;
      const idx = Array.from({ length: k }, (_, i) => i);
      while (true) {
        fn(idx.map(i => arr[i]));
        let i = k - 1;
        while (i >= 0 && idx[i] === i + n - k) i--;
        if (i < 0) break;
        idx[i]++;
        for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
      }
    }

    function evForHold(hand, holdMask) {
      const held = hand.filter((_,i)=>holdMask[i]);
      const need = 5 - held.length;
      const deck = buildDeck(hand);

      if (need === 0) return evalDDB(held);

      // exact for <= 2 draws
      if (need <= 2) {
        let total = 0, count = 0;
        comboIter(deck, need, draw => {
          total += evalDDB(held.concat(draw));
          count++;
        });
        return total / count;
      }

      // Monte Carlo for speed (tunable)
      const SAMPLES = need === 3 ? 20000 : need === 4 ? 14000 : 10000;
      let total = 0;
      const d = deck.slice();

      for (let t=0; t<SAMPLES; t++){
        // partial shuffle first need cards
        for (let i=0;i<need;i++){
          const j = i + ((Math.random()*(d.length-i))|0);
          [d[i], d[j]] = [d[j], d[i]];
        }
        total += evalDDB(held.concat(d.slice(0,need)));
      }
      return total / SAMPLES;
    }

    function bestHoldEV(hand) {
      let bestEV = -1e9;
      let bestMask = 0;
      for (let mask=0; mask<32; mask++){
        const hold = [0,1,2,3,4].map(i=>!!(mask&(1<<i)));
        const ev = evForHold(hand, hold);
        if (ev > bestEV) { bestEV = ev; bestMask = mask; }
      }
      return {
        hold: [0,1,2,3,4].map(i=>!!(bestMask&(1<<i))),
        ev_best: bestEV
      };
    }

    const best = bestHoldEV(cards);

    /* ===============================
       RESPONSE
       =============================== */
    return new Response(
      JSON.stringify({
        paytable: PT.name,
        multipliers: vision.multipliers,
        cards,
        best_hold: best.hold,
        ev_best: best.ev_best
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};
