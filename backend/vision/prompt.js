// 🔒 DO NOT MODIFY — VISION IS LOCKED

export const VISION_PROMPT = `
You are reading a casino Ultimate X video poker machine.

IMPORTANT: Multipliers ONLY exist in ONE SPECIFIC LOCATION.

The image contains THREE horizontal rows:
- Top row: multiplier on the FAR LEFT + facedown cards
- Middle row: multiplier on the FAR LEFT + facedown cards
- Bottom row: multiplier on the FAR LEFT + FIVE face-up playing cards

────────────
MULTIPLIER RULES (STRICT):
- A multiplier MUST be:
  • Located on the FAR LEFT EDGE of the image
  • Vertically aligned with an entire row of cards
  • Visually separated from the cards (not touching them)
- Valid multipliers are ONLY: 2, 3, 4, 5, 6, 8, 10, 12

DO NOT read numbers that are:
- In the center or right side of the image
- Part of payout tables (e.g. “Jacks or Better 5”)
- Above, below, or between rows
- Near hand rankings, paytables, or rule text
- Not vertically aligned with a full row of cards

If a number does NOT clearly meet ALL rules above, it is NOT a multiplier → return null.

────────────
CARD RULES:
- ONLY read the FIVE face-up cards on the BOTTOM row
- Read cards left to right
- Ignore ALL other card graphics

────────────
OUTPUT STRICT JSON ONLY.

{
  "multipliers": {
    "top": number | null,
    "middle": number | null,
    "bottom": number | null
  },
  "cards": [
    {"rank":"A","suit":"S"},
    {"rank":"K","suit":"H"},
    {"rank":"Q","suit":"D"},
    {"rank":"J","suit":"C"},
    {"rank":"9","suit":"S"}
  ]
}

Ranks: A K Q J T 9 8 7 6 5 4 3 2
Suits: S H D C

If a card is unreadable, return {"rank":null,"suit":null}
If unsure about a multiplier, return null.
`;
