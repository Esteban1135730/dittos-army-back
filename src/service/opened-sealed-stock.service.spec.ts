import { BadRequestException } from '@nestjs/common';
import {
  allocateUnityCosts,
  OpenedSealedStockService,
} from './opened-sealed-stock.service';
import { StockRepository } from '../repository/stock.repository';

describe('allocateUnityCosts', () => {
  it('reparte 10 en 3 como 4+3+3', () => {
    expect(allocateUnityCosts(10, 3)).toEqual([4, 3, 3]);
  });

  it('reparte 7 en 3 como 3+2+2', () => {
    expect(allocateUnityCosts(7, 3)).toEqual([3, 2, 2]);
  });

  it('mantiene la suma igual a assignable', () => {
    for (const assignable of [0, 1, 100, 1000]) {
      for (const n of [1, 2, 5, 11]) {
        const parts = allocateUnityCosts(assignable, n);
        const sum = parts.reduce((a, b) => a + b, 0);
        expect(sum).toBe(assignable);
      }
    }
  });

  it('lanza si n <= 0', () => {
    expect(() => allocateUnityCosts(10, 0)).toThrow(BadRequestException);
  });
});

describe('OpenedSealedStockService.createFromOpenedSealed', () => {
  function makeRepo() {
    const createMany = jest.fn().mockResolvedValue([]);
    const repo = { createMany } as unknown as StockRepository;
    return { repo, createMany };
  }

  it('crea líneas con COP repartido y notas', async () => {
    const { repo, createMany } = makeRepo();
    const svc = new OpenedSealedStockService(repo);
    const res = await svc.createFromOpenedSealed({
      product_cost_cop: 1000,
      source_label: 'Test sobres',
      lines: [
        {
          card_id: 'c1',
          card_name: 'Uno',
          language: 'es',
          image_url: '',
        },
        {
          card_id: 'c2',
          card_name: 'Dos',
          language: 'es',
        },
      ],
    });
    expect(res.created_count).toBe(2);
    expect(res.allocatable_total_cop).toBe(700);
    expect(res.lines).toEqual([
      { card_id: 'c1', unity_cost_cop: 350 },
      { card_id: 'c2', unity_cost_cop: 350 },
    ]);
    expect(createMany).toHaveBeenCalledTimes(1);
    const dtos = createMany.mock.calls[0][0];
    expect(dtos).toHaveLength(2);
    expect(dtos[0].unity_cost + dtos[1].unity_cost).toBe(700);
    expect(dtos[0].shipment).toBe(0);
    expect(dtos[0].cards_in_shipmet).toBe(1);
    expect(dtos[0].currency).toBe('COP');
    expect(dtos[0].incoming_notes).toContain('Apertura sellado');
    expect(dtos[0].incoming_notes).toContain('Test sobres');
    expect(dtos[0].tags).toBeUndefined();
    expect(dtos[1].tags).toBeUndefined();
  });

  it('rechaza product_cost_cop no entero', async () => {
    const { repo } = makeRepo();
    const svc = new OpenedSealedStockService(repo);
    await expect(
      svc.createFromOpenedSealed({
        product_cost_cop: 10.5,
        lines: [{ card_id: 'c', card_name: 'n', language: 'es' }],
      }),
    ).rejects.toThrow(/product_cost_cop debe ser un entero positivo/);
  });
});
