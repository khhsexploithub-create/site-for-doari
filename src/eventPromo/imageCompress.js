// 포스터 이미지를 브라우저에서 줄여 data URL 로 바꾼다.
// Firestore 문서 하나는 1MB 까지라, 넉넉히 그 아래로 맞춘다.

const MAX_EDGE = 1200;
const MAX_BYTES = 700 * 1024;
const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5, 0.4];

export const POSTER_MAX_BYTES = MAX_BYTES;

export async function compressImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 올릴 수 있습니다.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  // 투명 배경이 검게 나오지 않도록 흰 바탕을 깔고 그린다.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);

    if (estimateBytes(dataUrl) <= MAX_BYTES) {
      return { dataUrl, width, height, bytes: estimateBytes(dataUrl) };
    }
  }

  throw new Error("이미지가 너무 큽니다. 더 작은 이미지를 올려주세요.");
}

// data URL 은 base64 라 실제 바이트보다 약 4/3 배 길다.
export function estimateBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
