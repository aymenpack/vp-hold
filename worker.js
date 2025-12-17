function gameRules(game, paytable) {

  switch (game) {

    /* =========================
       JACKS OR BETTER
    ========================= */
    case "job":
      return `
STRATEGY PROFILE: JACKS OR BETTER (${paytable})

ABSOLUTE RULES:
- Always HOLD made hands: straight, flush, full house, four of a kind.
- Always HOLD a high pair (J, Q, K, A).
- NEVER break a made hand for a draw.

PRIORITY ORDER (highest to lowest):
1. Royal flush, straight flush
2. Four of a kind (hold all 5)
3. Full house
4. Flush
5. Straight
6. Three of a kind
7. Two pair
8. High pair (Jacks or better)
9. 4 to a Royal Flush
10. 4 to a Straight Flush
11. Low pair
12. 4 to a Flush
13. 3 to a Royal Flush
14. 4 to an open straight
15. 2 high cards

IMPORTANT:
- Low pairs are weaker than 4-card premium draws.
- NEVER discard a high pair.
`;

    /* =========================
       BONUS POKER
    ========================= */
    case "bonus":
      return `
STRATEGY PROFILE: BONUS POKER (${paytable})

DIFFERENCE FROM JOB:
- Four of a kind payouts are higher.
- Strategy is similar to JOB but quads are more valuable.

ABSOLUTE RULES:
- Always HOLD any four of a kind (HOLD ALL 5).
- Always HOLD made hands (straight or better).
- Always HOLD high pairs.

IMPORTANT:
- Quad aces do NOT have kicker dependence here.
- Do NOT apply DDB kicker logic.

PRIORITY:
Same as Jacks or Better except:
- Quads outrank everything below straight flush.
`;

    /* =========================
       DOUBLE BONUS
    ========================= */
    case "double_bonus":
      return `
STRATEGY PROFILE: DOUBLE BONUS (${paytable})

KEY DIFFERENCE:
- Quad aces pay significantly more.
- Low quads (2–4) are also enhanced.

ABSOLUTE RULES:
- Always HOLD all 5 cards on ANY four of a kind.
- NEVER discard the kicker with quads.
- Always HOLD high pairs.

IMPORTANT:
- Do not break quads for draws.
- Do not apply JOB logic when quads exist.
`;

    /* =========================
       DOUBLE DOUBLE BONUS
    ========================= */
    case "ddb":
      return `
STRATEGY PROFILE: DOUBLE DOUBLE BONUS (DDB)

THIS GAME HAS CRITICAL KICKER RULES.

ABSOLUTE, NON-NEGOTIABLE RULES:

FOUR ACES:
- If the 5th card is ANY rank (2 through K), HOLD ALL 5 CARDS.
- NEVER discard the kicker.

FOUR 2s, 3s, or 4s:
- If the kicker is A, 2, 3, or 4 → HOLD ALL 5.
- If the kicker is 5–K → HOLD ALL 5.
- NEVER discard the kicker.

ALL OTHER QUADS (5–K):
- HOLD ALL 5 CARDS.

IMPORTANT:
- In DDB, YOU NEVER DISCARD THE KICKER ON QUADS.
- Do NOT use Bonus Poker or JOB quad logic.
- This rule overrides all draw considerations.

OTHER RULES:
- Always HOLD made hands (straight or better).
- Always HOLD high pairs.
`;

    /* =========================
       DEUCES WILD
    ========================= */
    case "deuces":
      return `
STRATEGY PROFILE: DEUCES WILD (${paytable})

CORE PRINCIPLE:
- Deuces (2s) are WILD.
- Number of deuces dominates strategy.

ABSOLUTE RULES:
- 4 Deuces → HOLD ALL 5.
- 3 Deuces → HOLD ALL 5.
- 2 Deuces → HOLD BOTH DEUCES.
- 1 Deuce → HOLD THE DEUCE.

MADE HANDS:
- Natural Royal (no deuce) → HOLD ALL 5.
- Wild Royal → HOLD ALL 5.
- Five of a Kind → HOLD ALL 5.
- Straight flush or better → HOLD ALL 5.

IMPORTANT:
- NEVER discard a deuce.
- Do not apply Jacks-or-Better logic.
- Wild value dominates kicker value.
`;

    /* =========================
       ULTIMATE X
    ========================= */
    case "ux":
    case "uxp":
      return `
STRATEGY PROFILE: ULTIMATE X

CORE DIFFERENCE:
- There is ONE MULTIPLIER for the entire bottom row.
- Multiplier dramatically changes correct holds.

ABSOLUTE RULES:
- Always HOLD made hands (straight or better).
- Always HOLD all 5 cards on any four of a kind.
- NEVER discard quads or full houses.

MULTIPLIER LOGIC:
- High multiplier (≥8x):
  - Favor high-EV future hands.
  - Prefer premium draws over marginal made hands.
- Low multiplier (1x–2x):
  - Use base Jacks-or-Better strategy.

IMPORTANT:
- Apply Jacks-or-Better base rules PLUS multiplier weighting.
- Multiplier overrides marginal EV differences.
- Do NOT ignore multiplier.
`;

    default:
      return `
STRATEGY PROFILE: UNKNOWN.
Use best judgment.
`;
  }
}
