// 🔒 LOCKED — STRATEGY GLUE
// Routes between core EV engine and play style modes

import { evaluateAllHolds } from "./core/evCore.js";
import { chooseHold as conservative } from "./modes/conservative.js";
import { chooseHold as aggressive } from "./modes/aggressive.js";

export function bestHoldEV(
  hand,
  paytable,
  multiplier = 1,
  paytableKey = "DDB_9_6",
  mode = "conservative"
){
  const candidates = evaluateAllHolds(
    hand,
    paytable,
    multiplier,
    paytableKey
  );

  const chooser = mode === "aggressive" ? aggressive : conservative;
  const chosen = chooser(candidates);

  return {
    best_hold: chosen.holdMask,
    ev_with_multiplier: Number(chosen.evUX.toFixed(6)),
    ev_without_multiplier: Number(chosen.evBase.toFixed(6)),
    mode
  };
}
