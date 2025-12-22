export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64" }),
        { status: 400 }
      );
    }

    const prompt = `
You are a computer vision system reading a casino video poker machine (Ultimate X).

TASKS:
1. Identify the 3 horizontal rows.
2. Read the multiplier shown on the LEFT of each row.
3. Read the 5 playing cards on the BOTTOM row, left to right.

OUTPUT STRICT JSON ONLY:

{
  "multipliers": {
    "top": number | null,
    "middle": number | null,
    "bottom": number | null
  },
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"K","suit":"H"},
    {"rank":"Q","suit":"D"},
    {"rank":"J","suit":"C"},
    {"rank":"9","suit":"S"}
  ]
}

Rules:
- Ranks: A,K,Q,J,T,9–2
- Suits: S,H,D,C
- If a multiplier is not visible, return null
- If a card cannot be read, still include it with rank=null, suit=null
`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
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
              {
                type: "image_url",
                image_url: { url: imageBase64 }
              }
            ]
          }
        ]
      })
    });

    const raw = await openaiRes.text();

    // Extract JSON safely
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(
        JSON.stringify({ error: "Vision returned no JSON", raw }),
        { status: 500 }
      );
    }

    const parsed = JSON.parse(match[0]);

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" }
    });
  }
};
