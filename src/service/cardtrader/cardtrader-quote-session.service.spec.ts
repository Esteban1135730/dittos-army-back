import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CardTraderQuoteSessionService } from './cardtrader-quote-session.service';
import { CardtraderQuoteSessionRepository } from '../../repository/cardtrader-quote-session.repository';

const SESSION_ID = '507f1f77bcf86cd799439011';

function makeDoc(over: Record<string, unknown> = {}) {
  const lines = [
    {
      index: 0,
      name: 'Shroomish',
      expansion: 'Generations',
      collector_number: 'RC2',
      language_label: 'Inglés',
      condition_label: 'Perfecto',
      resolve: {
        status: 'matched',
        blueprint_id: 99,
        expansion_id: 1577,
        candidates: [
          { blueprint_id: 99, expansion_id: 1577, name: 'Shroomish' },
        ],
      },
      selected_blueprint: {
        blueprint_id: 99,
        expansion_id: 1577,
        expansion_name: 'Generations',
        name: 'Shroomish',
        collector_number: 'RC2',
        image_url: null,
      },
      line_status: 'picked',
    },
  ];
  const state: Record<string, unknown> = {
    _id: SESSION_ID,
    status: 'in_progress',
    source: 'whatsapp',
    raw_paste: 'Hola…',
    active_index: 0,
    lines,
    createdAt: new Date('2026-08-18T00:00:00.000Z'),
    updatedAt: new Date('2026-08-18T00:00:00.000Z'),
    ...over,
  };
  if (!state.lines) state.lines = lines;
  const doc = {
    ...state,
    lines: state.lines as typeof lines,
    markModified: jest.fn(),
    toObject: () => ({ ...state, lines: doc.lines }),
  };
  return doc as unknown as {
    _id: string;
    status: string;
    source: string;
    raw_paste: string;
    active_index: number;
    lines: typeof lines;
    markModified: jest.Mock;
    toObject: () => Record<string, unknown>;
  };
}

describe('CardTraderQuoteSessionService', () => {
  function setup() {
    const repo = {
      create: jest.fn(),
      findById: jest.fn(),
      listByStatus: jest.fn(),
      save: jest.fn(async (d) => d),
    };
    const svc = new CardTraderQuoteSessionService(
      repo as unknown as CardtraderQuoteSessionRepository,
    );
    return { svc, repo };
  }

  const matchedLine = {
    name: 'Shroomish',
    expansion: 'Generations',
    collector_number: 'RC2',
    resolve: {
      status: 'matched',
      blueprint_id: 99,
      expansion_id: 1577,
    },
  };

  it('create persiste sesión y preselecciona matched', async () => {
    const { svc, repo } = setup();
    const created = makeDoc();
    repo.create.mockResolvedValue(created);
    const out = await svc.create({
      source: 'whatsapp',
      raw_paste: 'Hola, deseo cotizar',
      lines: [matchedLine],
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'in_progress',
        source: 'whatsapp',
        active_index: 0,
      }),
    );
    const createdLines = repo.create.mock.calls[0][0].lines;
    expect(createdLines[0].selected_blueprint.blueprint_id).toBe(99);
    expect(out).toMatchObject({ id: SESSION_ID, status: 'in_progress' });
    expect(out.raw_paste).toBe('Hola…');
  });

  it('list omite raw_paste vía toSessionListItem', async () => {
    const { svc, repo } = setup();
    repo.listByStatus.mockResolvedValue([makeDoc()]);
    const out = await svc.list();
    expect(repo.listByStatus).toHaveBeenCalledWith('in_progress', 20);
    expect(out.items[0]).not.toHaveProperty('raw_paste');
    expect(out.items[0]).toMatchObject({
      id: SESSION_ID,
      line_count: 1,
      source: 'whatsapp',
    });
  });

  it('pick no borra resolve.candidates; undo_pick deja selected null', async () => {
    const { svc, repo } = setup();
    const doc = makeDoc({
      lines: [
        {
          index: 0,
          name: 'Pikachu',
          expansion: 'Crown Zenith',
          collector_number: 'GG30',
          resolve: {
            status: 'ambiguous',
            candidates: [
              { blueprint_id: 1, expansion_id: 2, name: 'A' },
              { blueprint_id: 3, expansion_id: 2, name: 'B' },
            ],
          },
          selected_blueprint: null,
          line_status: 'pending',
        },
      ],
    });
    repo.findById.mockResolvedValue(doc);
    await svc.patchLine(SESSION_ID, '0', {
      action: 'pick',
      blueprint_id: 1,
      expansion_id: 2,
      name: 'A',
    });
    expect(doc.lines[0].selected_blueprint?.blueprint_id).toBe(1);
    expect(doc.lines[0].line_status).toBe('picked');
    expect(
      (doc.lines[0].resolve as { candidates: unknown[] }).candidates,
    ).toHaveLength(2);
    expect(doc.markModified).toHaveBeenCalledWith('lines');

    await svc.patchLine(SESSION_ID, '0', { action: 'undo_pick' });
    expect(doc.lines[0].selected_blueprint).toBeNull();
    expect(doc.lines[0].line_status).toBe('pending');
    expect(
      (doc.lines[0].resolve as { candidates: unknown[] }).candidates,
    ).toHaveLength(2);
  });

  it('skip y active_index; 404 línea; 400 status desde cancelled', async () => {
    const { svc, repo } = setup();
    const doc = makeDoc();
    repo.findById.mockResolvedValue(doc);
    await svc.patchLine(SESSION_ID, '0', { action: 'skip' });
    expect(doc.lines[0].line_status).toBe('skipped');
    await svc.patchSession(SESSION_ID, { active_index: 0 });
    expect(doc.active_index).toBe(0);
    await expect(
      svc.patchLine(SESSION_ID, '9', { action: 'skip' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    doc.status = 'cancelled';
    await expect(
      svc.patchSession(SESSION_ID, { status: 'completed' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getById 400 id inválido y 404 missing', async () => {
    const { svc, repo } = setup();
    await expect(svc.getById('nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    repo.findById.mockResolvedValue(null);
    await expect(svc.getById(SESSION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
