import {
  isE164Phone,
  isNickContact,
  normalizePhoneDigits,
  toCelularE164,
} from './phone-normalize';

describe('phone-normalize', () => {
  it('3001234567 → 573001234567', () => {
    expect(normalizePhoneDigits('3001234567')).toBe('573001234567');
    expect(toCelularE164('3001234567')).toBe('573001234567');
  });

  it('+57 300 123 4567 → 573001234567', () => {
    expect(normalizePhoneDigits('+57 300 123 4567')).toBe('573001234567');
    expect(toCelularE164('+57 300 123 4567')).toBe('573001234567');
  });

  it('@nick → not a phone', () => {
    expect(isNickContact('@nick')).toBe(true);
    expect(isE164Phone('@nick')).toBe(false);
    expect(toCelularE164('@nick')).toBeUndefined();
  });

  it('vacío o corto no es E.164', () => {
    expect(toCelularE164('')).toBeUndefined();
    expect(toCelularE164('123')).toBeUndefined();
    expect(isE164Phone('123')).toBe(false);
  });
});
