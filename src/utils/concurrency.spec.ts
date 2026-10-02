import { firstAcceptedInOrder, mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('conserva el orden de entrada aunque terminen desordenadas', async () => {
    const delays = [30, 5, 20, 1, 10];
    const out = await mapWithConcurrency(delays, 2, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(['0:30', '1:5', '2:20', '3:1', '4:10']);
  });

  it('nunca supera el límite de promesas en vuelo', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
      },
    );
    expect(peak).toBe(3);
  });

  it('lista vacía → [] sin invocar fn', async () => {
    const fn = jest.fn();
    await expect(mapWithConcurrency([], 4, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('propaga el primer error', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('tras el primer rechazo no arranca elementos nuevos', async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (n) => {
        started.push(n);
        if (n === 0) throw new Error('boom');
        await new Promise((r) => setTimeout(r, 10));
        return n;
      }),
    ).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 30));
    expect(started).toEqual([0, 1]);
  });

  it('límite inválido (0) se trata como 1', async () => {
    const out = await mapWithConcurrency([1, 2], 0, async (n) => n * 2);
    expect(out).toEqual([2, 4]);
  });
});

describe('firstAcceptedInOrder', () => {
  const delayed = <T>(ms: number, value: T) =>
    new Promise<T>((r) => setTimeout(() => r(value), ms));
  const failing = (ms: number, msg: string) =>
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(msg)), ms),
    );

  it('gana el primero en orden aunque otro termine antes', async () => {
    const out = await firstAcceptedInOrder([
      delayed(20, null),
      delayed(15, 'b'),
      delayed(1, 'c'),
    ]);
    expect(out).toEqual({ value: 'b', index: 1 });
  });

  it('ignora errores posteriores al primer acierto (sin unhandled rejection)', async () => {
    const out = await firstAcceptedInOrder([
      delayed(5, 'a'),
      failing(1, 'later'),
    ]);
    expect(out).toEqual({ value: 'a', index: 0 });
  });

  it('propaga el error de una tarea anterior al primer acierto', async () => {
    await expect(
      firstAcceptedInOrder([
        delayed(1, null),
        failing(5, 'x'),
        delayed(1, 'c'),
      ]),
    ).rejects.toThrow('x');
  });

  it('null si ninguna es aceptada; respeta el predicado', async () => {
    await expect(firstAcceptedInOrder([delayed(1, 0)])).resolves.toBeNull();
    await expect(
      firstAcceptedInOrder([delayed(1, false), delayed(1, true)], (v) => v),
    ).resolves.toEqual({ value: true, index: 1 });
  });
});
