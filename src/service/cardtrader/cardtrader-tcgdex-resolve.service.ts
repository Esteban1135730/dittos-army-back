import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

type HomologSetEntry = {
  tcgdex_set_id?: string;
  locale?: string;
  names?: {
    en_cardtrader?: string | null;
    englishName?: string | null;
    database?: Record<string, string | null>;
  };
  cardtrader?: {
    id?: number;
    code?: string;
  };
};

export type TcgdexResolveResult = {
  tcgdex_card_id: string | null;
  tcgdex_set_id: string | null;
  locale: string | null;
  error: string | null;
};

@Injectable()
export class CardTraderTcgdexResolveService {
  private readonly byCtExpansionId = new Map<
    number,
    { tcgdex_set_id: string; locale: string }
  >();
  private readonly byCtExpansionName = new Map<
    string,
    { tcgdex_set_id: string; locale: string }
  >();

  constructor() {
    this.loadHomolog();
  }

  private normalizeName(value: string | null | undefined): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private registerSet(entry: HomologSetEntry): void {
    const setId = entry.tcgdex_set_id?.trim();
    const locale = entry.locale?.trim() || 'en';
    if (!setId) return;

    const meta = { tcgdex_set_id: setId, locale };
    const ctId = entry.cardtrader?.id;
    if (typeof ctId === 'number' && ctId > 0) {
      this.byCtExpansionId.set(ctId, meta);
    }

    const names = new Set<string>();
    if (entry.names?.en_cardtrader)
      names.add(this.normalizeName(entry.names.en_cardtrader));
    if (entry.names?.englishName)
      names.add(this.normalizeName(entry.names.englishName));
    const db = entry.names?.database;
    if (db && typeof db === 'object') {
      for (const v of Object.values(db)) {
        if (v) names.add(this.normalizeName(v));
      }
    }
    for (const name of names) {
      if (name) this.byCtExpansionName.set(name, meta);
    }
  }

  private loadHomolog(): void {
    const filePath = path.join(
      process.cwd(),
      'data',
      'cardtrader_tcgdex_homolog.json',
    );
    if (!fs.existsSync(filePath)) return;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        sets?: Record<string, HomologSetEntry>;
      };
      const sets = raw.sets ?? {};
      for (const entry of Object.values(sets)) {
        this.registerSet(entry);
      }
    } catch {
      /* homolog opcional para demo */
    }
  }

  private normalizeCollectorNumber(
    raw: string | null | undefined,
  ): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const withoutLeadingZeros = s.replace(/^0+(?=\d)/, '');
    return withoutLeadingZeros || '0';
  }

  private findSet(args: {
    expansionName?: string;
    expansionId?: number;
  }): { tcgdex_set_id: string; locale: string } | null {
    if (typeof args.expansionId === 'number' && args.expansionId > 0) {
      const byId = this.byCtExpansionId.get(args.expansionId);
      if (byId) return byId;
    }
    const nameKey = this.normalizeName(args.expansionName);
    if (nameKey) {
      const byName = this.byCtExpansionName.get(nameKey);
      if (byName) return byName;
    }
    return null;
  }

  resolveTcgdexCardId(args: {
    expansionName?: string;
    expansionId?: number;
    collectorNumber?: string;
  }): TcgdexResolveResult {
    const set = this.findSet(args);
    if (!set) {
      return {
        tcgdex_card_id: null,
        tcgdex_set_id: null,
        locale: null,
        error: 'expansion sin homologación TCGdex',
      };
    }

    const localId = this.normalizeCollectorNumber(args.collectorNumber);
    if (!localId) {
      return {
        tcgdex_card_id: null,
        tcgdex_set_id: set.tcgdex_set_id,
        locale: set.locale,
        error: 'sin collector_number en el ítem',
      };
    }

    return {
      tcgdex_card_id: `${set.tcgdex_set_id}-${localId}`,
      tcgdex_set_id: set.tcgdex_set_id,
      locale: set.locale,
      error: null,
    };
  }
}
