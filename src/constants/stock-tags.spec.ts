import { BadRequestException } from '@nestjs/common';
import { normalizeStockTagsInput } from './stock-tags';

describe('normalizeStockTagsInput', () => {
  it('devuelve [] para undefined y null', () => {
    expect(normalizeStockTagsInput(undefined)).toEqual([]);
    expect(normalizeStockTagsInput(null)).toEqual([]);
  });

  it('normaliza mayúsculas y ordena al catálogo', () => {
    expect(normalizeStockTagsInput(['JUGABLE', 'vintage'])).toEqual([
      'vintage',
      'jugable',
    ]);
  });

  it('deduplica', () => {
    expect(normalizeStockTagsInput(['bulk', 'BULK', ' bulk '])).toEqual([
      'bulk',
    ]);
  });

  it('rechaza tipo no array', () => {
    expect(() => normalizeStockTagsInput('vintage')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza tag desconocido', () => {
    expect(() =>
      normalizeStockTagsInput(['vintage', 'nope']),
    ).toThrow(BadRequestException);
  });

  it('rechaza elemento no string', () => {
    expect(() => normalizeStockTagsInput(['vintage', 1 as any])).toThrow(
      BadRequestException,
    );
  });
});
