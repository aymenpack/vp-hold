// 🔒 DO NOT MODIFY — VISION IS LOCKED

export const VISION_PROMPT = `
You are reading a casino Ultimate X video poker machine.

The image contains THREE horizontal rows:
- Top row: multiplier on the LEFT
- Middle row: multiplier on the LEFT
- Bottom row: multiplier on the LEFT + FIVE playing cards

TASKS:
1. Read the multiplier shown on the LEFT of each row.
2. Read the FIVE cards on the BOTTOM row, left to right.

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

Rules:
- Ranks: A K Q J T 9 8 7 6 5 4 3 2
- Suits: S H D C
- If a multiplier is not visible, return null
- If a card is unreadable, return {"rank":null,"suit":null}
`;
