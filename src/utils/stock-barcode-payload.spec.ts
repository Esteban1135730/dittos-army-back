import {
  encodeStockBarcodePayload,
  parseStockBarcodePayload,
} from './stock-barcode-payload';

const validId = '507f1f77bcf86cd799439011';

describe('stock-barcode-payload', () => {
  it('codifica y decodifica Code128 payload', () => {
    const encoded = encodeStockBarcodePayload(validId);
    expect(encoded).toBe(`DA-STOCK:${validId}`);
    expect(parseStockBarcodePayload(encoded)).toBe(validId);
  });

  it('acepta ObjectId plano (pistolas sin prefijo)', () => {
    expect(parseStockBarcodePayload(validId)).toBe(validId);
  });

  it('rechaza payload inválido', () => {
    expect(parseStockBarcodePayload('no-es-id')).toBeNull();
  });
});
