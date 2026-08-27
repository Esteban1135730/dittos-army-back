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
    expect(r.parsed.unit_price_cop).toBe(15000);
  });

  it('rechaza línea sin ID', () => {
    const r = parseStoreCatalogLine('- Pikachu (Inglés) x1');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issue).toBe('missing_card_id');
  });

  it('extrae nombre del mensaje', () => {
    const msg = ['Hola', sampleLine, '', 'A nombre de: Juan Pérez', ''].join(
      '\n',
    );
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

  it('parsea línea de Próximamente con sufijo en camino', () => {
    const r = parseStoreCatalogLine(
      '- Pikipek | ID: me05-066 | Expansión: Pitch Black (#066) | Idioma: Inglés x2 (7 en camino)',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parsed.card_id).toBe('me05-066');
    expect(r.parsed.language).toBe('en');
    expect(r.parsed.rareza).toBeNull();
    expect(r.parsed.quantity).toBe(2);
    expect(r.parsed.unit_price_cop).toBeNull();
  });

  it('usa el PVP unitario, no el subtotal de la línea', () => {
    const r = parseStoreCatalogLine(
      '- Archaludon ex | ID: sv08-130 | Expansión: Surging Sparks (#130) | Idioma: Inglés | Precio: $ 15.000 c/u ($ 30.000 en esta línea) — Holo x2',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parsed.unit_price_cop).toBe(15000);
    expect(r.parsed.quantity).toBe(2);
  });
});
