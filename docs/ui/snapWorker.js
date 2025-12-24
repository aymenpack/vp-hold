/*
  ✏️ SAFE FILE
  Handles user interaction and backend call.
*/

import { captureGreenFrame } from "../capture/capture.js";

export function wireSnapWorker({
  video,
  scanner,
  band,
  spinner,
  previewImg,
  renderResults,
  modeSelect
}){
  const API_URL = "https://vp-hold-production.up.railway.app/analyze";
  let busy = false;

  scanner.onclick = async () => {
    if (busy) return;
    busy = true;
    spinner.style.display = "block";

    try{
      const imageBase64 = captureGreenFrame({ video, scanner, band });

      if (previewImg) previewImg.src = imageBase64;

      const res = await fetch(API_URL,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({
          imageBase64,
          mode: modeSelect?.value || "conservative"
        })
      });

      const data = await res.json();
      renderResults(data);

    } finally {
      spinner.style.display = "none";
      busy = false;
    }
  };
}
