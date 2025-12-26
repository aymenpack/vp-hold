// backend/strategy/paytables.js

export const PAYTABLES = {
  /* =========================================================
     Double Double Bonus (DDB)
     Notes:
     - These are the BASE game payouts per coin for the hand.
     - Your Ultimate X multiplier is applied externally by evCore.
     - baseEV is used only as a "future EV bump" for qualifying hands.
       If baseEV is unknown, keep it 0 (safe).
     ========================================================= */

  DDB_9_6: {
    key: "DDB_9_6",
    name: "Double Double Bonus 9/6",
    family: "DDB",
    ratios: "9/6",
    baseEV: 0.9861,
    payouts: {
      royal_flush: 800,
      straight_flush: 50,

      four_aces_234_kicker: 400,
      four_aces_other: 160,

      four_234_ace_kicker: 160,
      four_234_other: 80,

      four_5k: 50,

      full_house: 9,
      flush: 6,
      straight: 4,
      three_kind: 3,
      two_pair: 1,
      jacks_or_better: 1
    }
  },

  DDB_9_5: {
    key: "DDB_9_5",
    name: "Double Double Bonus 9/5",
    family: "DDB",
    ratios: "9/5",
    baseEV: 0, // unknown here; safe = 0
    payouts: {
      royal_flush: 800,
      straight_flush: 50,

      four_aces_234_kicker: 400,
      four_aces_other: 160,

      four_234_ace_kicker: 160,
      four_234_other: 80,

      four_5k: 50,

      full_house: 9,
      flush: 5,
      straight: 4,
      three_kind: 3,
      two_pair: 1,
      jacks_or_better: 1
    }
  },

  DDB_8_5: {
    key: "DDB_8_5",
    name: "Double Double Bonus 8/5",
    family: "DDB",
    ratios: "8/5",
    baseEV: 0, // unknown here; safe = 0
    payouts: {
      royal_flush: 800,
      straight_flush: 50,

      four_aces_234_kicker: 400,
      four_aces_other: 160,

      four_234_ace_kicker: 160,
      four_234_other: 80,

      four_5k: 50,

      full_house: 8,
      flush: 5,
      straight: 4,
      three_kind: 3,
      two_pair: 1,
      jacks_or_better: 1
    }
  },

  DDB_7_5: {
    key: "DDB_7_5",
    name: "Double Double Bonus 7/5",
    family: "DDB",
    ratios: "7/5",
    baseEV: 0, // unknown here; safe = 0
    payouts: {
      royal_flush: 800,
      straight_flush: 50,

      four_aces_234_kicker: 400,
      four_aces_other: 160,

      four_234_ace_kicker: 160,
      four_234_other: 80,

      four_5k: 50,

      full_house: 7,
      flush: 5,
      straight: 4,
      three_kind: 3,
      two_pair: 1,
      jacks_or_better: 1
    }
  }
};
