// strategy/ev.js
// Correct Ultimate X EV engine (Wizard-of-Odds aligned)

import { evaluateHand } from "./handEvaluator.js";

/* ===============================
   CONSTANTS
   =============================== */

// Long-run base EV per hand (Wizard of Odds, DDB 9/6)
const BASE_EV = {
  DDB_9_6: 0.9861
};

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];

/* ===============================
   DECK
   =============================== */

const FULL_DECK = [];
for (const r of RANKS) {
  for (const s of SUITS) {
    FULL_DECK.push({ rank: r, suit: s });
  }
}

function cardKey(c) {
  return c.rank + c.suit;
}

function buildDeck(excludeCards) {
  const used = new Set(excludeCards.map(cardKey));
  return FULL_DECK.filter(c => !used.has(cardKey(c)));
}

/* ===============================
   COMBINATIONS (exact)
   =============================== */

function combinations(arr, k, fn) {
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);

  while (true) {
    fn(idx.map(i => arr[i]));

    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;

    idx[i]++;
    for (let j = i + 1; j < k; j++) {
      idx[j] = idx[j - 1] + 1;
    }
  }
}

/* ===============================
   ULTIMATE X HELPERS
   =============================== */

// Hands that propagate future value in Ultimate X
function qualifiesForUltimateX(result) {
  return [
    "jacks_or_better",
    "two_pair",
    "three_kind",
    "straight",
    "flush",
    "full_house",
    "four_kind",
    "straight_flush",
    "royal_flush"
  ].includes(result.type);
}

/* ===============================
   PAYOUT
   =============================== */

function evaluatePayout(cards, paytable, multiplier, baseEV) {
  const result = evaluateHand(cards);
  if (!result || !result.payout) {
    return { cash: 0, future: 0 };
  }

  const cash = paytable.payouts[result.payout] * multiplier;
  const future = qualifiesForUltimateX(result) ? baseEV : 0;

  return { cash, future };
}

/* ===============================
   EV FOR ONE HOLD (Ultimate X)
   =============================== */

function evForHold(hand, holdMask, paytable, multiplier, baseEV) {
  const held = hand.filter((_, i) => holdMask[i]);
  const drawCount = 5 - held.length;
  const deck = buildDeck(hand);

  let totalCash = 0;
  let totalFuture = 0;
  let count = 0;

  if (drawCount === 0) {
    const r = evaluatePayout(held, paytable, multiplier, baseEV);
    return {
      evUX: r.cash + r.future,
      evBase: r.cash / multiplier // normalize back to base
    };
  }

  // Exact enumeration for small draws
  if (drawCount <= 2) {
    combinations(deck, drawCount, draw => {
      const r = evaluatePayout(
        held.concat(draw),
        paytable,
        multiplier,
        baseEV
      );
      totalCash += r.cash;
      totalFuture += r.future;
      count++;
    });
  } else {
    // Monte Carlo for speed
    const SAMPLES =
      drawCount === 3 ? 20000 :
      drawCount === 4 ? 15000 :
      10000;

    const d = deck.slice();

    for (let t = 0; t < SAMPLES; t++) {
      for (let i = 0; i < drawCount; i++) {
        const j = i + ((Math.random() * (d.length - i)) | 0);
        [d[i], d[j]] = [d[j], d[i]];
      }

      const r = evaluatePayout(
        held.concat(d.slice(0, drawCount)),
        paytable,
        multiplier,
        baseEV
      );

      totalCash += r.cash;
      totalFuture += r.future;
      count++;
    }
  }

  return {
    evUX: (totalCash + totalFuture) / count,
    evBase: (totalCash / multiplier) / count
  };
}

/* ===============================
   BEST HOLD — ULTIMATE X
   =============================== */

export function bestHoldEV(
  hand,
  paytable,
  multiplier = 1,
  paytableKey = "DDB_9_6"
) {
  const baseEV = BASE_EV[paytableKey] ?? 0;

  let bestUX = -Infinity;
  let bestBase = -Infinity;
  let bestMask = null;

  for (let mask = 0; mask < 32; mask++) {
    const holdMask = [0,1,2,3,4].map(i => Boolean(mask & (1 << i)));

    const { evUX, evBase } = evForHold(
      hand,
      holdMask,
      paytable,
      multiplier,
      baseEV
    );

    if (evUX > bestUX) {
      bestUX = evUX;
      bestBase = evBase;
      bestMask = holdMask;
    }
  }

  return {
    best_hold: bestMask,
    ev_with_multiplier: Number(bestUX.toFixed(6)),
    ev_without_multiplier: Number(bestBase.toFixed(6))
  };
}
