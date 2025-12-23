// ✅ SAFE TO EDIT — Conservative policy

export function chooseHold(candidates){
  candidates.sort((a,b)=>b.evUX-a.evUX);
  const best=candidates[0].evUX;
  const viable=candidates.filter(c=>c.evUX>=best*0.995);
  viable.sort((a,b)=>b.heldCount-a.heldCount || b.evUX-a.evUX);
  return viable[0];
}
