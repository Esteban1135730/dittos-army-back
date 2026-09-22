import {
  encodeStockBarcodePayload,
  encodeStockQrPayload,
  parseStockBarcodePayload,
  parseStockQrPayload,
  parseStockQrPayloadMulti,
} from './stock-barcode-payload';

const validId = '507f1f77bcf86cd799439011';

describe('stock-barcode-payload', () => {
  it('codifica y decodifica Code128 payload (legacy Pablo)', () => {
    const encoded = encodeStockBarcodePayload(validId);
    expect(encoded).toBe(`DA-STOCK:${validId}`);
    expect(parseStockBarcodePayload(encoded)).toBe(validId);
  });

  it('acepta ObjectId plano (pistolas sin prefijo)', () => {
    expect(parseStockBarcodePayload(validId)).toBe(validId);
    expect(parseStockQrPayloadMulti(validId)).toEqual({
      stockId: validId,
      owner: null,
    });
  });

  it('tolera layout teclado ES en pistola QR (Ñ y apostrofe) Pablo', () => {
    expect(parseStockBarcodePayload(`DA'STOCKÑ691e97501c83b1923bfc6e63`)).toBe(
      '691e97501c83b1923bfc6e63',
    );
  });

  it('parsea ESTEBAN-STOCK: y variantes teclado ES', () => {
    expect(parseStockQrPayloadMulti(`ESTEBAN-STOCK:${validId}`)).toEqual({
      stockId: validId,
      owner: 'esteban',
      prefixUsed: 'ESTEBAN-STOCK:',
    });
    const loose = parseStockQrPayloadMulti(`ESTEBAN'STOCKÑ${validId}`);
    expect(loose).toEqual({
      stockId: validId,
      owner: 'esteban',
      prefixUsed: 'ESTEBAN-STOCK:',
    });
  });

  it('tolera layout teclado ES/LATAM en macOS (pistola: / y >)', () => {
    expect(parseStockQrPayloadMulti(`ESTEBAN/STOCK>${validId}`)).toEqual({
      stockId: validId,
      owner: 'esteban',
      prefixUsed: 'ESTEBAN-STOCK:',
    });
    expect(parseStockBarcodePayload(`DA/STOCK>${validId}`)).toBe(validId);
  });

  it('parsea DA-STOCK: → owner pablo', () => {
    expect(parseStockQrPayloadMulti(`DA-STOCK:${validId}`)).toEqual({
      stockId: validId,
      owner: 'pablo',
      prefixUsed: 'DA-STOCK:',
    });
  });

  it('encode con owner esteban usa prefijo ESTEBAN-STOCK:', () => {
    expect(encodeStockQrPayload(validId, 'esteban')).toBe(
      `ESTEBAN-STOCK:${validId}`,
    );
  });

  it('prefijo desconocido → null', () => {
    expect(parseStockQrPayload(`OTRO-STOCK:${validId}`)).toBeNull();
    expect(parseStockQrPayloadMulti(`OTRO-STOCK:${validId}`)).toBeNull();
  });

  it('rechaza payload inválido', () => {
    expect(parseStockBarcodePayload('no-es-id')).toBeNull();
  });
});
