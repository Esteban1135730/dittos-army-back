/** Día civil UTC YYYY-MM-DD (misma semántica que PedidoService.parseFechaDia). */
export function parseCivilDateUtc(value: string): Date | null {
  const raw = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const isoDay = m ? raw : raw.slice(0, 10);
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!parsed) return null;
  const year = Number(parsed[1]);
  const month = Number(parsed[2]);
  const day = Number(parsed[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
