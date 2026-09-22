import { buildCardLocaleFallbackChain } from './tcgdex.service';

describe('buildCardLocaleFallbackChain', () => {
  it('keeps preferred locale first and adds regional fallbacks', () => {
    expect(buildCardLocaleFallbackChain('ja')).toEqual(['ja', 'zh-cn', 'en']);
    expect(buildCardLocaleFallbackChain('zh-cn')).toEqual([
      'zh-cn',
      'ja',
      'en',
    ]);
    expect(buildCardLocaleFallbackChain('en')).toEqual(['en', 'ja', 'zh-cn']);
    expect(buildCardLocaleFallbackChain('ko')).toEqual([
      'ko',
      'ja',
      'zh-cn',
      'en',
    ]);
    expect(buildCardLocaleFallbackChain('it')).toEqual([
      'it',
      'en',
      'ja',
      'zh-cn',
    ]);
    expect(buildCardLocaleFallbackChain('es')).toEqual([
      'es',
      'en',
      'ja',
      'zh-cn',
    ]);
  });
});
