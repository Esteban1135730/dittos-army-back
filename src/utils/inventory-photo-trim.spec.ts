import {
  computeCenterCropRect,
  computeResizeDimensions,
  INVENTORY_CARD_ASPECT,
} from './inventory-photo-trim';

describe('inventory-photo-trim', () => {
  it('recorta ancho sobrante con sesgo a la izquierda (ivCam)', () => {
    const crop = computeCenterCropRect(1600, 1200, INVENTORY_CARD_ASPECT, 0.44);
    expect(crop.width / crop.height).toBeCloseTo(INVENTORY_CARD_ASPECT, 3);
    expect(crop.left).toBeLessThan((1600 - crop.width) / 2);
  });

  it('reduce dimensiones si superan el máximo', () => {
    const out = computeResizeDimensions(2000, 2800, 1400);
    expect(Math.max(out.width, out.height)).toBe(1400);
  });
});
