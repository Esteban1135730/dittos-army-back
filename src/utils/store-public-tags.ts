/** Tags operativos que sí se publican en el JSON de la tienda. */
export const STORE_PUBLIC_TAGS = ['vintage', 'jugable'] as const;

export type StorePublicTag = (typeof STORE_PUBLIC_TAGS)[number];

export function toStorePublicTags(
  tags: string[] | undefined | null,
): StorePublicTag[] | undefined {
  const set = new Set(
    (tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
  );
  const out = STORE_PUBLIC_TAGS.filter((t) => set.has(t));
  return out.length > 0 ? out : undefined;
}
