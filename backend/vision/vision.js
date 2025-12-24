// vision/vision.js
import { VISION_PROMPT } from "./prompt.js";
import { parseVisionResponse } from "./parser.js";

export async function runVision({ imageBase64, apiKey }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: imageBase64 } }
          ]
        }
      ]
    })
  });

  const json = await res.json();
  return parseVisionResponse(json);
}
