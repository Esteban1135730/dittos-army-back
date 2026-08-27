import { BadRequestException } from '@nestjs/common';
import {
  buildQuoteSessionLines,
  parseQuoteSessionSource,
  parseRawPaste,
} from './cardtrader-quote-session.mapper';

describe('cardtrader-quote-session.mapper', () => {
  const matchedResolve = {
    status: 'matched' as const,
    blueprint_id: 99,
    expansion_id: 1577,
    expansion_name: 'Generations',
    name: 'Shroomish',
    collector_number: 'RC2',
    candidates: [],
  };

  it('parseQuoteSessionSource acepta whatsapp y urls', () => {
    expect(parseQuoteSessionSource('whatsapp')).toBe('whatsapp');
    expect(parseQuoteSessionSource(' urls ')).toBe('urls');
    expect(() => parseQuoteSessionSource('email')).toThrow(BadRequestException);
  });

  it('parseRawPaste rechaza vacío y más de 20000', () => {
    expect(parseRawPaste('hola')).toBe('hola');
    expect(() => parseRawPaste('')).toThrow(BadRequestException);
    expect(() => parseRawPaste('x'.repeat(20001))).toThrow(BadRequestException);
  });

  it('buildQuoteSessionLines preselecciona blueprint en matched', () => {
    const lines = buildQuoteSessionLines([
      {
        name: 'Shroomish',
        expansion: 'Generations',
        collector_number: 'RC2',
        language_label: 'Inglés',
        condition_label: 'Perfecto',
        resolve: matchedResolve,
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].line_status).toBe('picked');
    expect(lines[0].selected_blueprint).toMatchObject({
      blueprint_id: 99,
      expansion_id: 1577,
    });
    expect(lines[0].resolve).toMatchObject({ status: 'matched', blueprint_id: 99 });
  });

  it('400 si 0 o 101 líneas, o resolve.status inválido', () => {
    expect(() => buildQuoteSessionLines([])).toThrow(BadRequestException);
    expect(() =>
      buildQuoteSessionLines(
        Array.from({ length: 101 }, () => ({
          name: 'A',
          expansion: 'B',
          collector_number: '1',
          resolve: matchedResolve,
        })),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      buildQuoteSessionLines([
        {
          name: 'A',
          expansion: 'B',
          collector_number: '1',
          resolve: { status: 'maybe' },
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('ambiguous no preselecciona y conserva candidatos', () => {
    const lines = buildQuoteSessionLines([
      {
        name: 'Pikachu',
        expansion: 'Crown Zenith',
        collector_number: 'GG30',
        resolve: {
          status: 'ambiguous',
          candidates: [
            {
              blueprint_id: 1,
              expansion_id: 2,
              name: 'Pikachu',
              expansion_name: 'Crown Zenith',
              collector_number: 'GG30',
              image_url: 'https://cdn.example/a.jpg',
            },
            {
              blueprint_id: 3,
              expansion_id: 2,
              name: 'Pikachu',
              expansion_name: 'Crown Zenith',
              collector_number: 'GG30',
            },
          ],
        },
      },
    ]);
    expect(lines[0].selected_blueprint).toBeNull();
    expect(lines[0].line_status).toBe('pending');
    expect((lines[0].resolve.candidates as unknown[]).length).toBe(2);
  });
});
