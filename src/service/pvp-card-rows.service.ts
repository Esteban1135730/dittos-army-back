import { Injectable } from '@nestjs/common';
import { PvpCardRowDto } from '../Dto/pvp.dto';
import { PvpRepository } from '../repository/pvp.repository';
import { StockRepository } from '../repository/stock.repository';
import { effectiveOperationalRarezaFromStock, stockLineRareza } from '../utils/pvp-resolve';

@Injectable()
export class PvpCardRowsService {
  constructor(
    private readonly pvpRepository: PvpRepository,
    private readonly stockRepository: StockRepository,
  ) {}

  /**
   * Filas para `GET /pvp/:card_id`: base + unión rarezas en stock ∪ PVP.
   */
  async buildRowsForCard(cardId: string): Promise<PvpCardRowDto[]> {
    const [stocks, pvps] = await Promise.all([
      this.stockRepository.findByCardId(cardId),
      this.pvpRepository.findAllByCardId(cardId),
    ]);
    const stockList = stocks ?? [];

    const rarezaHasStock = new Map<string, boolean>();
    let baseHasStock = false;
    for (const s of stockList) {
      const rz = effectiveOperationalRarezaFromStock(s);
      if (rz === null) baseHasStock = true;
      else rarezaHasStock.set(rz, true);
    }

    const pvpByRareza = new Map<string | null, { pvp: number; currency: string }>();
    for (const p of pvps) {
      const key = stockLineRareza(p.rareza);
      pvpByRareza.set(key, { pvp: p.pvp, currency: p.currency });
    }

    const variantKeys = new Set<string>();
    for (const k of rarezaHasStock.keys()) variantKeys.add(k);
    for (const p of pvps) {
      const k = stockLineRareza(p.rareza);
      if (k != null) variantKeys.add(k);
    }

    const sortedVariants = [...variantKeys].sort((a, b) =>
      a.localeCompare(b, 'es'),
    );

    const basePvp = pvpByRareza.get(null);
    const rows: PvpCardRowDto[] = [
      {
        card_id: cardId,
        rareza: null,
        pvp: basePvp?.pvp ?? null,
        currency: basePvp?.currency ?? null,
        has_stock: baseHasStock,
      },
    ];

    for (const rz of sortedVariants) {
      const doc = pvpByRareza.get(rz);
      rows.push({
        card_id: cardId,
        rareza: rz,
        pvp: doc?.pvp ?? null,
        currency: doc?.currency ?? null,
        has_stock: rarezaHasStock.get(rz) === true,
      });
    }

    return rows;
  }
}
