import { isCiudadBogota } from './tiendas-entrega';

/** Caja aproximada del área urbana de Bogotá (incluye Cedritos, Engativá, Usaquén). */
export const BOGOTA_BBOX = {
  latMin: 4.45,
  latMax: 4.85,
  lngMin: -74.26,
  lngMax: -73.97,
} as const;

export function isLatLngInBogota(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= BOGOTA_BBOX.latMin &&
    lat <= BOGOTA_BBOX.latMax &&
    lng >= BOGOTA_BBOX.lngMin &&
    lng <= BOGOTA_BBOX.lngMax
  );
}

export function textMentionsBogota(
  ...values: Array<string | null | undefined>
): boolean {
  return values.some((v) => isCiudadBogota(v));
}

export type GoogleGeocodeResult = {
  formatted_address?: string;
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
  geometry?: { location?: { lat?: number; lng?: number } };
};

export function googleResultInBogota(result: GoogleGeocodeResult): boolean {
  const loc = result.geometry?.location;
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const names = [
    result.formatted_address,
    ...(result.address_components ?? []).flatMap((c) => [
      c.long_name,
      c.short_name,
    ]),
  ];
  if (textMentionsBogota(...names)) return true;
  return isLatLngInBogota(lat, lng);
}

export type NominatimHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    municipality?: string;
    state?: string;
    county?: string;
    country?: string;
  };
};

export function nominatimHitInBogota(hit: NominatimHit): boolean {
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (
    textMentionsBogota(
      hit.display_name,
      hit.address?.city,
      hit.address?.town,
      hit.address?.municipality,
      hit.address?.state,
      hit.address?.county,
    )
  ) {
    return true;
  }
  return isLatLngInBogota(lat, lng);
}
