// strategy/paytables.js

export const PAYTABLES = {
  DDB_9_6: {
    name: "Double Double Bonus 9/6",
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
    name: "Double Double Bonus 9/5",
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
    name: "Double Double Bonus 8/5",
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
    name: "Double Double Bonus 7/5",
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
