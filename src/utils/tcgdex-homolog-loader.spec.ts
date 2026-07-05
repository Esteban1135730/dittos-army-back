import * as fs from 'fs';
import * as path from 'path';
import {
  buildTcgdexSetResolveIndex,
  inferPrimaryLocale,
  loadTcgdexSetResolveIndex,
  resolveSetEnglishLabelsPath,
  resolveSetLocaleMapPath,
} from './tcgdex-homolog-loader';
import type { SetLocaleMapFile } from './tcgdex-set-resolve';

describe('tcgdex-homolog-loader', () => {
  it('resuelve la ruta canónica de set-english-labels.json', () => {
    const resolved = resolveSetEnglishLabelsPath();
    expect(resolved).not.toBeNull();
    expect(fs.existsSync(resolved!)).toBe(true);
    expect(resolved!).toMatch(/set-english-labels\.json|set_name_homologs\.json$/);
  });

  it('construye un índice amplio desde el JSON del repo', () => {
    const labelsPath = resolveSetEnglishLabelsPath();
    expect(labelsPath).not.toBeNull();
    const labels = JSON.parse(fs.readFileSync(labelsPath!, 'utf8'));
    const ctPath = path.join(process.cwd(), 'data', 'cardtrader_tcgdex_homolog.json');
    const ct = fs.existsSync(ctPath)
      ? JSON.parse(fs.readFileSync(ctPath, 'utf8'))
      : {};

    const index = buildTcgdexSetResolveIndex(labels, ct);
    expect(index.byCtExpansionName.size).toBeGreaterThan(500);
    expect(Object.keys(index.localeAliases).length).toBeGreaterThan(500);
    expect(index.byCtExpansionId.size).toBeGreaterThan(200);
  });

  it('registra nombres japoneses desde byJaName', () => {
    const labelsPath = resolveSetEnglishLabelsPath();
    const labels = JSON.parse(fs.readFileSync(labelsPath!, 'utf8'));
    const index = buildTcgdexSetResolveIndex(labels);

    const megaCannon = index.byCtExpansionName.get('メガロキャノン');
    expect(megaCannon?.tcgdex_set_id).toBe('BW9');
    expect(megaCannon?.locale).toBe('ja');
  });

  it('infiera locale ja para ids asiáticos conocidos', () => {
    expect(inferPrimaryLocale('M2', {})).toBe('ja');
    expect(inferPrimaryLocale('CSV5C', {})).toBe('zh-cn');
    expect(inferPrimaryLocale('base1', {})).toBe('en');
  });

  it('loadTcgdexSetResolveIndex carga sin error en el repo', () => {
    const index = loadTcgdexSetResolveIndex();
    expect(index.setLocaleById.get('M2')).toBe('ja');
    expect(index.setLocaleById.get('sv08')).toBe('en');
    expect(index.localeMap?.expansion_to_en_set).toBeDefined();
  });

  it('encuentra set_locale_map.json del pipeline card-trader', () => {
    const mapPath = resolveSetLocaleMapPath();
    expect(mapPath).not.toBeNull();
    expect(mapPath!).toMatch(/set_locale_map\.json$/);
  });

  it('incorpora locale_set_to_en del mapa en setLocaleById', () => {
    const localeMapPath = resolveSetLocaleMapPath();
    expect(localeMapPath).not.toBeNull();
    const localeMap = JSON.parse(
      fs.readFileSync(localeMapPath!, 'utf8'),
    ) as SetLocaleMapFile;
    const index = buildTcgdexSetResolveIndex({}, undefined, localeMap);
    expect(index.setLocaleById.get('SV8')).toBe('ja');
    expect(Object.keys(index.localeMap?.expansion_to_en_set ?? {}).length).toBeGreaterThan(
      500,
    );
  });
});
