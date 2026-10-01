/**
 * Recorta fotos de inventario existentes: quita bandas negras, ivCam y encuadra carta.
 *
 * Uso (desde dittos-army-back):
 *   npm run script:trim-inventory-photos
 *   OWNER=esteban npm run script:trim-inventory-photos
 */

import 'dotenv/config';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  resolveStockPhotosRoot,
  sanitizeStockPhotoSegment,
} from '../src/utils/stock-photo-path';
import { reprocessInventoryPhotoBuffer } from '../src/utils/inventory-photo-reprocess';

function listJpgFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJpgFiles(full));
    else if (entry.isFile() && /\.jpe?g$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function main() {
  const owner = (process.env.OWNER ?? 'esteban').trim() || 'esteban';
  const ownerDir = join(
    resolveStockPhotosRoot(),
    sanitizeStockPhotoSegment(owner),
  );
  const files = listJpgFiles(ownerDir);

  if (files.length === 0) {
    console.log(`Sin fotos en ${ownerDir}`);
    return;
  }

  let processed = 0;
  let failed = 0;

  for (const fullPath of files) {
    try {
      const raw = readFileSync(fullPath);
      if (!raw.length) {
        failed += 1;
        continue;
      }
      const next = await reprocessInventoryPhotoBuffer(raw);
      writeFileSync(fullPath, next);
      processed += 1;
      console.log(`OK ${fullPath}`);
    } catch (err) {
      failed += 1;
      console.warn(`FAIL ${fullPath}`, err);
    }
  }

  console.log(
    `Listo (${owner}): ${processed}/${files.length} recortadas, ${failed} fallidas.`,
  );
}

void main();
