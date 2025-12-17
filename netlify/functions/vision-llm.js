export async function handler(event) {
  try {
    const { imageBase64 } = JSON.parse(event.body || "{}");
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "You output STRICT JSON only." },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `
Read this image of a VIDEO POKER machine.

Rules:
- Identify EXACTLY 5 playing cards.
- Use the BOTTOM ROW (active hand).
- Order cards LEFT TO RIGHT.
- Ignore all UI, paytables, and other cards.
- Do NOT explain anything.

Return STRICT JSON ONLY in this format:

{
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"9","suit":"D"},
    {"rank":"9","suit":"C"},
    {"rank":"K","suit":"S"},
    {"rank":"2","suit":"H"}
  ]
}

Suit letters: S=spades, H=hearts, D=diamonds, C=clubs.
                `
              },
              { type: "image_url", image_url: { url: imageBase64 } }
            ]
          }
        ]
      })
    });

    const raw = await res.text();
    console.log("Raw OpenAI response:", raw);

    const parsed = JSON.parse(raw);
    const content = parsed.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found in response");

    const result = JSON.parse(match[0]);
    if (!result.cards || result.cards.length !== 5) throw new Error("Did not receive 5 cards");

    return { statusCode: 200, body: JSON.stringify(result) };

  } catch (err) {
    console.error("OpenAI Vision error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
