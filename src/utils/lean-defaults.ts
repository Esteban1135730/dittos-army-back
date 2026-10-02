import type { Model } from 'mongoose';

/**
 * `.lean()` no aplica los `default` del schema; un documento hidratado sí
 * (p. ej. `quantity: 1` en reservas legacy). Rellena esos defaults en los
 * objetos planos para que el JSON servido sea el mismo que con `toJSON()`.
 * Muta y devuelve el mismo array.
 */
export function applyLeanDefaults<T>(model: Model<any>, rows: T[]): T[] {
  for (const row of rows) {
    if (row != null) model.applyDefaults(row as object);
  }
  return rows;
}
