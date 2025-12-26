// backend/strategy/paytableBuilder.js

import { PAYTABLES } from "./paytables.js";

/**
 * Accepts either:
 * - a preset key (string), OR
 * - a custom object: { family:"DDB", fullHouse:number, flush:number }
 *
 * Returns a paytable object shaped like PAYTABLES entries:
 * { name, family, ratios, baseEV, payouts }
 */
export function resolvePaytable({ paytableKey, customPaytable }) {
  // 1) preset
  if (paytableKey && PAYTABLES[paytableKey]) {
    return PAYTABLES[paytableKey];
  }

  // 2) custom
  if (!customPaytable) {
    throw new Error("No paytable selected");
  }

  const family = String(customPaytable.family || "").toUpperCase();

  if (family === "DDB") {
    const fullHouse = toInt(customPaytable.fullHouse);
    const flush = toInt(customPaytable.flush);

    validateDDB({ fullHouse, flush });

    const key = `DDB_${fullHouse}_${flush}`;

    // If user typed a known preset ratio, use it (so baseEV carries through)
    if (PAYTABLES[key]) return PAYTABLES[key];

    // Otherwise build a safe custom DDB paytable (baseEV unknown => 0)
    return {
      key,
      name: `Custom DDB ${fullHouse}/${flush}`,
      family: "DDB",
      ratios: `${fullHouse}/${flush}`,
      baseEV: 0,
      payouts: {
        royal_flush: 800,
        straight_flush: 50,

        four_aces_234_kicker: 400,
        four_aces_other: 160,

        four_234_ace_kicker: 160,
        four_234_other: 80,

        four_5k: 50,

        full_house: fullHouse,
        flush: flush,
        straight: 4,
        three_kind: 3,
        two_pair: 1,
        jacks_or_better: 1
      }
    };
  }

  throw new Error(`Unsupported custom paytable family: ${family}`);
}

/* ---------------- helpers ---------------- */

function toInt(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

function validateDDB({ fullHouse, flush }) {
  // Typical DDB constraints
  if (!Number.isInteger(fullHouse) || fullHouse < 5 || fullHouse > 12) {
    throw new Error("Invalid DDB fullHouse (expected integer 5..12)");
  }
  if (!Number.isInteger(flush) || flush < 4 || flush > 10) {
    throw new Error("Invalid DDB flush (expected integer 4..10)");
  }
  if (flush > fullHouse) {
    throw new Error("Invalid DDB: flush cannot exceed fullHouse");
  }
}
