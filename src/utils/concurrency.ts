/**
 * Ejecuta `fn` sobre cada elemento con como mucho `limit` promesas en vuelo.
 * El resultado conserva el orden de `items`. Si alguna promesa rechaza, se
 * rechaza con el primer error y no se arrancan elementos nuevos (las ya
 * iniciadas terminan en segundo plano).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  if (items.length === 0) return results;
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;
  let failed = false;
  const run = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}

/**
 * Recibe tareas ya lanzadas en paralelo y devuelve el primer valor aceptado
 * siguiendo el orden de `tasks`. Un rechazo solo se propaga si ninguna tarea
 * anterior fue aceptada: misma semántica que recorrerlas en secuencia y cortar
 * en el primer acierto, pero con la latencia de la más lenta necesaria.
 */
export async function firstAcceptedInOrder<T>(
  tasks: readonly Promise<T>[],
  accept: (value: T) => boolean = (value) => Boolean(value),
): Promise<{ value: T; index: number } | null> {
  for (const task of tasks) task.catch(() => undefined);
  for (let index = 0; index < tasks.length; index++) {
    const value = await tasks[index];
    if (accept(value)) return { value, index };
  }
  return null;
}
