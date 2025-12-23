// capture/capture.js
// 🔒 DO NOT MODIFY — pixel-perfect capture

export const CAPTURE_CONFIG = {
  FRAME_SCALE: 0.58,
  CAPTURE_Y_ADJUST: 0.03,
  CAPTURE_H_ADJUST: 0.94,
  CAPTURE_X_PAD: 0.17,
  OUTPUT_WIDTH: 1100,
  JPEG_QUALITY: 0.85
};

export function positionGreenFrame(scanner, band) {
  const h = scanner.getBoundingClientRect().height * CAPTURE_CONFIG.FRAME_SCALE;
  band.style.top = (scanner.getBoundingClientRect().height / 2 - h / 2) + "px";
  band.style.height = h + "px";
}

export async function captureFromGreenFrame({
  video,
  band,
  scanner
}) {
  await new Promise(r => requestAnimationFrame(r));

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera not ready");

  const videoRect = video.getBoundingClientRect();
  const bandRect = band.getBoundingClientRect();

  const scaleX = vw / videoRect.width;
  const scaleY = vh / videoRect.height;

  const baseX = (bandRect.left - videoRect.left) * scaleX;
  const baseY =
    ((bandRect.top - videoRect.top) * scaleY) +
    (bandRect.height * CAPTURE_CONFIG.CAPTURE_Y_ADJUST * scaleY);

  const baseW = bandRect.width * scaleX;
  const baseH = bandRect.height * CAPTURE_CONFIG.CAPTURE_H_ADJUST * scaleY;

  const padX = baseW * CAPTURE_CONFIG.CAPTURE_X_PAD;

  const cropX = Math.max(0, baseX - padX);
  const cropW = Math.min(vw - cropX, baseW + padX * 2);
  const cropY = baseY;
  const cropH = baseH;

  const raw = document.createElement("canvas");
  raw.width = cropW;
  raw.height = cropH;
  raw.getContext("2d").drawImage(
    video,
    cropX, cropY, cropW, cropH,
    0, 0, cropW, cropH
  );

  const out = document.createElement("canvas");
  out.width = CAPTURE_CONFIG.OUTPUT_WIDTH;
  out.height = Math.floor(cropH * (CAPTURE_CONFIG.OUTPUT_WIDTH / cropW));
  out.getContext("2d").drawImage(raw, 0, 0, out.width, out.height);

  return out.toDataURL("image/jpeg", CAPTURE_CONFIG.JPEG_QUALITY);
}

// 🔒 SAFE CAPTURE — BLOB VERSION
// Uses toBlob() to avoid large JS string allocations

export async function captureFromGreenFrameBlob({
  video,
  band,
  scanner
}) {
  await new Promise(r => requestAnimationFrame(r));

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera not ready");

  const videoRect = video.getBoundingClientRect();
  const bandRect = band.getBoundingClientRect();

  const scaleX = vw / videoRect.width;
  const scaleY = vh / videoRect.height;

  const baseX = (bandRect.left - videoRect.left) * scaleX;
  const baseY =
    ((bandRect.top - videoRect.top) * scaleY) +
    (bandRect.height * CAPTURE_CONFIG.CAPTURE_Y_ADJUST * scaleY);

  const baseW = bandRect.width * scaleX;
  const baseH = bandRect.height * CAPTURE_CONFIG.CAPTURE_H_ADJUST * scaleY;

  const padX = baseW * CAPTURE_CONFIG.CAPTURE_X_PAD;

  const cropX = Math.max(0, baseX - padX);
  const cropW = Math.min(vw - cropX, baseW + padX * 2);
  const cropY = baseY;
  const cropH = baseH;

  const raw = document.createElement("canvas");
  raw.width = cropW;
  raw.height = cropH;
  raw.getContext("2d").drawImage(
    video,
    cropX, cropY, cropW, cropH,
    0, 0, cropW, cropH
  );

  const out = document.createElement("canvas");
  out.width = CAPTURE_CONFIG.OUTPUT_WIDTH;
  out.height = Math.floor(cropH * (CAPTURE_CONFIG.OUTPUT_WIDTH / cropW));
  out.getContext("2d").drawImage(raw, 0, 0, out.width, out.height);

  // ✅ CRITICAL DIFFERENCE: toBlob instead of toDataURL
  const blob = await new Promise(resolve =>
    out.toBlob(resolve, "image/jpeg", CAPTURE_CONFIG.JPEG_QUALITY)
  );

  if (!blob) throw new Error("Failed to create image blob");

  // Convert Blob → base64 data URL (small, controlled allocation)
  const base64 = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  return base64;
}
