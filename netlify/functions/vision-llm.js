export async function handler(event) {
  try {
    const { imageBase64 } = JSON.parse(event.body || "{}");

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No image provided" })
      };
    }

    const response = await fetch("https://api.roboflow.com/v1/vision-llm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ROBOFLOW_API_KEY}`
      },
      body: JSON.stringify({
        prompt: `
You are a vision system.

TASK:
Read a screenshot of a VIDEO POKER machine.

RULES:
- Identify EXACTLY 5 playing cards.
- Use the BOTTOM ROW only.
- Order cards LEFT TO RIGHT.
- Ignore all UI text, paytables, buttons, and other cards.
- Do NOT explain anything.

OUTPUT:
Return STRICT JSON ONLY, with NO extra text, NO markdown, NO comments.

FORMAT:
{
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"9","suit":"D"},
    {"rank":"9","suit":"C"},
    {"rank":"K","suit":"S"},
    {"rank":"2","suit":"H"}
  ]
}

SUITS:
S = spades
H = hearts
D = diamonds
C = clubs
        `,
        image: imageBase64
      })
    });

    const raw = await response.text();
    console.log("Raw LLM response:", raw);

    // --- Extract JSON safely ---
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON found in Vision LLM response");
    }

    const parsed = JSON.parse(match[0]);

    if (!parsed.cards || parsed.cards.length !== 5) {
      throw new Error("JSON parsed but does not contain 5 cards");
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error("Vision LLM error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
