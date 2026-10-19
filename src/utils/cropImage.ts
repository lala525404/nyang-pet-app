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
export async function getCroppedImage(src: string, pixelCrop: PixelCrop, maxSize = 512): Promise<string> {
  const img = await loadImage(src);
  const size = Math.max(1, Math.min(Math.round(pixelCrop.width), maxSize));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없어요.');
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, size, size);
  } else {
    // 크기 정보가 없는 SVG: 전체를 캔버스에 맞춰 그린다
    ctx.drawImage(img, 0, 0, size, size);
  }
  return canvas.toDataURL('image/png');
}
