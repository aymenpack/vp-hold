export async function handler(event) {
  try {
    const { imageBase64 } = JSON.parse(event.body || "{}");

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No image provided" })
      };
    }

    // Roboflow detect API expects RAW base64 (no data:image prefix)
    const rawBase64 = imageBase64.split(",")[1];

    const response = await fetch(
      `https://detect.roboflow.com/playing-cards/1?api_key=${process.env.ROBOFLOW_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-octet-stream"
        },
        body: rawBase64
      }
    );

    const data = await response.json();
    console.log("Roboflow raw response:", JSON.stringify(data));

    if (!data.predictions || data.predictions.length === 0) {
      throw new Error("No cards detected");
    }

    // Keep only bottom-row cards (largest Y values)
    const sortedByY = [...data.predictions].sort((a, b) => b.y - a.y);
    const bottomRowY = sortedByY[0].y;

    const bottomRow = data.predictions.filter(p => Math.abs(p.y - bottomRowY) < 40);

    if (bottomRow.length < 5) {
      throw new Error("Less than 5 cards detected in bottom row");
    }

    // Sort left → right
    bottomRow.sort((a, b) => a.x - b.x);

    // Take first 5 cards
    const cards = bottomRow.slice(0, 5).map(p => {
      const cls = p.class; // e.g. "9H", "AS"
      return {
        rank: cls.slice(0, -1),
        suit: cls.slice(-1)
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ cards })
    };

  } catch (err) {
    console.error("Roboflow detect error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
