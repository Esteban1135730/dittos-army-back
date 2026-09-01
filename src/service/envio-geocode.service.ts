import { BadRequestException, Injectable } from '@nestjs/common';
import {
  googleResultInBogota,
  nominatimHitInBogota,
  type GoogleGeocodeResult,
  type NominatimHit,
} from 'src/utils/bogota-geo';

export type EnvioGeocodePoint = { lat: number; lng: number };

const QUERY_MIN = 3;
const QUERY_MAX = 240;

@Injectable()
export class EnvioGeocodeService {
  private readonly cache = new Map<string, EnvioGeocodePoint | null>();

  async geocodeIfBogota(
    raw: string | undefined,
  ): Promise<EnvioGeocodePoint | null> {
    const q = this.normalizeQuery(raw);
    if (!q) {
      throw new BadRequestException('q inválido');
    }
    if (this.cache.has(q)) {
      return this.cache.get(q) ?? null;
    }
    const point = await this.resolve(q);
    this.cache.set(q, point);
    return point;
  }

  private normalizeQuery(raw: string | undefined): string {
    const q = raw?.trim().replace(/\s+/g, ' ') ?? '';
    if (q.length < QUERY_MIN || q.length > QUERY_MAX) return '';
    return q;
  }

  private googleKey(): string {
    return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? '';
  }

  private async resolve(q: string): Promise<EnvioGeocodePoint | null> {
    const key = this.googleKey();
    if (key) {
      const google = await this.googleSearch(q, key);
      if (google === 'elsewhere') return null;
      if (google) return google;
    }
    return this.nominatimSearch(q);
  }

  /**
   * `elsewhere` = Google encontró coincidencias, ninguna en Bogotá (no forzar pin).
   * `null` = error o cero resultados → se puede caer a Nominatim.
   */
  private async googleSearch(
    q: string,
    key: string,
  ): Promise<EnvioGeocodePoint | 'elsewhere' | null> {
    const geocoded = await this.googleGeocode(q, key);
    if (geocoded && geocoded !== 'elsewhere') return geocoded;
    const places = await this.googlePlacesTextSearch(q, key);
    if (places && places !== 'elsewhere') return places;
    if (geocoded === 'elsewhere' || places === 'elsewhere') return 'elsewhere';
    return null;
  }

  private async googleGeocode(
    q: string,
    key: string,
  ): Promise<EnvioGeocodePoint | 'elsewhere' | null> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', q);
    url.searchParams.set('language', 'es');
    url.searchParams.set('region', 'co');
    url.searchParams.set('key', key);
    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        status?: string;
        results?: GoogleGeocodeResult[];
      };
      if (body.status && body.status !== 'OK' && body.status !== 'ZERO_RESULTS') {
        return null;
      }
      const results = Array.isArray(body.results) ? body.results : [];
      if (results.length === 0) return null;
      const hit = results.find((r) => googleResultInBogota(r));
      if (!hit) return 'elsewhere';
      const lat = Number(hit.geometry?.location?.lat);
      const lng = Number(hit.geometry?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }

  private async googlePlacesTextSearch(
    q: string,
    key: string,
  ): Promise<EnvioGeocodePoint | 'elsewhere' | null> {
    const url = new URL(
      'https://maps.googleapis.com/maps/api/place/textsearch/json',
    );
    url.searchParams.set('query', q);
    url.searchParams.set('language', 'es');
    url.searchParams.set('region', 'co');
    url.searchParams.set('key', key);
    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        status?: string;
        results?: GoogleGeocodeResult[];
      };
      if (body.status === 'REQUEST_DENIED' || body.status === 'INVALID_REQUEST') {
        return null;
      }
      const results = Array.isArray(body.results) ? body.results : [];
      if (results.length === 0) return null;
      const hit = results.find((r) => googleResultInBogota(r));
      if (!hit) return 'elsewhere';
      const lat = Number(hit.geometry?.location?.lat);
      const lng = Number(hit.geometry?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }

  private async nominatimSearch(q: string): Promise<EnvioGeocodePoint | null> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'co');
    url.searchParams.set('accept-language', 'es');
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'dittos-army-back/1.0 (coordinar-envios)',
        },
      });
      if (!res.ok) return null;
      const data: unknown = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const hit = (data as NominatimHit[]).find((row) =>
        nominatimHitInBogota(row),
      );
      if (!hit) return null;
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }
}
