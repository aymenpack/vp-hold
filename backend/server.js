import express from "express";
import cors from "cors";
import fetch from "node-fetch";

import { bestHoldEV } from "../strategy/ev.js";
import { PAYTABLES } from "../strategy/paytables.js";
import { runVision } from "../vision/vision.js";
import { parseVisionResponse } from "../vision/parser.js";
import { VISION_PROMPT } from "../vision/prompt.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

/* ===============================
   ANALYZE ENDPOINT
   =============================== */

app.post("/analyze", async (req, res) => {
  try {
    const {
      imageBase64,
      paytable = "DDB_9_6",
      mode = "conservative"
    } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set" });
    }

    const pt = PAYTABLES[paytable];
    if (!pt) {
      return res.status(400).json({ error: "Unknown paytable" });
    }

    /* ===============================
       OPENAI VISION (SAFE)
       =============================== */

    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
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
      }
    );

    // --- SAFE READ ---
    const rawText = await openaiRes.text();

    if (!rawText || !rawText.trim()) {
      throw new Error("OpenAI returned empty response");
    }

    let openaiJson;
    try {
      openaiJson = JSON.parse(rawText);
    } catch {
      throw new Error(
        "OpenAI JSON parse failed:\n" + rawText.slice(0, 500)
      );
    }

    if (!openaiRes.ok) {
      throw new Error(
        `OpenAI error ${openaiRes.status}: ` +
        JSON.stringify(openaiJson)
      );
    }

    /* ===============================
       PARSE VISION OUTPUT
       =============================== */

    const vision = parseVisionResponse(openaiJson);

    vision.multipliers = {
      top: vision.multipliers?.top ?? 1,
      middle: vision.multipliers?.middle ?? 1,
      bottom: vision.multipliers?.bottom ?? 1
    };

    if (!Array.isArray(vision.cards) || vision.cards.length !== 5) {
      return res.status(502).json({
        error: "Invalid vision output",
        vision
      });
    }

    /* ===============================
       EV STRATEGY
       =============================== */

    const strategy = bestHoldEV(
      vision.cards,
      pt,
      vision.multipliers.bottom,
      paytable,
      mode
    );

    /* ===============================
       RESPONSE
       =============================== */

    return res.json({
      paytable: pt.name,
      multipliers: vision.multipliers,
      cards: vision.cards,
      best_hold: strategy.best_hold,
      ev_with_multiplier: strategy.ev_with_multiplier,
      ev_without_multiplier: strategy.ev_without_multiplier,
      mode
    });

  } catch (err) {
    console.error("❌ Analyze error:", err);

    return res.status(500).json({
      error: "Server error",
      message: err.message
    });
  }
});

/* ===============================
   START SERVER
   =============================== */

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
