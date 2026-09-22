/** Texto para geocodificar un envío que no es tienda: dirección/punto, notas y ciudad. */
export function buildEnvioGeocodeQuery(fields: {
  direccion_o_punto?: string | null;
  notas_entrega?: string | null;
  ciudad?: string | null;
}): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of [
    fields.direccion_o_punto,
    fields.notas_entrega,
    fields.ciudad,
  ]) {
    const part = raw?.trim().replace(/\s+/g, ' ') ?? '';
    if (part.length < 2) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  return parts.join(', ');
}
