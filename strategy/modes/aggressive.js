// ✅ SAFE TO EDIT — Aggressive policy

export function chooseHold(candidates){
  candidates.sort((a,b)=>b.evUX-a.evUX);
  const best=candidates[0].evUX;
  const viable=candidates.filter(c=>c.evUX>=best*0.97);
  viable.sort((a,b)=>a.heldCount-b.heldCount || b.evUX-a.evUX);
  return viable[0];
}
