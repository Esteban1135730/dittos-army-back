import { createRequire } from 'module';
import type { Sharp } from 'sharp';
import {
  computeCenterCropRect,
  computeResizeDimensions,
  INVENTORY_PHOTO_JPEG_QUALITY,
} from './inventory-photo-trim';

type SharpConstructor = (input?: Buffer | string) => Sharp;

const sharpRequire = createRequire(__filename);
const sharp = sharpRequire('sharp') as SharpConstructor;

/**
 * Quita bandas negras (letterbox), recorta a proporción carta y comprime.
 * Sesgo horizontal para cortar marcas ivCam/DroidCam a la derecha.
 */
export async function reprocessInventoryPhotoBuffer(
  input: Buffer,
): Promise<Buffer> {
  if (!input.length) return input;

  let meta = await sharp(input).rotate().metadata();
  let source = input;

  try {
    const trimmed = await sharp(input)
      .rotate()
      .trim({ threshold: 16, background: '#000000' })
      .toBuffer();
    const trimmedMeta = await sharp(trimmed).metadata();
    const tw = trimmedMeta.width ?? 0;
    const th = trimmedMeta.height ?? 0;
    const ow = meta.width ?? 0;
    const oh = meta.height ?? 0;
    if (tw > 0 && th > 0 && (tw < ow || th < oh)) {
      source = trimmed;
      meta = trimmedMeta;
    }
  } catch {
    /* imagen sin bordes uniformes para trim */
  }

  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= 0 || h <= 0) return input;

  const crop = computeCenterCropRect(w, h);
  const target = computeResizeDimensions(crop.width, crop.height);

  return sharp(source)
    .extract({
      left: crop.left,
      top: crop.top,
      width: crop.width,
      height: crop.height,
    })
    .resize(target.width, target.height, { fit: 'fill' })
    .jpeg({ quality: INVENTORY_PHOTO_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
