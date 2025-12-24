import { captureGreenFrame } from "../capture/capture.js";

export function wireSnapWorker({
  video,
  scanner,
  band,
  spinner,
  cardsBox,

  evSection,
  evBaseValue,
  evUXValue,
  evBaseBar,
  evUXBar,

  multSection,
  multTopValue,
  multMidValue,
  multBotValue,
  multTopCells,
  multMidCells,
  multBotCells,

  whyBox,
  welcomeBox,
  modeSelect,
  onSnapComplete
}) {
  const API_URL = "https://vp-hold-production.up.railway.app/analyze";
  let busy = false;

  scanner.onclick = async () => {
    if (busy) return;
    busy = true;
    spinner.style.display = "block";

    try {
      const imageBase64 = captureGreenFrame({ video, scanner, band });

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          imageBase64,
          paytable: "DDB_9_6",
          mode: modeSelect?.value || "conservative"
        })
      });

      const d = await res.json();
      if (!d || !d.cards || !d.best_hold) return;

      renderResults(d);

      if (onSnapComplete) onSnapComplete();

    } catch (err) {
      console.error("Snap failed:", err);
    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };

  function renderResults(d) {

  /* --- CREATE EV SECTION --- */
  const evSection = document.createElement("div");
  evSection.className = "evSection";
  evSection.innerHTML = `
    <div class="evRow">
      <div class="evLabel">Base EV</div>
      <div class="evTrack"><div class="evFill base" id="evBaseBar"></div></div>
      <div class="evValue" id="evBase"></div>
    </div>
    <div class="evRow">
      <div class="evLabel">Ultimate X EV</div>
      <div class="evTrack"><div class="evFill ux" id="evUXBar"></div></div>
      <div class="evValue" id="evUX"></div>
    </div>
  `;

  cardsBox.before(evSection);

  const evBaseValue = evSection.querySelector("#evBase");
  const evUXValue   = evSection.querySelector("#evUX");
  const evBaseBar   = evSection.querySelector("#evBaseBar");
  const evUXBar     = evSection.querySelector("#evUXBar");

  /* --- CREATE MULTIPLIER SECTION --- */
  const multSection = document.createElement("div");
  multSection.className = "multSection";
  multSection.innerHTML = `
    <div class="multRow"><div class="multLabel">Top</div><div class="multCells"></div><div class="multValue"></div></div>
    <div class="multRow"><div class="multLabel">Middle</div><div class="multCells"></div><div class="multValue"></div></div>
    <div class="multRow"><div class="multLabel">Bottom</div><div class="multCells"></div><div class="multValue"></div></div>
  `;

  cardsBox.after(multSection);

    // EV continuous
    const baseEV = d.ev_without_multiplier;
    const uxEV = d.ev_with_multiplier;
    const maxEV = Math.max(baseEV, uxEV, 0.0001);

    evBaseValue.textContent = baseEV.toFixed(4);
    evUXValue.textContent = uxEV.toFixed(4);
    evBaseBar.style.width = (baseEV / maxEV * 100) + "%";
    evUXBar.style.width = (uxEV / maxEV * 100) + "%";

    // Multipliers 1..12 segmented
    multTopValue.textContent = "×" + d.multipliers.top;
    multMidValue.textContent = "×" + d.multipliers.middle;
    multBotValue.textContent = "×" + d.multipliers.bottom;

    fillMult(multTopCells, d.multipliers.top);
    fillMult(multMidCells, d.multipliers.middle);
    fillMult(multBotCells, d.multipliers.bottom);

    // Cards
    cardsBox.innerHTML = "";
    const SUIT = { S:"♠", H:"♥", D:"♦", C:"♣" };

    d.cards.forEach((c,i)=>{
      const el = document.createElement("div");
      el.className =
        "card" +
        (d.best_hold[i] ? " held" : "") +
        ((c.suit==="H"||c.suit==="D") ? " red" : "");

      el.innerHTML = `
        <div class="corner top">${c.rank}<br>${SUIT[c.suit]}</div>
        <div class="pip">${SUIT[c.suit]}</div>
        <div class="corner bottom">${c.rank}<br>${SUIT[c.suit]}</div>
      `;
      cardsBox.appendChild(el);
    });

    // Why
    whyBox.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:18px">💡</span>
        <div>
          <b>Why this hold?</b><br>
          This play maximizes <b>expected value</b> given the current hand,
          paytable, and active multipliers.
        </div>
      </div>
    `;
  }

  function fillMult(cells, n){
    cells.forEach((c,i)=>{
      c.className = "multCell";
      if (i < n) c.classList.add(colorFor(i+1));
    });
  }

  function colorFor(v){
    if (v <= 3) return "g";
    if (v <= 6) return "y";
    if (v <= 9) return "o";
    return "r";
  }
}
