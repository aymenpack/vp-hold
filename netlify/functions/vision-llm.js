export async function handler(event) {
  try {
    const { imageBase64 } = JSON.parse(event.body || "{}");

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No image provided" })
      };
    }

    // Base64 → Buffer → Blob
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const blob = new Blob([buffer], { type: "image/jpeg" });

    const form = new FormData();
    form.append("file", blob, "snapshot.jpg"); // <-- MUST be 'file'
    form.append(
      "prompt",
      `
You are a vision system reading a VIDEO POKER machine.

Identify EXACTLY 5 playing cards in the BOTTOM ROW only.
Order cards LEFT TO RIGHT.
Ignore UI, paytables, buttons, and all other cards.

Return STRICT JSON ONLY.

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

Suit letters:
S=spades, H=hearts, D=diamonds, C=clubs.
      `
    );

    const response = await fetch(
      `https://infer.roboflow.com/vision-llm/run?api_key=${process.env.ROBOFLOW_API_KEY}`,
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
