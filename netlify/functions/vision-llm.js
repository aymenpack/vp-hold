// netlify/functions/vision-llm.js
export async function handler(event) {
  try {
    const { imageBase64 } = JSON.parse(event.body);

    const response = await fetch(
      "https://api.roboflow.com/v1/vision-llm",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.ROBOFLOW_API_KEY}`
        },
        body: JSON.stringify({
          prompt: `
This is a screenshot of a video poker machine.

Identify the 5 playing cards in the bottom row (the active hand).
Ignore all UI, paytables, and other cards.

Return JSON ONLY in this format, left to right:

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
          `,
          image: imageBase64
        })
      }
    );

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}