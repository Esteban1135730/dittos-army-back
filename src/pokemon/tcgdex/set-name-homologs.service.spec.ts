import { SetNameHomologsService } from './set-name-homologs.service';

describe('SetNameHomologsService', () => {
  let service: SetNameHomologsService;

  beforeEach(() => {
    service = new SetNameHomologsService();
    service.load();
  });

  it('prioriza asia_set_english_labels por id TCGdex', () => {
    if (!service.isLoaded()) {
      return;
    }
    expect(service.getEnglishLabel('ja', 'BW1a')).toBe('Black Collection');
    expect(service.getEnglishLabel('ja', 'BW1b')).toBe('White Collection');
    expect(service.getEnglishLabel('ja', 'SV5a')).toBe('Crimson Haze');
  });

  it('resuelve BW3 split sets por id TCGdex', () => {
    if (!service.isLoaded()) {
      return;
    }
    expect(service.getEnglishLabel('ja', 'BW3a')).toBe('Hail Blizzard');
    expect(service.getEnglishLabel('ja', 'BW3b')).toBe('Psycho Drive');
    expect(service.getEnglishLabel('ja', 'BW3a', 'ヘイルブリザード')).toBe(
      'Hail Blizzard',
    );
    expect(service.getEnglishLabel('ja', 'BW3b', 'サイコドライブ')).toBe(
      'Psycho Drive',
    );
  });

  it('resuelve ko con fallback homolog ja:', () => {
    if (!service.isLoaded()) {
      return;
    }
    expect(service.getEnglishLabel('ko', 'SV5a', '크림슨헤이즈')).toBe(
      'Crimson Haze',
    );
  });

  it('resuelve eras clásicas y sets chinos por id', () => {
    if (!service.isLoaded()) {
      return;
    }
    expect(service.getEnglishLabel('ja', 'Pt1')).toBe("Galactic's Conquest");
    expect(service.getEnglishLabel('ja', 'neo1')).toBe('Neo Genesis');
    expect(service.getEnglishLabel('ja', 'SC1a', '劍&盾 SET A')).toBe(
      'Sword & Shield SET A',
    );
    expect(service.getEnglishLabel('ja', 'csm1a', '风暴涌现')).toBe(
      'Storming Emergence',
    );
    expect(service.getEnglishLabel('ja', 'SV3s', 'Kilau Hitam')).toBe(
      'Ruler of the Black Flame',
    );
  });
});
