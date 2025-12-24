/*
  🔒 LOCKED FILE
  Green-frame → pixel-perfect capture math.
  Validated under object-fit: cover on iOS Safari.
*/

export async function initCamera(videoEl){
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{
      facingMode:"environment",
      width:{ ideal:1920 },
      height:{ ideal:1080 }
    }
  });
  videoEl.srcObject = stream;
  await videoEl.play();
}

export function captureGreenFrame({ video, scanner, band }){
  const scannerRect = scanner.getBoundingClientRect();
  const bandRect = band.getBoundingClientRect();

  const videoW = video.videoWidth;
  const videoH = video.videoHeight;

  const scannerAspect = scannerRect.width / scannerRect.height;
  const videoAspect = videoW / videoH;

  let visibleX, visibleY, visibleW, visibleH;

  if (videoAspect > scannerAspect) {
    visibleH = videoH;
    visibleW = videoH * scannerAspect;
    visibleX = (videoW - visibleW) / 2;
    visibleY = 0;
  } else {
    visibleW = videoW;
    visibleH = videoW / scannerAspect;
    visibleX = 0;
    visibleY = (videoH - visibleH) / 2;
  }

  const scaleX = visibleW / scannerRect.width;
  const scaleY = visibleH / scannerRect.height;

  const sx = visibleX + (bandRect.left - scannerRect.left) * scaleX;
  const sy = visibleY + (bandRect.top  - scannerRect.top ) * scaleY;
  const sw = bandRect.width  * scaleX;
  const sh = bandRect.height * scaleY;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;

  canvas.getContext("2d").drawImage(
    video,
    sx, sy, sw, sh,
    0,  0, sw, sh
  );

  return canvas.toDataURL("image/jpeg", 0.9);
}
