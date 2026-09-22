import { IncomingHomologService } from './incoming-homolog.service';
import { getCurrentOwner } from '../owner/owner-context';

describe('IncomingHomologService.revertConversion (CT multi-owner)', () => {
  const sessionId = 'sess-1';

  const sessionRepo = {
    findById: jest.fn(),
    revertConverted: jest.fn(),
  };
  const stockRepo = {
    findById: jest.fn(),
    deleteById: jest.fn(),
  };
  const reservaRepo = {
    deleteByStockId: jest.fn(),
  };
  const transitLineRepo = {
    incrementRemainingQuantity: jest.fn(),
    findByRemainingQuantityGreaterThanZero: jest.fn(),
    findByLotId: jest.fn(),
  };
  const transitLotRepo = {
    findById: jest.fn(),
    findOpenLots: jest.fn(),
  };

  function makeService() {
    return new IncomingHomologService(
      {} as any,
      {} as any,
      sessionRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      stockRepo as any,
      reservaRepo as any,
      {} as any,
      {} as any,
      transitLineRepo as any,
      transitLotRepo as any,
      {} as any,
    );
  }

  function convertedSession(overrides: Record<string, unknown> = {}) {
    return {
      _id: { toString: () => sessionId },
      status: 'converted',
      ship_round_id: null,
      units: [
        { status: 'verified', transit_line_id: 'tl-1', sent_unit_key: 'u1' },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    transitLineRepo.incrementRemainingQuantity.mockResolvedValue(undefined);
    transitLineRepo.findByRemainingQuantityGreaterThanZero.mockResolvedValue(
      [],
    );
    transitLotRepo.findOpenLots.mockResolvedValue([]);
    sessionRepo.revertConverted.mockResolvedValue(
      convertedSession({
        status: 'in_progress',
        created_stock_ids: [],
        created_stocks: [],
      }),
    );
    stockRepo.deleteById.mockResolvedValue(true);
    reservaRepo.deleteByStockId.mockResolvedValue(undefined);
  });

  it('created_stocks mixto borra stock bajo pablo y esteban', async () => {
    sessionRepo.findById.mockResolvedValue(
      convertedSession({
        created_stock_ids: ['stock-pablo', 'stock-esteban'],
        created_stocks: [
          { stock_id: 'stock-pablo', owner: 'pablo' },
          { stock_id: 'stock-esteban', owner: 'esteban' },
        ],
      }),
    );
    const findOwners: string[] = [];
    const deleteOwners: string[] = [];
    stockRepo.findById.mockImplementation(async (id: string) => {
      findOwners.push(getCurrentOwner());
      return { _id: id, card_state: 'disponible' };
    });
    stockRepo.deleteById.mockImplementation(async () => {
      deleteOwners.push(getCurrentOwner());
      return true;
    });

    await makeService().revertConversion(sessionId);

    expect(findOwners).toEqual(['pablo', 'esteban']);
    expect(deleteOwners).toEqual(['pablo', 'esteban']);
    expect(stockRepo.deleteById).toHaveBeenCalledWith('stock-pablo');
    expect(stockRepo.deleteById).toHaveBeenCalledWith('stock-esteban');
    expect(transitLineRepo.incrementRemainingQuantity).toHaveBeenCalledWith(
      'tl-1',
      1,
    );
  });

  it('solo created_stock_ids (legacy) borra todo bajo pablo', async () => {
    sessionRepo.findById.mockResolvedValue(
      convertedSession({
        created_stock_ids: ['stock-a', 'stock-b'],
        created_stocks: [],
      }),
    );
    const findOwners: string[] = [];
    const deleteOwners: string[] = [];
    stockRepo.findById.mockImplementation(async (id: string) => {
      findOwners.push(getCurrentOwner());
      return { _id: id, card_state: 'disponible' };
    });
    stockRepo.deleteById.mockImplementation(async () => {
      deleteOwners.push(getCurrentOwner());
      return true;
    });

    await makeService().revertConversion(sessionId);

    expect(findOwners).toEqual(['pablo', 'pablo']);
    expect(deleteOwners).toEqual(['pablo', 'pablo']);
    expect(stockRepo.deleteById).toHaveBeenCalledWith('stock-a');
    expect(stockRepo.deleteById).toHaveBeenCalledWith('stock-b');
  });
});
