/**
 * Normalización de celular alineada con el front
 * (`normalizarNumeroWhatsApp`: dígitos; 10 dígitos que empiezan en 3 → prefijo 57).
 */

export function normalizePhoneDigits(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  return digits;
}

/** Nick de WhatsApp (`@usuario`) u otro contacto no numérico. */
export function isNickContact(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  return raw.startsWith('@') || /[A-Za-z_]/.test(raw);
}

/**
 * Teléfono usable como E.164/wa_id (solo dígitos, length >= 10), vs nick.
 * Aplica la misma regla de prefijo Colombia que `normalizePhoneDigits`.
 */
export function isE164Phone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || isNickContact(trimmed)) return false;
  const digits = normalizePhoneDigits(trimmed);
  return digits.length >= 10;
}

/** wa_id / celular_e164: dígitos sin `+`. Nick o vacío → undefined. */
export function toCelularE164(
  celular: string | undefined | null,
): string | undefined {
  if (!celular?.trim()) return undefined;
  if (!isE164Phone(celular)) return undefined;
  const digits = normalizePhoneDigits(celular);
  return digits || undefined;
}
