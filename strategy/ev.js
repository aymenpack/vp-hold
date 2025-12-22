// strategy/ev.js
// Wizard-of-Odds style EV engine for Double Double Bonus

import { evaluateHand } from "./handEvaluator.js";

/* ===============================
   DECK SETUP
   =============================== */

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["S","H","D","C"];

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
   COMBINATIONS (exact enumeration)
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
   PAYOUT LOOKUP
   =============================== */

function payoutForHand(cards, paytable) {
  const result = evaluateHand(cards);
  if (!result || !result.payout) return 0;
  return paytable.payouts[result.payout] ?? 0;
}

/* ===============================
   EV FOR ONE HOLD
   =============================== */

function evForHold(hand, holdMask, paytable) {
  const held = hand.filter((_, i) => holdMask[i]);
  const drawCount = 5 - held.length;
  const deck = buildDeck(hand);

  // No draw → direct payout
  if (drawCount === 0) {
    return payoutForHand(held, paytable);
  }

  // Exact enumeration for small draws
  if (drawCount <= 2) {
    let total = 0;
    let count = 0;

    combinations(deck, drawCount, draw => {
      total += payoutForHand(held.concat(draw), paytable);
      count++;
    });

    return total / count;
  }

  // Monte Carlo simulation for speed
  const SAMPLES =
    drawCount === 3 ? 20000 :
    drawCount === 4 ? 15000 :
    10000;

  let total = 0;
  const d = deck.slice();

  for (let t = 0; t < SAMPLES; t++) {
    // partial Fisher–Yates shuffle
    for (let i = 0; i < drawCount; i++) {
      const j = i + ((Math.random() * (d.length - i)) | 0);
      [d[i], d[j]] = [d[j], d[i]];
    }

    total += payoutForHand(held.concat(d.slice(0, drawCount)), paytable);
  }

  return total / SAMPLES;
}

/* ===============================
   BEST HOLD (32 masks)
   =============================== */

export function bestHoldEV(hand, paytable) {
  let bestEV = -Infinity;
  let bestMask = null;

  for (let mask = 0; mask < 32; mask++) {
    const holdMask = [0,1,2,3,4].map(i => Boolean(mask & (1 << i)));
    const ev = evForHold(hand, holdMask, paytable);

    if (ev > bestEV) {
      bestEV = ev;
      bestMask = holdMask;
    }
  }

  return {
    best_hold: bestMask,
    ev_best: Number(bestEV.toFixed(6))
  };
}
