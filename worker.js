const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {

    // Handle CORS preflight (Safari NEEDS this)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Only allow POST after preflight
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      const { imageBase64 } = await request.json();

      if (!imageBase64) {
        return new Response(
          JSON.stringify({ error: "No image provided" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: "Return STRICT JSON only."
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `
Read this image of a VIDEO POKER machine.

Rules:
- Identify EXACTLY 5 playing cards
- Use the BOTTOM ROW
- Order LEFT TO RIGHT
- Ignore UI text

Return JSON ONLY:

{
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"9","suit":"D"},
    {"rank":"9","suit":"C"},
    {"rank":"K","suit":"S"},
    {"rank":"2","suit":"H"}
  ]
}
                  `
                },
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

      return new Response(raw, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });

    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
