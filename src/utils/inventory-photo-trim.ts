/** Proporción carta Pokémon (63 × 88 mm). */
export const INVENTORY_CARD_ASPECT = 63 / 88;

export const INVENTORY_PHOTO_JPEG_QUALITY = 82;
export const INVENTORY_PHOTO_MAX_EDGE = 1400;

/**
 * Recorte centrado con sesgo horizontal para quitar marcas ivCam/DroidCam a la derecha.
 * `horizontalBias` < 0.5 desplaza el encuadre hacia la izquierda.
 */
export function computeCenterCropRect(
  width: number,
  height: number,
  aspectRatio = INVENTORY_CARD_ASPECT,
  horizontalBias = 0.44,
): { left: number; top: number; width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { left: 0, top: 0, width: Math.max(1, width), height: Math.max(1, height) };
  }

  const currentAspect = width / height;
  let cropW = width;
  let cropH = height;

  if (currentAspect > aspectRatio) {
    cropW = Math.round(height * aspectRatio);
  } else if (currentAspect < aspectRatio) {
    cropH = Math.round(width / aspectRatio);
  }

  cropW = Math.min(cropW, width);
  cropH = Math.min(cropH, height);

  const bias = Math.min(0.49, Math.max(0.33, horizontalBias));
  const left = Math.max(0, Math.floor((width - cropW) * bias));
  const top = Math.max(0, Math.floor((height - cropH) / 2));

  return { left, top, width: cropW, height: cropH };
}

export function computeResizeDimensions(
  width: number,
  height: number,
  maxEdge = INVENTORY_PHOTO_MAX_EDGE,
): { width: number; height: number } {
  const maxDim = Math.max(width, height, 1);
  if (maxDim <= maxEdge) return { width, height };
  const scale = maxEdge / maxDim;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
