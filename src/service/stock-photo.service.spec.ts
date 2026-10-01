import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  stockPhotoPublicPath,
  stockPhotoRelativePath,
} from '../utils/stock-photo-path';
import { StockPhotoService } from './stock-photo.service';

describe('stock-photo-path + service', () => {
  const root = join(tmpdir(), `stock-photo-test-${Date.now()}`);

  beforeAll(() => {
    process.env.STOCK_PHOTOS_DIR = root;
    mkdirSync(root, { recursive: true });
  });

  afterAll(() => {
    delete process.env.STOCK_PHOTOS_DIR;
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it('genera ruta relativa por owner/card/stock', () => {
    expect(stockPhotoRelativePath('esteban', 'sv8-194', 'abc123')).toBe(
      'esteban/sv8-194/abc123.jpg',
    );
    expect(stockPhotoPublicPath('esteban', 'sv8-194', 'abc123')).toBe(
      '/stock-photos/esteban/sv8-194/abc123.jpg',
    );
  });

  it('parseImageBase64 acepta data URL jpeg', () => {
    const service = new StockPhotoService({} as never);
    const tiny =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z';
    const parsed = service.parseImageBase64(tiny);
    expect(parsed.contentType).toBe('image/jpeg');
    expect(parsed.buffer.length).toBeGreaterThan(0);
  });

  it('photoFileExists detecta archivo guardado', () => {
    const service = new StockPhotoService({} as never);
    const relative = stockPhotoRelativePath('esteban', 'base1-4', 'id1');
    const full = join(root, ...relative.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, Buffer.from('fake'));
    expect(service.photoFileExists('esteban', 'base1-4', 'id1')).toBe(true);
    expect(service.photoFileExists('esteban', 'base1-4', 'missing')).toBe(false);
  });
});
