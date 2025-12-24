// 🔒 DO NOT MODIFY — VISION IS LOCKED

export function parseVisionResponse(openaiJson) {
  const content = openaiJson?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Missing OpenAI vision content");
  }

  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON found in vision response");
  }

  return JSON.parse(match[0]);
}
