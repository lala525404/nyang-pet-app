export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
    img.src = src;
  });
}

/**
 * 원본 이미지에서 pixelCrop 영역을 잘라 정사각형 PNG dataURL로 반환한다.
 * 배경을 채우지 않아 투명이 유지되며, 한 변은 maxSize를 넘지 않는다.
 */
export async function getCroppedImage(
  src: string,
  pixelCrop: PixelCrop,
  maxSize = 512,
): Promise<string> {
  const img = await loadImage(src);
  const hasNaturalSize = img.naturalWidth > 0 && img.naturalHeight > 0;
  const validCrop =
    [pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height].every(Number.isFinite) &&
    pixelCrop.width > 0 && pixelCrop.height > 0;

  // 크기 정보가 없는 SVG 등은 크롭 좌표를 신뢰할 수 없으므로 maxSize 정사각형에 contain으로 그린다
  const useCrop = hasNaturalSize && validCrop;
  if (!useCrop && hasNaturalSize === true) {
    throw new Error('잘못된 자르기 영역이에요.');
  }

  const size = useCrop ? Math.max(1, Math.min(Math.round(pixelCrop.width), maxSize)) : maxSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없어요.');
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (useCrop) {
    ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, size, size);
  } else {
    const iw = img.width || size;
    const ih = img.height || size;
    const ratio = Math.min(size / iw, size / ih);
    const dw = iw * ratio;
    const dh = ih * ratio;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }
  return canvas.toDataURL('image/png');
}
