export interface PreparedImage {
  dataUrl: string;
  thumbnailDataUrl: string;
  mimeType: string;
  fileName: string;
}

function createThumbnailDataUrl(img: HTMLImageElement | HTMLVideoElement, srcW: number, srcH: number): string {
  const maxThumb = 160;
  const scale = Math.min(1, maxThumb / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, w, h);
  }
  return canvas.toDataURL('image/jpeg', 0.7);
}

function encodeScaledImage(
  source: HTMLImageElement | HTMLVideoElement,
  srcW: number,
  srcH: number,
  maxDim = 512
): string {
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function fileToPreparedImage(file: File): Promise<PreparedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode the selected image file.'));
      el.src = objectUrl;
    });

    const dataUrl = encodeScaledImage(img, img.naturalWidth, img.naturalHeight);
    const thumbnailDataUrl = createThumbnailDataUrl(img, img.naturalWidth, img.naturalHeight);

    return {
      dataUrl,
      thumbnailDataUrl,
      mimeType: 'image/jpeg',
      fileName: file.name,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function urlToPreparedImage(url: string, fileName: string): Promise<PreparedImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load sample waste photograph.'));
    el.src = url;
  });

  const dataUrl = encodeScaledImage(img, img.naturalWidth, img.naturalHeight);
  const thumbnailDataUrl = createThumbnailDataUrl(img, img.naturalWidth, img.naturalHeight);

  return {
    dataUrl,
    thumbnailDataUrl,
    mimeType: 'image/jpeg',
    fileName,
  };
}

export function captureVideoFrame(video: HTMLVideoElement): PreparedImage {
  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 480;
  const dataUrl = encodeScaledImage(video, srcW, srcH);
  const thumbnailDataUrl = createThumbnailDataUrl(video, srcW, srcH);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    dataUrl,
    thumbnailDataUrl,
    mimeType: 'image/jpeg',
    fileName: `camera-${stamp}.jpg`,
  };
}
