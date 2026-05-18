import {
  extractClientNameFromStoreMessage,
  parseStoreCatalogCartLines,
  parseStoreCatalogLine,
} from './store-whatsapp-message-parser';

describe('store-whatsapp-message-parser', () => {
  const sampleLine =
    '- Archaludon ex | ID: sv08-130 | Expansión: Surging Sparks (#130) | Idioma: Inglés | Precio: $ 15.000 c/u — Holo x2';

  it('parsea línea con ID, idioma, variante y cantidad', () => {
    const r = parseStoreCatalogLine(sampleLine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parsed.card_id).toBe('sv08-130');
    expect(r.parsed.language).toBe('en');
    expect(r.parsed.rareza).toBe('holofoil');
    expect(r.parsed.quantity).toBe(2);
  });

  it('rechaza línea sin ID', () => {
    const r = parseStoreCatalogLine('- Pikachu (Inglés) x1');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issue).toBe('missing_card_id');
  });

  it('extrae nombre del mensaje', () => {
    const msg = ['Hola', sampleLine, '', 'A nombre de: Juan Pérez', ''].join('\n');
    expect(extractClientNameFromStoreMessage(msg)).toBe('Juan Pérez');
  });

  it('ignora pies y solo devuelve líneas de carta', () => {
    const msg = [
      'Hola, quiero reservar las siguientes cartas:',
      '',
      sampleLine,
      '',
      'Total: $ 30.000',
      'A nombre de: Ana',
    ].join('\n');
    const lines = parseStoreCatalogCartLines(msg);
    expect(lines).toHaveLength(1);
    expect(lines[0].result.ok).toBe(true);
  });
});
