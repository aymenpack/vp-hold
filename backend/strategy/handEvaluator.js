// strategy/handEvaluator.js

const RANK_ORDER = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];

function rankValue(r) {
  return RANK_ORDER.indexOf(r);
}

function countBy(arr) {
  return arr.reduce((m, v) => {
    m[v] = (m[v] || 0) + 1;
    return m;
  }, {});
}

export function evaluateHand(cards) {
  // cards: [{rank, suit}, ...] length 5

  const ranks = cards.map(c => c.rank);
  const suits = cards.map(c => c.suit);

  const rankCounts = countBy(ranks);
  const suitCounts = countBy(suits);

  const counts = Object.values(rankCounts).sort((a,b)=>b-a);
  const uniqueRanks = Object.keys(rankCounts);

  const isFlush = Object.values(suitCounts).some(c => c === 5);

  const sortedVals = [...new Set(ranks.map(rankValue))].sort((a,b)=>a-b);
  const isWheel = JSON.stringify(sortedVals) === JSON.stringify([0,1,2,3,12]);
  const isStraight =
    sortedVals.length === 5 &&
    (sortedVals[4] - sortedVals[0] === 4 || isWheel);

  // Royal / Straight Flush
  if (isFlush && isStraight) {
    if (ranks.includes("A") && ranks.includes("T")) {
      return { type: "royal_flush", payout: "royal_flush" };
    }
    return { type: "straight_flush", payout: "straight_flush" };
  }

  // Four of a kind
  if (counts[0] === 4) {
    const quadRank = uniqueRanks.find(r => rankCounts[r] === 4);
    const kicker = uniqueRanks.find(r => rankCounts[r] === 1);

    if (quadRank === "A") {
      if (["2","3","4"].includes(kicker)) {
        return { type: "four_aces", payout: "four_aces_234_kicker" };
      }
      return { type: "four_aces", payout: "four_aces_other" };
    }

    if (["2","3","4"].includes(quadRank)) {
      if (["A","2","3","4"].includes(kicker)) {
        return { type: "four_234", payout: "four_234_ace_kicker" };
      }
      return { type: "four_234", payout: "four_234_other" };
    }

    return { type: "four_kind", payout: "four_5k" };
  }

  // Full house
  if (counts[0] === 3 && counts[1] === 2) {
    return { type: "full_house", payout: "full_house" };
  }

  if (isFlush) {
    return { type: "flush", payout: "flush" };
  }

  if (isStraight) {
    return { type: "straight", payout: "straight" };
  }

  if (counts[0] === 3) {
    return { type: "three_kind", payout: "three_kind" };
  }

  if (counts[0] === 2 && counts[1] === 2) {
    return { type: "two_pair", payout: "two_pair" };
  }

  if (counts[0] === 2) {
    const pairRank = uniqueRanks.find(r => rankCounts[r] === 2);
    if (["J","Q","K","A"].includes(pairRank)) {
      return { type: "jacks_or_better", payout: "jacks_or_better" };
    }
  }

  return { type: "nothing", payout: null };
}
