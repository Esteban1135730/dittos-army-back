import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type HomologSetEntry = {
  tcgdex_set_id?: string;
  locale?: string;
  names?: {
    en_cardtrader?: string | null;
    database?: Record<string, string>;
  };
};

type HomologsFile = {
  sets?: Record<string, HomologSetEntry>;
};

type AsiaLabelsFile = {
  bySetId?: Record<string, string>;
  byJaName?: Record<string, string>;
};

/**
 * Resuelve el nombre en inglés (label UI) para sets asiáticos de TCGdex:
 * 1) asia_set_english_labels.json (generado desde cards-database)
 * 2) set_name_homologs.json (CardTrader / homologación previa)
 */
@Injectable()
export class SetNameHomologsService implements OnModuleInit {
  private readonly logger = new Logger(SetNameHomologsService.name);
  private setsIndex: Record<string, HomologSetEntry> = {};
  private homologsLoaded = false;
  private asiaBySetId: Record<string, string> = {};
  private asiaByJaName: Record<string, string> = {};
  private asiaLabelsLoaded = false;

  onModuleInit(): void {
    this.load();
  }

  private resolveHomologsPath(): string {
    const fromEnv = process.env.SET_NAME_HOMOLOGS_PATH?.trim();
    if (fromEnv && existsSync(fromEnv)) {
      return fromEnv;
    }
    return join(process.cwd(), 'data', 'set_name_homologs.json');
  }

  private resolveAsiaLabelsPath(): string {
    const fromEnv = process.env.ASIA_SET_ENGLISH_LABELS_PATH?.trim();
    if (fromEnv && existsSync(fromEnv)) {
      return fromEnv;
    }
    return join(process.cwd(), 'data', 'asia_set_english_labels.json');
  }

  load(): void {
    this.loadHomologs();
    this.loadAsiaLabels();
  }

  private loadHomologs(): void {
    const path = this.resolveHomologsPath();
    if (!existsSync(path)) {
      this.logger.warn(
        `set_name_homologs.json no encontrado en ${path}; englishName usará asia labels y API en.`,
      );
      this.setsIndex = {};
      this.homologsLoaded = false;
      return;
    }
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw) as HomologsFile;
      this.setsIndex = parsed.sets ?? {};
      this.homologsLoaded = true;
      this.logger.log(
        `set_name_homologs cargado (${Object.keys(this.setsIndex).length} entradas) desde ${path}`,
      );
    } catch (err) {
      this.logger.error(
        `Error leyendo set_name_homologs.json: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.setsIndex = {};
      this.homologsLoaded = false;
    }
  }

  private loadAsiaLabels(): void {
    const path = this.resolveAsiaLabelsPath();
    if (!existsSync(path)) {
      this.logger.warn(
        `asia_set_english_labels.json no encontrado en ${path}; ejecuta cards-database/scripts/generate-set-english-labels.mjs`,
      );
      this.asiaBySetId = {};
      this.asiaByJaName = {};
      this.asiaLabelsLoaded = false;
      return;
    }
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw) as AsiaLabelsFile;
      this.asiaBySetId = parsed.bySetId ?? {};
      this.asiaByJaName = parsed.byJaName ?? {};
      this.asiaLabelsLoaded = true;
      this.logger.log(
        `asia_set_english_labels cargado (${Object.keys(this.asiaBySetId).length} ids) desde ${path}`,
      );
    } catch (err) {
      this.logger.error(
        `Error leyendo asia_set_english_labels.json: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.asiaBySetId = {};
      this.asiaByJaName = {};
      this.asiaLabelsLoaded = false;
    }
  }

  isLoaded(): boolean {
    return this.homologsLoaded || this.asiaLabelsLoaded;
  }

  /**
   * Nombre en inglés para mostrar en UI (englishName / label).
   */
  getEnglishLabel(
    locale: string,
    setId: string,
    localizedName?: string,
  ): string | undefined {
    const loc = (locale || '').trim().toLowerCase();
    const id = (setId || '').trim();
    if (!id) {
      return undefined;
    }

    const nameKey = localizedName?.trim();
    if (nameKey) {
      const fromAsiaName = this.asiaByJaName[nameKey]?.trim();
      if (fromAsiaName) {
        return fromAsiaName;
      }
    }

    const fromAsiaId =
      this.asiaBySetId[id]?.trim() ??
      this.asiaBySetId[id.toUpperCase()]?.trim();
    if (fromAsiaId) {
      return fromAsiaId;
    }

    if (loc) {
      const fromHomolog = this.entryEnglishName(`${loc}:${id}`);
      if (fromHomolog) {
        return fromHomolog;
      }

      // KO comparte muchos ids con JA en TCGdex
      if (loc === 'ko') {
        const fromJaHomolog = this.entryEnglishName(`ja:${id}`);
        if (fromJaHomolog) {
          return fromJaHomolog;
        }
      }
    }

    return undefined;
  }

  private entryEnglishName(key: string): string | undefined {
    const entry = this.setsIndex[key];
    const label = entry?.names?.en_cardtrader;
    if (typeof label === 'string' && label.trim() !== '') {
      return label.trim();
    }
    return undefined;
  }
}
