export type PvpDto = {
  id?: string;
  card_id: string;
  pvp: number;
  currency: string;
  /** null u omitida = PVP base */
  rareza?: string | null;
};

/** Fila para `GET /pvp/:card_id` (panel). */
export type PvpCardRowDto = {
  card_id: string;
  rareza: string | null;
  pvp: number | null;
  currency: string | null;
  has_stock: boolean;
};


