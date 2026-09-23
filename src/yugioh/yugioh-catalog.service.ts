import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { YGOPRODECK_API } from './yugioh.constants';
import {
  filterYugiohSets,
  mapYugiohCard,
  mapYugiohSet,
  type YugiohCard,
  type YugiohSet,
} from './yugioh-catalog.map';

const CACHE_MS = 60 * 60 * 1000;

@Injectable()
export class YugiohCatalogService {
  private readonly logger = new Logger(YugiohCatalogService.name);
  private setsCache: { at: number; sets: YugiohSet[] } | null = null;

  async listSets(query?: string): Promise<YugiohSet[]> {
    const sets = await this.loadSets();
    return filterYugiohSets(sets, query ?? '');
  }

  async cardsInSet(setName: string): Promise<{ set: YugiohSet; cards: YugiohCard[] }> {
    const name = setName.trim();
    const sets = await this.loadSets();
    const set = sets.find((row) => row.name.toLowerCase() === name.toLowerCase());
    if (!set) {
      throw new NotFoundException(`Expansión Yu-Gi-Oh no encontrada: ${name}`);
    }
    const url = `${YGOPRODECK_API}/cardinfo.php?cardset=${encodeURIComponent(set.name)}`;
    const payload = await this.getJson<{ data?: unknown[] }>(url);
    if (!payload) {
      throw new BadGatewayException('El catálogo de Yu-Gi-Oh respondió con error');
    }
    const cards = (payload.data ?? [])
      .map((row) => mapYugiohCard(row as Parameters<typeof mapYugiohCard>[0], set.name))
      .filter((card): card is YugiohCard => card != null);
    return { set, cards };
  }

  async searchByName(query: string): Promise<YugiohCard[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const url = `${YGOPRODECK_API}/cardinfo.php?fname=${encodeURIComponent(q)}`;
    const payload = await this.getJson<{ data?: unknown[] }>(url, true);
    if (!payload) return [];
    return (payload.data ?? [])
      .map((row) => mapYugiohCard(row as Parameters<typeof mapYugiohCard>[0], ''))
      .filter((card): card is YugiohCard => card != null)
      .slice(0, 30);
  }

  private async loadSets(): Promise<YugiohSet[]> {
    if (this.setsCache && Date.now() - this.setsCache.at < CACHE_MS) {
      return this.setsCache.sets;
    }
    const payload = await this.getJson<unknown[]>(`${YGOPRODECK_API}/cardsets.php`);
    const sets = (Array.isArray(payload) ? payload : [])
      .map((row) => mapYugiohSet(row as Parameters<typeof mapYugiohSet>[0]))
      .filter((set): set is YugiohSet => set != null)
      .sort((a, b) => a.name.localeCompare(b.name));
    this.setsCache = { at: Date.now(), sets };
    return sets;
  }

  private async getJson<T>(url: string, emptyOnNotFound = false): Promise<T | null> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'DittosArmy/yugioh-mvp',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'network';
      this.logger.warn(`YGOPRODeck no responde: ${message}`);
      throw new BadGatewayException('No se pudo consultar el catálogo de Yu-Gi-Oh');
    }
    if (!response.ok) {
      if (emptyOnNotFound && response.status === 400) return null;
      this.logger.warn(`YGOPRODeck HTTP ${response.status} ${url}`);
      throw new BadGatewayException('El catálogo de Yu-Gi-Oh respondió con error');
    }
    return (await response.json()) as T;
  }
}
