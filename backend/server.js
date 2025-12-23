import express from "express";
import cors from "cors";
import fetch from "node-fetch";

// ⬇️ reuse your existing logic
import { bestHoldEV } from "../strategy/ev.js";
import { PAYTABLES } from "../strategy/paytables.js";
import { runVision } from "../vision/vision.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.post("/analyze", async (req, res) => {
  try {
    const {
      imageBase64,
      paytable = "DDB_9_6",
      mode = "conservative"
    } = req.body;

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

    // ---- Vision ----
    const vision = await runVision({
      imageBase64,
      apiKey: process.env.OPENAI_API_KEY
    });

    vision.multipliers = {
      top: vision.multipliers?.top ?? 1,
      middle: vision.multipliers?.middle ?? 1,
      bottom: vision.multipliers?.bottom ?? 1
    };

    if (!Array.isArray(vision.cards) || vision.cards.length !== 5) {
      return res.status(502).json({ error: "Invalid vision output", vision });
    }

    // ---- EV ----
    const strategy = bestHoldEV(
      vision.cards,
      pt,
      vision.multipliers.bottom,
      paytable,
      mode
    );

    res.json({
      paytable: pt.name,
      multipliers: vision.multipliers,
      cards: vision.cards,
      best_hold: strategy.best_hold,
      ev_with_multiplier: strategy.ev_with_multiplier,
      ev_without_multiplier: strategy.ev_without_multiplier,
      mode
    });

  } catch (err) {
    res.status(500).json({
      error: "Server error",
      message: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
