export async function handler(event) {
  try {
    const { imageBase64 } = JSON.parse(event.body || "{}");

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No image provided" })
      };
    }

    // Convert base64 → Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Wrap buffer in a Blob (REQUIRED for Node 18 FormData)
    const blob = new Blob([buffer], { type: "image/jpeg" });

    const form = new FormData();
    form.append("image", blob, "snapshot.jpg");
    form.append(
      "prompt",
      `
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
Return STRICT JSON ONLY, with NO extra text.

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
S=spades, H=hearts, D=diamonds, C=clubs.
      `
    );

    const response = await fetch(
      `https://infer.roboflow.com/vision-llm?api_key=${process.env.ROBOFLOW_API_KEY}`,
      {
        method: "POST",
        body: form
      }
    );

    const raw = await response.text();
    console.log("Raw Vision LLM response:", raw);

    const parsed = JSON.parse(raw);

    if (!parsed.cards || parsed.cards.length !== 5) {
      throw new Error("Vision LLM response did not return 5 cards");
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
